import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PhaseFieldsSavedEvent } from '../../common/events/solicitation-events';
import { FlowExecutionEntity, KanbanPhaseEntity, SolicitationEntity } from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import {
  DEFAULT_FLOW_SUBMISSION_QUEUE,
  type FlowContextJob,
  type FlowResumePhaseFieldsJob,
} from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import { buildFlowFieldValues } from './lib/flow-field-values';
import type { FlowExecutionContext } from './types/flow.types';
import { phaseApproverMetadata } from '../kanban-phases/phase-people';

/**
 * Reage a `solicitations.phase_fields_saved` (emitido por SolicitationsService.
 * savePhaseFieldValues, sem que o módulo de Solicitations precise saber nada sobre
 * Flows) e dispara qualquer fluxo ativo com o gatilho `trigger_phase_field_saved`
 * para o formulário e a fase que tiveram campos salvos.
 *
 * Ao contrário do anexo de submissão (onde não dá pra saber de qual campo do
 * formulário a imagem veio), aqui a fase é conhecida com certeza no momento do
 * evento — então o filtro opcional `trigger.data.phaseId` é aplicado de verdade,
 * não apenas declarado.
 */
@Injectable()
export class FlowsPhaseFieldsListener {
  private readonly logger = new Logger(FlowsPhaseFieldsListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(KanbanPhaseEntity)
    private readonly kanbanPhasesRepo: Repository<KanbanPhaseEntity>,
    @InjectRepository(FlowExecutionEntity)
    private readonly executionsRepo: Repository<FlowExecutionEntity>,
  ) {}

  @OnEvent('solicitations.phase_fields_saved')
  async handlePhaseFieldsSaved(event: PhaseFieldsSavedEvent): Promise<void> {
    try {
      const solicitation = await this.solicitationsRepo.findOne({
        where: { id: event.solicitationId },
        relations: ['form', 'submission', 'submission.items', 'assignee', 'createdByUser'],
      });
      if (!solicitation?.formId) return;

      const phase = await this.kanbanPhasesRepo.findOne({ where: { id: event.phaseId } });
      const metadata: Record<string, unknown> = { phaseId: event.phaseId };
      if (phase) {
        metadata.phaseLabel = phase.label;
        // Lista completa (perfis + usuários), o primeiro perfil para fluxos antigos e a regra.
        Object.assign(metadata, phaseApproverMetadata(phase));
      }

      // Dois mecanismos independentes reagem ao mesmo evento: dispara fluxos NOVOS cujo
      // próprio gatilho é trigger_phase_field_saved, e retoma fluxos já em andamento que
      // pausaram esperando exatamente esta fase (action_wait_for_phase_fields) — um fluxo
      // iniciado por outro gatilho (ex.: "Anexo enviado") nunca aparece na busca de gatilhos
      // abaixo, então a retomada não pode depender dela ter encontrado algo.
      const entries = await this.flowsService.findActiveFlowEntries('trigger_phase_field_saved', {
        formId: solicitation.formId,
        phaseId: event.phaseId,
      });
      if (entries.length > 0) {
        await this.dispatchFlows(entries, solicitation, metadata);
      }

      await this.resumePausedExecutions(solicitation, event.phaseId, metadata);
    } catch (err) {
      this.logger.error(
        `Flow phase-fields listener failed for solicitation ${event.solicitationId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private async resumePausedExecutions(
    solicitation: SolicitationEntity,
    phaseId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const paused = await this.executionsRepo.find({
      where: { solicitationId: solicitation.id, status: 'waiting_phase_fields', waitingPhaseId: phaseId },
    });
    if (paused.length === 0) return;

    const queue = this.getQueueName();
    for (const execution of paused) {
      const job: FlowResumePhaseFieldsJob = {
        kind: 'flow_resume_phase_fields',
        executionId: execution.id,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `flow_resume_phase_fields:${execution.id}:${phaseId}`,
        headers: { event: 'flow_resume_phase_fields' },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Resuming flow execution ${execution.id} inline for solicitation ${solicitation.id}.`,
      );
      await this.flowsService.resumePausedPhaseFieldsExecution(execution.id, metadata);
    }
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    solicitation: SolicitationEntity,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const queue = this.getQueueName();
    const fields = this.buildFieldsFromSubmission(solicitation);

    for (const { flow, entryNode } of entries) {
      const context: FlowExecutionContext = {
        eventName: 'solicitations.phase_fields_saved',
        entryNodeId: entryNode.id,
        submission: solicitation.submission ?? undefined,
        form: solicitation.form ?? undefined,
        fields,
        solicitation,
        metadata,
      };

      const job: FlowContextJob = {
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_phase_field_saved',
        entryNodeId: entryNode.id,
        eventName: 'solicitations.phase_fields_saved',
        submissionId: solicitation.submissionId ?? null,
        solicitationId: solicitation.id,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `solicitations.phase_fields_saved:${solicitation.id}:${metadata.phaseId}:${flow.id}`,
        headers: { event: 'solicitations.phase_fields_saved', flowId: flow.id },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Executing flow ${flow.id} inline for solicitation ${solicitation.id}.`,
      );
      await this.flowsService.executeFlowWithContext(flow, context);
    }
  }

  private buildFieldsFromSubmission(solicitation: SolicitationEntity): Record<string, unknown> {
    return buildFlowFieldValues(solicitation.submission?.items);
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
