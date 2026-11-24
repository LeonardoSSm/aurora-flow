import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ApprovalApprovedEvent, ApprovalRejectedEvent } from '../../common/events/approval-events';
import type { AttachmentUploadedEvent } from '../../common/events/attachment-events';
import type {
  PhaseChangedEvent,
  PhaseFieldsSavedEvent,
  SolicitationAssigneeChangedEvent,
  SolicitationCreatedEvent,
} from '../../common/events/solicitation-events';
import {
  AttachmentEntity,
  FormFieldEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  SolicitationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { isFirstPhase, requiredOpeningFileCount } from '../kanban-phases/phase-approval-automation';
import { SolicitationsService } from './solicitations.service';

/**
 * A fase cuida da própria aprovação, sem fluxo (ver kanban-phases/phase-approval-automation.ts):
 * - pede a aprovação ao entrar ('on_enter') ou com o formulário da fase completo ('on_complete');
 * - decidida, aplica a regra da fase (próxima fase, fase anterior ou encerrar).
 * Nenhuma falha aqui derruba quem emitiu o evento: o botão "Solicitar aprovação" continua valendo.
 */
@Injectable()
export class PhaseApprovalAutomationListener {
  private readonly logger = new Logger(PhaseApprovalAutomationListener.name);

  constructor(
    private readonly solicitationsService: SolicitationsService,
    @InjectRepository(KanbanPhaseEntity)
    private readonly phasesRepo: Repository<KanbanPhaseEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(KanbanPhaseFieldEntity)
    private readonly phaseFieldsRepo: Repository<KanbanPhaseFieldEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepo: Repository<SubmissionEntity>,
    @InjectRepository(SubmissionItemEntity)
    private readonly submissionItemsRepo: Repository<SubmissionItemEntity>,
    @InjectRepository(FormFieldEntity)
    private readonly formFieldsRepo: Repository<FormFieldEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
  ) {}

  /** Card novo sem fase gravada está na 1ª fase. O que já nasce numa fase vem por `phase_changed`. */
  @OnEvent('solicitations.created')
  async handleCreated(event: SolicitationCreatedEvent): Promise<void> {
    await this.guard(`solicitação ${event.solicitationId} criada`, async () => {
      if (!event.formId) return;
      const solicitation = await this.solicitationsRepo.findOne({ where: { id: event.solicitationId } });
      if (!solicitation || solicitation.currentPhaseId) return;
      const phases = await this.phasesRepo.find({ where: { formId: event.formId }, order: { order: 'ASC' } });
      if (phases[0]) await this.onPhaseEntered(solicitation, phases[0], phases);
    });
  }

  @OnEvent('solicitations.phase_changed')
  async handlePhaseChanged(event: PhaseChangedEvent): Promise<void> {
    await this.guard(`solicitação ${event.solicitationId} entrou na fase ${event.toPhaseId}`, async () => {
      const phase = await this.phasesRepo.findOne({ where: { id: event.toPhaseId } });
      if (!phase) return;
      const solicitation = await this.solicitationsRepo.findOne({ where: { id: event.solicitationId } });
      if (!solicitation) return;
      const phases = await this.phasesRepo.find({ where: { formId: phase.formId } });
      await this.onPhaseEntered(solicitation, phase, phases);
    });
  }

  /** Salvar o formulário da fase já exige os obrigatórios: salvou, está completo. */
  @OnEvent('solicitations.phase_fields_saved')
  async handlePhaseFieldsSaved(event: PhaseFieldsSavedEvent): Promise<void> {
    await this.guard(`campos da fase ${event.phaseId} salvos`, async () => {
      const phase = await this.phasesRepo.findOne({ where: { id: event.phaseId } });
      if (phase?.requiresApproval && phase.approvalRequest === 'on_complete') {
        await this.solicitationsService.requestPhaseApprovalAutomatically(event.solicitationId, phase.id);
      }
      // Já aprovada e parada por campo obrigatório vazio: preencheram, segue.
      await this.solicitationsService.resumeApprovedAdvance(event.solicitationId);
    });
  }

  /** Já aprovada e parada por falta de responsável: atribuíram, segue. */
  @OnEvent('solicitations.assignee_changed')
  async handleAssigneeChanged(event: SolicitationAssigneeChangedEvent): Promise<void> {
    if (!event.toAssigneeId) return;
    await this.guard(`responsável da solicitação ${event.solicitationId} definido`, () =>
      this.solicitationsService.resumeApprovedAdvance(event.solicitationId),
    );
  }

  /** Os arquivos do formulário de abertura chegam depois do envio: cada um pode completar a 1ª fase. */
  @OnEvent('attachments.uploaded')
  async handleAttachmentUploaded(event: AttachmentUploadedEvent): Promise<void> {
    if (!event.submissionId) return;
    const submissionId = event.submissionId;
    await this.guard(`anexo ${event.attachmentId}`, async () => {
      const solicitation = await this.solicitationsRepo.findOne({ where: { submissionId } });
      if (!solicitation?.formId) return;
      const phases = await this.phasesRepo.find({ where: { formId: solicitation.formId } });
      const phase = solicitation.currentPhaseId
        ? phases.find((candidate) => candidate.id === solicitation.currentPhaseId)
        : [...phases].sort((a, b) => a.order - b.order)[0];
      if (!phase?.requiresApproval || phase.approvalRequest !== 'on_complete') return;
      if (!isFirstPhase(phases, phase.id)) return;
      if (await this.openingFormComplete(submissionId)) {
        await this.solicitationsService.requestPhaseApprovalAutomatically(solicitation.id, phase.id);
      }
    });
  }

  @OnEvent('approvals.approved')
  @OnEvent('approvals.rejected')
  async handleApprovalDecided(event: ApprovalApprovedEvent | ApprovalRejectedEvent): Promise<void> {
    await this.guard(`aprovação ${event.approvalId} decidida`, () =>
      this.solicitationsService.applyPhaseApprovalOutcome(event.approvalId, Number(event.flowDepth ?? 0)),
    );
  }

  private async onPhaseEntered(
    solicitation: SolicitationEntity,
    phase: KanbanPhaseEntity,
    phases: KanbanPhaseEntity[],
  ): Promise<void> {
    if (!phase.requiresApproval || phase.approvalRequest === 'manual') return;
    if (phase.approvalRequest === 'on_complete' && !(await this.completeOnEntry(solicitation, phase, phases))) {
      return;
    }
    await this.solicitationsService.requestPhaseApprovalAutomatically(solicitation.id, phase.id);
  }

  /**
   * Formulário da fase já completo ao entrar: na 1ª, o de abertura com os arquivos obrigatórios
   * chegados; nas outras, só quando a fase não tem campo nenhum (com campos, espera salvarem).
   */
  private async completeOnEntry(
    solicitation: SolicitationEntity,
    phase: KanbanPhaseEntity,
    phases: KanbanPhaseEntity[],
  ): Promise<boolean> {
    if (isFirstPhase(phases, phase.id)) {
      return solicitation.submissionId ? this.openingFormComplete(solicitation.submissionId) : true;
    }
    return (await this.phaseFieldsRepo.count({ where: { phaseId: phase.id } })) === 0;
  }

  private async openingFormComplete(submissionId: string): Promise<boolean> {
    const submission = await this.submissionsRepo.findOne({ where: { id: submissionId } });
    if (!submission) return true;
    const [fields, items, attachments] = await Promise.all([
      this.formFieldsRepo.find({ where: { formVersionId: submission.formVersionId } }),
      this.submissionItemsRepo.find({ where: { submissionId } }),
      this.attachmentsRepo.count({ where: { submissionId } }),
    ]);
    const answered = new Set(items.map((item) => item.fieldId));
    return attachments >= requiredOpeningFileCount(fields, answered);
  }

  private async guard(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.warn(
        `Aprovação automática da fase falhou (${what}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
