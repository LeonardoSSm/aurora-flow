import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitationEntity } from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowContextJob } from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import { buildFlowFieldValues } from './lib/flow-field-values';
import type { FlowExecutionContext, FlowTriggerNodeType } from './types/flow.types';

type SlaFlowEvent = {
  solicitationId: string;
};

/** Prazo da fase (PhaseSlaService): mesmo gatilho de SLA, com "Qual prazo" = da fase. */
type PhaseSlaFlowEvent = SlaFlowEvent & { phaseId: string; phaseLabel: string; enteredAt: string };

@Injectable()
export class FlowsSlaListener {
  private readonly logger = new Logger(FlowsSlaListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
  ) {}

  @OnEvent('solicitations.sla.warning')
  async handleSlaWarning(event: SlaFlowEvent): Promise<void> {
    await this.handleSlaEvent(event, 'trigger_sla_warning', 'solicitations.sla.warning');
  }

  @OnEvent('solicitations.sla.breached')
  async handleSlaBreached(event: SlaFlowEvent): Promise<void> {
    await this.handleSlaEvent(event, 'trigger_sla_breached', 'solicitations.sla.breached');
  }

  @OnEvent('solicitations.phase_sla.warning')
  async handlePhaseSlaWarning(event: PhaseSlaFlowEvent): Promise<void> {
    await this.handleSlaEvent(event, 'trigger_sla_warning', 'solicitations.phase_sla.warning', event);
  }

  @OnEvent('solicitations.phase_sla.breached')
  async handlePhaseSlaBreached(event: PhaseSlaFlowEvent): Promise<void> {
    await this.handleSlaEvent(event, 'trigger_sla_breached', 'solicitations.phase_sla.breached', event);
  }

  private async handleSlaEvent(
    event: SlaFlowEvent,
    triggerType: FlowTriggerNodeType,
    eventName: string,
    phase?: PhaseSlaFlowEvent,
  ): Promise<void> {
    try {
      const solicitation = await this.solicitationsRepo.findOne({
        where: { id: event.solicitationId },
        relations: ['form', 'submission', 'submission.items', 'assignee', 'createdByUser'],
      });
      if (!solicitation) {
        this.logger.warn(`Solicitation ${event.solicitationId} not found for SLA flow event.`);
        return;
      }

      const entries = await this.flowsService.findActiveFlowEntries(triggerType, {
        formId: solicitation.formId,
        ...(phase ? { slaScope: 'phase' as const, phaseId: phase.phaseId } : {}),
      });

      await this.dispatchFlows(
        entries,
        triggerType,
        eventName,
        solicitation,
        phase
          ? { slaScope: 'phase', phaseId: phase.phaseId, phaseLabel: phase.phaseLabel, phaseEnteredAt: phase.enteredAt }
          : {},
      );
    } catch (err) {
      this.logger.error(
        `Flow SLA listener failed for ${event.solicitationId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    triggerType: FlowTriggerNodeType,
    eventName: string,
    solicitation: SolicitationEntity,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    const queue = this.getQueueName();
    const metadata = { solicitationId: solicitation.id, ...extraMetadata };

    for (const { flow, entryNode } of entries) {
      const context = {
        ...this.buildContext(eventName, solicitation, metadata),
        entryNodeId: entryNode.id,
      };
      const job: FlowContextJob = {
        kind: 'flow_context',
        flowId: flow.id,
        triggerType,
        entryNodeId: entryNode.id,
        eventName,
        solicitationId: solicitation.id,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        // Prazo da fase: o mesmo card pode vencer em outra fase (ou de novo na mesma) depois.
        messageId: [eventName, solicitation.id, flow.id, extraMetadata.phaseId, extraMetadata.phaseEnteredAt]
          .filter(Boolean)
          .join(':'),
        headers: { event: eventName, flowId: flow.id },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Executing flow ${flow.id} inline for SLA event ${eventName}.`,
      );
      await this.flowsService.executeFlowWithContext(flow, context);
    }
  }

  private buildContext(
    eventName: string,
    solicitation: SolicitationEntity,
    metadata: Record<string, unknown>,
  ): FlowExecutionContext {
    const fields = buildFlowFieldValues(solicitation.submission?.items);

    return {
      eventName,
      solicitation,
      submission: solicitation.submission ?? undefined,
      form: solicitation.form ?? undefined,
      fields,
      metadata,
    };
  }

  private getQueueName(): string {
    return this.configService.get<string>(
      'RABBITMQ_FLOW_SUBMISSION_QUEUE',
      DEFAULT_FLOW_SUBMISSION_QUEUE,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
