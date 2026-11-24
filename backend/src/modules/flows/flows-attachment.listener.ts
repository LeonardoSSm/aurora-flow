import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AttachmentUploadedEvent } from '../../common/events/attachment-events';
import {
  AttachmentEntity,
  KanbanPhaseEntity,
  SolicitationEntity,
  SubmissionEntity,
} from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowContextJob } from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import { buildFlowFieldValues } from './lib/flow-field-values';
import type { FlowExecutionContext } from './types/flow.types';
import { phaseApproverMetadata } from '../kanban-phases/phase-people';

/**
 * Reage a `attachments.uploaded` (emitido por AttachmentsService.upload, sem que o
 * módulo de Attachments precise saber nada sobre Flows) e dispara qualquer fluxo
 * ativo com o gatilho `trigger_attachment_uploaded` para o formulário da submissão.
 *
 * Resolve aqui — uma única vez, antes de despachar — a fase efetiva da solicitação
 * (se já existir) e o perfil aprovador dela, deixando isso disponível em
 * `ctx.metadata.{phaseId,phaseLabel,approverRoleCode}` para os nós do fluxo
 * (ex.: action_create_approval com scope: 'phase' e approverSourceMode: 'phase_role')
 * usarem sem precisar saber nada de Kanban/fases — só o gatilho conhece esse domínio.
 */
@Injectable()
export class FlowsAttachmentListener {
  private readonly logger = new Logger(FlowsAttachmentListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepo: Repository<SubmissionEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(KanbanPhaseEntity)
    private readonly kanbanPhasesRepo: Repository<KanbanPhaseEntity>,
  ) {}

  @OnEvent('attachments.uploaded')
  async handleAttachmentUploaded(event: AttachmentUploadedEvent): Promise<void> {
    try {
      if (!event.submissionId) return;

      const attachment = await this.attachmentsRepo.findOne({ where: { id: event.attachmentId } });
      if (!attachment?.mimeType.startsWith('image/')) return;

      const submission = await this.submissionsRepo.findOne({
        where: { id: event.submissionId },
        relations: ['form', 'items'],
      });
      if (!submission) return;

      const entries = await this.flowsService.findActiveFlowEntries('trigger_attachment_uploaded', {
        formId: submission.formId,
      });
      if (entries.length === 0) return;

      const solicitation = await this.solicitationsRepo.findOne({
        where: { submissionId: event.submissionId },
        relations: ['form', 'submission', 'submission.items', 'assignee', 'createdByUser'],
      });

      const metadata: Record<string, unknown> = { attachmentId: attachment.id };
      if (solicitation?.formId) {
        const phase = await this.resolveEffectivePhase(solicitation.formId, solicitation.currentPhaseId);
        if (phase) {
          metadata.phaseId = phase.id;
          metadata.phaseLabel = phase.label;
          // Lista completa (perfis + usuários) e, para fluxos antigos, o primeiro perfil.
          Object.assign(metadata, phaseApproverMetadata(phase));

          // Vincula o anexo à solicitação/fase agora que ambas existem — sem isso, a tela
          // do Supervisor (GET /solicitations/:id/attachments, filtrado por phase_id) nunca
          // encontraria esta foto.
          if (attachment.solicitationId !== solicitation.id || attachment.phaseId !== phase.id) {
            attachment.solicitationId = solicitation.id;
            attachment.phaseId = phase.id;
            await this.attachmentsRepo.save(attachment);
          }
        }
      }

      await this.dispatchFlows(entries, submission, solicitation ?? undefined, attachment, metadata);
    } catch (err) {
      this.logger.error(
        `Flow attachment listener failed for attachment ${event.attachmentId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private async resolveEffectivePhase(
    formId: string,
    currentPhaseId: string | null,
  ): Promise<KanbanPhaseEntity | null> {
    if (currentPhaseId) {
      const current = await this.kanbanPhasesRepo.findOne({ where: { id: currentPhaseId } });
      if (current) return current;
    }
    const phases = await this.kanbanPhasesRepo.find({ where: { formId }, order: { order: 'ASC' } });
    return phases[0] ?? null;
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    submission: SubmissionEntity,
    solicitation: SolicitationEntity | undefined,
    attachment: AttachmentEntity,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const queue = this.getQueueName();
    const fields = this.buildFieldsFromSubmission(submission);

    for (const { flow, entryNode } of entries) {
      const context: FlowExecutionContext = {
        eventName: 'attachments.uploaded',
        entryNodeId: entryNode.id,
        submission,
        form: submission.form,
        fields,
        solicitation,
        attachment,
        metadata,
      };

      const job: FlowContextJob = {
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_attachment_uploaded',
        entryNodeId: entryNode.id,
        eventName: 'attachments.uploaded',
        submissionId: submission.id,
        solicitationId: solicitation?.id ?? null,
        attachmentId: attachment.id,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `attachments.uploaded:${attachment.id}:${flow.id}`,
        headers: { event: 'attachments.uploaded', flowId: flow.id },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Executing flow ${flow.id} inline for attachment ${attachment.id}.`,
      );
      await this.flowsService.executeFlowWithContext(flow, context);
    }
  }

  private buildFieldsFromSubmission(submission: SubmissionEntity): Record<string, unknown> {
    return buildFlowFieldValues(submission.items);
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
