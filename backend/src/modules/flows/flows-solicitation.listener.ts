import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  SolicitationCreatedEvent,
  SolicitationMovedEvent,
} from '../../common/events/solicitation-events';
import { SolicitationEntity } from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowContextJob } from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import { buildFlowFieldValues } from './lib/flow-field-values';
import {
  MAX_FLOW_EVENT_DEPTH,
  type FlowExecutionContext,
  type FlowTriggerNodeType,
} from './types/flow.types';

@Injectable()
export class FlowsSolicitationListener {
  private readonly logger = new Logger(FlowsSolicitationListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
  ) {}

  @OnEvent('solicitations.created')
  async handleSolicitationCreated(event: SolicitationCreatedEvent): Promise<void> {
    await this.handleSolicitationEvent(event, 'trigger_solicitation_created', {
      originType: event.originType,
      formId: event.formId,
      submissionId: event.submissionId,
    });
  }

  @OnEvent('solicitations.moved')
  async handleSolicitationMoved(event: SolicitationMovedEvent): Promise<void> {
    await this.handleSolicitationEvent(event, 'trigger_solicitation_moved', {
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      flowEventDepth: event.flowDepth,
    });
  }

  private async handleSolicitationEvent(
    event: SolicitationCreatedEvent | SolicitationMovedEvent,
    triggerType: FlowTriggerNodeType,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const flowEventDepth = this.getFlowEventDepth(event, metadata);
      if (flowEventDepth >= MAX_FLOW_EVENT_DEPTH) {
        this.logger.warn(
          `Flow event depth limit reached for solicitation ${event.solicitationId}.`,
        );
        return;
      }

      const solicitation = await this.solicitationsRepo.findOne({
        where: { id: event.solicitationId },
        relations: ['form', 'submission', 'submission.items', 'assignee', 'createdByUser'],
      });
      if (!solicitation) {
        this.logger.warn(`Solicitation ${event.solicitationId} not found for flow event.`);
        return;
      }

      const entries = await this.flowsService.findActiveFlowEntries(triggerType, {
        formId: solicitation.formId,
        originType: typeof metadata.originType === 'string' ? metadata.originType : undefined,
      });

      await this.dispatchFlows(
        entries,
        triggerType,
        event.name,
        solicitation,
        event.actorId,
        { ...metadata, flowEventDepth },
        flowEventDepth,
      );
    } catch (err) {
      this.logger.error(
        `Flow solicitation listener failed for ${event.solicitationId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    triggerType: FlowTriggerNodeType,
    eventName: string,
    solicitation: SolicitationEntity,
    actorId: string | null,
    metadata: Record<string, unknown>,
    flowEventDepth: number,
  ): Promise<void> {
    const queue = this.getQueueName();

    for (const { flow, entryNode } of entries) {
      const context = {
        ...this.buildContext(eventName, solicitation, actorId, metadata),
        entryNodeId: entryNode.id,
      };
      const job: FlowContextJob = {
        kind: 'flow_context',
        flowId: flow.id,
        triggerType,
        entryNodeId: entryNode.id,
        eventName,
        solicitationId: solicitation.id,
        actorId,
        flowEventDepth,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `${eventName}:${solicitation.id}:${flow.id}`,
        headers: { event: eventName, flowId: flow.id },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Executing flow ${flow.id} inline for solicitation ${solicitation.id}.`,
      );
      await this.flowsService.executeFlowWithContext(flow, context);
    }
  }

  private buildContext(
    eventName: string,
    solicitation: SolicitationEntity,
    actorId: string | null,
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
      actorId: actorId ?? undefined,
      flowEventDepth: Number(metadata.flowEventDepth ?? 0),
    };
  }

  private getFlowEventDepth(
    event: SolicitationCreatedEvent | SolicitationMovedEvent,
    metadata: Record<string, unknown>,
  ): number {
    const eventDepth = 'flowDepth' in event ? event.flowDepth : undefined;
    const depth = Number(eventDepth ?? metadata.flowEventDepth ?? 0);
    return Number.isFinite(depth) && depth > 0 ? depth : 0;
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
