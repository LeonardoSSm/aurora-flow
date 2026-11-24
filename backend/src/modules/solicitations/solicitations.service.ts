import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { PRODUCT_NAME } from '../../common/constants/product';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { SubmissionStatus } from '../../common/enums/submission-status.enum';
import {
  PhaseChangedEvent,
  PhaseFieldsSavedEvent,
  SolicitationAssigneeChangedEvent,
  SolicitationCreatedEvent,
  SolicitationMovedEvent,
  SolicitationPriorityChangedEvent,
  SolicitationStatusChangedEvent,
} from '../../common/events/solicitation-events';
import {
  ApprovalEntity,
  ApprovalStepEntity,
  FormEntity,
  FormFieldEntity,
  FormVersionEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  RoleEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  SolicitationStandardAnswerEntity,
  SubmissionEntity,
  SubmissionItemEntity,
  UserEntity,
} from '../../database/entities';
import { MovePhaseDto } from './dto/move-phase.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { PhaseFieldValueItemDto, SavePhaseFieldValuesDto } from './dto/save-phase-field-values.dto';
import {
  missingRequiredPhaseFields,
  phaseExitMessage,
} from '../kanban-phases/phase-required-fields';
import { moveBackBarrier, moveBackMessage } from '../kanban-phases/phase-move-back';
import { canSeePhase, normalizePhaseVisibility } from '../kanban-phases/phase-visibility';
import { normalizeCardVisibility } from '../kanban-phases/phase-card-visibility';
import { reachablePhaseFields } from '../kanban-phases/phase-section-flow';
import { normalizeKanbanSettings } from '../kanban-phases/kanban-settings';
import { DEFAULT_CARD_DISPLAY, effectiveCardDisplay } from '../kanban-phases/card-display';
import { CardDisplayService } from '../kanban-phases/card-display.service';
import type { KanbanCardDisplay } from '../../database/entities/kanban-phase.entity';
import {
  computePhaseCalculations,
  normalizePhaseValue,
  phaseFormulaScope,
} from '../kanban-phases/phase-calculations';
import { readSolicitationFormFieldValues } from '../flows/lib/flow-field-values';
import { hasPhaseSla, phaseSlaProgress, warningPercentOf } from '../kanban-phases/phase-sla';
import { effectivePhaseDueAt, phaseEnteredAtOf, recordPhaseChange } from './phase-periods';
import { buildProcessPanel, type ProcessPanelCard, type ProcessPanelDto } from './process-panel';
import { coerceAnswerToNumber } from '../../common/formula/formula.engine';
import { describeScoreRange } from '../../common/formula/score-ranges';
import { pickScoreEntry, scoreEntryCandidates, type ScoreEntryMatch } from './score-entry';
import {
  describePhasePeople,
  isPhasePerson,
  phaseActors,
  phaseApprovers,
  phaseApprovalRule,
} from '../kanban-phases/phase-people';
import { neighborPhase } from '../kanban-phases/phase-approval-automation';
import { SaveStandardAnswersDto } from './dto/save-standard-answers.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { MetricsService } from '../observability/metrics.service';
import { SettingsService } from '../settings/settings.service';
import { CreateSolicitationDto } from './dto/create-solicitation.dto';
import { MoveKanbanCardDto } from './dto/move-kanban-card.dto';
import { QuerySolicitationsDto } from './dto/query-solicitations.dto';
import { UpdateSolicitationAssigneeDto } from './dto/update-solicitation-assignee.dto';
import { UpdateSolicitationPriorityDto } from './dto/update-solicitation-priority.dto';
import { UpdateSolicitationStatusDto } from './dto/update-solicitation-status.dto';
import { extractRequesterContact, type RequesterContact } from '../../common/helpers/requester-contact.helper';
import {
  isTransitionAllowed,
  TERMINAL_SOLICITATION_STATUSES,
  type KanbanBoardDto,
  type KanbanCard,
  type KanbanFormSummary,
} from './solicitation-transitions';
import { ApprovalsService } from '../approvals/approvals.service';
import { ItemOrderFieldService } from '../item-lists/item-order-field.service';
import { UserEmailFieldService } from '../user-email/user-email-field.service';
import {
  createDefaultKanbanPhases,
  DEFAULT_KANBAN_PHASES,
  DEFAULT_KANBAN_STAGES,
  defaultStageForStatus,
  DONE_STAGE_STATUSES,
  STATUS_FOR_DEFAULT_STAGE,
  type DefaultKanbanStage,
} from '../kanban-phases/default-kanban-phases';
import { FlowMailerService } from '../flows/mailer/flow-mailer.service';
import { UserNoticeService, solicitationLink } from '../notifications/user-notice.service';
import { PermissionsService } from '../roles/permissions.service';
import { ProcessAccessService } from '../access/process-access.service';
import { CardFilterService } from '../access/card-filter.service';
import { SlaCalculatorService } from './sla-calculator.service';
import {
  buildStatusChangeEmail,
  statusLabel,
} from './templates/status-change-email.template';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  buildHandoffAnswers,
  type HandoffMapping,
  type HandoffSkippedField,
  type HandoffSourceAnswer,
} from './process-handoff.answers';

/** Resultado de createFromHandoff — o nó do fluxo mostra o que foi e o que ficou para trás. */
export interface HandoffResult {
  solicitation: SolicitationEntity;
  /** O card já tinha sido encaminhado para este processo: é o mesmo de antes. */
  reused: boolean;
  copiedFields: string[];
  skipped: HandoffSkippedField[];
  missingRequired: Array<{ fieldCode: string; label: string }>;
  attachmentsCopied: number;
  attachmentsFailed: string[];
}

export interface HandoffLinkDto {
  id: string;
  title: string;
  formId: string | null;
  formName: string | null;
  status: SolicitationStatus;
  createdAt: Date;
}

export interface HandoffLinksDto {
  source: HandoffLinkDto | null;
  forwarded: HandoffLinkDto[];
}

function emptyHandoffReport(): Omit<HandoffResult, 'solicitation' | 'reused'> {
  return { copiedFields: [], skipped: [], missingRequired: [], attachmentsCopied: 0, attachmentsFailed: [] };
}

function metadataText(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

type HistoryInput = {
  solicitationId: string;
  eventType: SolicitationHistoryEventType;
  actorId?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SolicitationActor = JwtPayload | null;

export type SolicitationWithContact = SolicitationEntity & { requesterContact: RequesterContact };

type FlowMutationOptions = {
  flowEventDepth?: number;
  /** Só moveStage: as colunas padrão são movimento livre, sem o grafo de transição de status. */
  skipTransitionCheck?: boolean;
};

/** Soma dos valores dos cards (os sem valor não contam), em centavos para não acumular erro. */
function sumCardValues(cards: KanbanCard[]): number {
  const cents = cards.reduce((sum, card) => sum + Math.round((card.value ?? 0) * 100), 0);
  return cents / 100;
}

/** Quantas regras o filtro de cards da fase tem (0 = sem filtro). */
function cardFilterRulesOf(phase: KanbanPhaseEntity): number {
  return normalizeCardVisibility(phase.cardVisibility)?.rules.length ?? 0;
}

@Injectable()
export class SolicitationsService {
  private readonly logger = new Logger(SolicitationsService.name);
  /** Aprovações de fase concluídas por quem moveu o card, enquanto o movimento dele não termina. */
  private readonly approvalsDecidedByMove = new Set<string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    @InjectRepository(SolicitationHistoryEntity)
    private readonly historyRepository: Repository<SolicitationHistoryEntity>,
    @InjectRepository(KanbanPhaseEntity)
    private readonly kanbanPhasesRepository: Repository<KanbanPhaseEntity>,
    @InjectRepository(KanbanPhaseFieldValueEntity)
    private readonly phaseFieldValuesRepository: Repository<KanbanPhaseFieldValueEntity>,
    @InjectRepository(SolicitationStandardAnswerEntity)
    private readonly standardAnswersRepository: Repository<SolicitationStandardAnswerEntity>,
    private readonly metricsService: MetricsService,
    private readonly settingsService: SettingsService,
    private readonly slaCalculatorService: SlaCalculatorService,
    private readonly permissionsService: PermissionsService,
    private readonly approvalsService: ApprovalsService,
    private readonly itemOrderFields: ItemOrderFieldService,
    private readonly processAccess: ProcessAccessService,
    private readonly cardFilter: CardFilterService,
    @Optional() private readonly userNotice?: UserNoticeService,
    @Optional() private readonly mailerService?: FlowMailerService,
    @Optional() private readonly cardDisplay?: CardDisplayService,
    @Optional() private readonly attachmentsService?: AttachmentsService,
    @Optional() private readonly userEmailFields?: UserEmailFieldService,
  ) {}

  async createManual(
    dto: CreateSolicitationDto,
    actor: JwtPayload,
  ): Promise<SolicitationEntity> {
    const slaFields = await this.resolveInitialSlaFields();
    const created = await this.dataSource.transaction(async (manager) => {
      const formId = await this.resolveFormId(manager, dto.formId ?? null, actor);
      const assigneeId =
        dto.assigneeId !== undefined
          ? await this.resolveAssigneeId(manager, dto.assigneeId)
          : null;

      const solicitation = manager.getRepository(SolicitationEntity).create({
        title: dto.title.trim(),
        description: this.normalizeOptionalText(dto.description),
        priority: dto.priority ?? SolicitationPriority.MEDIUM,
        status: SolicitationStatus.OPEN,
        originType: SolicitationOriginType.MANUAL,
        formId,
        submissionId: null,
        createdBy: actor.sub,
        assigneeId,
        metadata: dto.metadata ?? null,
        trackingToken: randomUUID(),
        ...slaFields,
      });
      const saved = await manager.getRepository(SolicitationEntity).save(solicitation);

      await this.registerHistory(
        {
          solicitationId: saved.id,
          eventType: SolicitationHistoryEventType.CREATED,
          actorId: actor.sub,
          toValue: saved.status,
          message: 'Solicitação criada manualmente.',
          metadata: { originType: saved.originType },
        },
        manager,
      );

      return saved;
    });

    this.logger.log(
      {
        solicitationId: created.id,
        actorId: actor.sub,
        areaId: created.areaId ?? undefined,
        status: created.status,
      },
      'Solicitation created manually',
    );

    this.eventEmitter.emit(
      'solicitations.created',
      new SolicitationCreatedEvent(
        actor.sub,
        created.id,
        created.originType,
        created.formId,
        created.submissionId,
      ),
    );

    this.metricsService.incrementSolicitationsByStatus(created.status);
    this.metricsService.incrementSolicitationsCreatedTotal(created.originType);

    this.notifyAssigned(created.id, created.title, created.assigneeId, actor.sub);

    return this.loadDetail(created.id);
  }

  async createFromSubmission(submissionId: string): Promise<SolicitationEntity> {
    const existing = await this.findBySubmissionId(submissionId);
    if (existing) return existing;

    let created: SolicitationEntity;
    // Fase da faixa de pontuação em que o card nasceu (preenchida dentro da transação).
    const entry: { phase: KanbanPhaseEntity | null } = { phase: null };
    try {
      const slaFields = await this.resolveInitialSlaFields();
      created = await this.dataSource.transaction(async (manager) => {
        const submission = await manager.findOne(SubmissionEntity, {
          where: { id: submissionId },
          relations: { form: true },
        });
        if (!submission) throw new NotFoundException('Submissao nao encontrada.');

        // Extrai o número de telefone do campo 'phone' da submissão (para WhatsApp)
        const phoneItem = await manager.findOne(SubmissionItemEntity, {
          where: { submissionId, fieldCode: 'telefone' },
        });
        const requesterPhone = phoneItem?.valueText
          ? phoneItem.valueText.replace(/\D/g, '') || null
          : null;

        const solicitation = manager.getRepository(SolicitationEntity).create({
          title: this.buildTitleFromSubmission(submission),
          description: `Solicitação criada automaticamente a partir da submissão ${submission.id}.`,
          priority: SolicitationPriority.MEDIUM,
          status: SolicitationStatus.NEW,
          originType: SolicitationOriginType.FORM_SUBMISSION,
          formId: submission.formId,
          submissionId: submission.id,
          createdBy: null,
          assigneeId: null,
          areaId: submission.form?.areaId ?? null,
          requesterPhone,
          metadata: {
            responderName: submission.responderName,
            responderEmail: submission.responderEmail,
            formVersionId: submission.formVersionId,
          },
          trackingToken: randomUUID(),
          ...slaFields,
        });
        let saved = await manager.getRepository(SolicitationEntity).save(solicitation);

        await this.registerHistory(
          {
            solicitationId: saved.id,
            eventType: SolicitationHistoryEventType.CREATED,
            actorId: null,
            toValue: saved.status,
            message: 'Solicitação criada automaticamente a partir do envio do formulário.',
            metadata: { originType: saved.originType, submissionId: submission.id },
          },
          manager,
        );

        const scoreEntry = await this.resolveScoreEntry(manager, submission);
        if (scoreEntry) {
          const { match, phase } = scoreEntry;
          saved.metadata = {
            ...(saved.metadata ?? {}),
            scoreRange: {
              fieldCode: match.fieldCode,
              value: match.value,
              from: match.range.from,
              label: match.range.label ?? null,
              phaseId: match.range.phaseId,
            },
          };
          if (phase) {
            // Nasce direto na fase da faixa, como a entrada externa do mapa: abre o período dela.
            saved.currentPhaseId = phase.id;
            await recordPhaseChange(manager, { solicitation: saved, from: null, to: phase, now: new Date() });
          }
          saved = await manager.getRepository(SolicitationEntity).save(saved);
          if (phase) {
            await this.registerHistory(
              {
                solicitationId: saved.id,
                eventType: SolicitationHistoryEventType.PHASE_CHANGED,
                actorId: null,
                toValue: phase.label,
                message: `Faixa "${describeScoreRange(match.range)}" do cálculo "${match.fieldLabel}" (${match.value.toLocaleString('pt-BR')}): o card começou na fase "${phase.label}".`,
                metadata: { fieldCode: match.fieldCode, value: match.value, phaseId: phase.id },
              },
              manager,
            );
          }
          entry.phase = phase;
        }

        return saved;
      });
    } catch (error) {
      if (this.isSubmissionUniqueViolation(error)) {
        const duplicate = await this.findBySubmissionId(submissionId);
        if (duplicate) return duplicate;
      }
      throw error;
    }

    this.logger.log(
      {
        solicitationId: created.id,
        submissionId,
        areaId: created.areaId ?? undefined,
        status: created.status,
      },
      'Solicitation created from submission',
    );

    this.eventEmitter.emit(
      'solicitations.created',
      new SolicitationCreatedEvent(
        null,
        created.id,
        created.originType,
        created.formId,
        created.submissionId,
      ),
    );
    if (entry.phase) {
      // Os fluxos "Entrou na fase" da fase da faixa valem também para o card que já nasce nela.
      this.eventEmitter.emit(
        'solicitations.phase_changed',
        new PhaseChangedEvent(null, created.id, null, entry.phase.id, 0),
      );
    }

    this.metricsService.incrementSolicitationsByStatus(created.status);
    this.metricsService.incrementSolicitationsCreatedTotal(created.originType);

    return this.solicitationsRepository.findOneOrFail({
      where: { id: created.id },
      relations: { form: true, submission: true, assignee: true, createdByUser: true },
    });
  }

  async createFromFlowPayload(input: {
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
    priority?: SolicitationPriority;
    idempotencyKey?: string | null;
    formId?: string | null;
    /**
     * Fase em que nasce (entrada externa no mapa do processo). Sem ela, ou sendo a 1ª, nasce como
     * qualquer solicitação: na 1ª fase, sem "Entrou na fase".
     */
    phaseId?: string | null;
    /** Prazo próprio da tarefa; sem ele vale o SLA padrão do sistema. */
    dueAt?: Date | null;
    slaWarningThresholdPercent?: number;
    /** Encadeamento de fluxos, para o "Entrou na fase" que a entrada direta dispara. */
    flowEventDepth?: number;
  }): Promise<{ solicitation: SolicitationEntity; reused: boolean }> {
    // `reused`: a chave de idempotência já tinha solicitação (reenvio do mesmo item) — o nó do
    // fluxo pode parar o caminho aí em vez de repetir o que já foi feito por ela.
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return { solicitation: existing, reused: true };
    }

    const entryPhase = await this.resolveEntryPhase(input.formId ?? null, input.phaseId ?? null);

    let created: SolicitationEntity;
    try {
      const slaFields = input.dueAt
        ? this.slaCalculatorService.initializeSlaWithDeadline(
            input.dueAt,
            input.slaWarningThresholdPercent,
          )
        : await this.resolveInitialSlaFields();
      created = await this.dataSource.transaction(async (manager) => {
        const solicitation = manager.getRepository(SolicitationEntity).create({
          title: input.title,
          description: this.normalizeOptionalText(input.description),
          priority: input.priority ?? SolicitationPriority.MEDIUM,
          status: SolicitationStatus.NEW,
          originType: SolicitationOriginType.WEBHOOK,
          formId: input.formId ?? null,
          submissionId: null,
          createdBy: null,
          assigneeId: null,
          metadata: input.metadata ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          trackingToken: randomUUID(),
          ...slaFields,
        });
        let saved = await manager.getRepository(SolicitationEntity).save(solicitation);

        await this.registerHistory(
          {
            solicitationId: saved.id,
            eventType: SolicitationHistoryEventType.CREATED,
            actorId: null,
            toValue: saved.status,
            message: 'Solicitação criada automaticamente por fluxo.',
            metadata: { originType: saved.originType },
          },
          manager,
        );

        if (entryPhase) {
          // Nasce direto na fase: abre o período dela (o prazo da fase conta daqui), sem passar
          // pela 1ª.
          saved.currentPhaseId = entryPhase.id;
          await recordPhaseChange(manager, { solicitation: saved, from: null, to: entryPhase, now: new Date() });
          saved = await manager.getRepository(SolicitationEntity).save(saved);
        }

        return saved;
      });
    } catch (error) {
      if (input.idempotencyKey && this.isIdempotencyKeyUniqueViolation(error)) {
        const duplicate = await this.findByIdempotencyKey(input.idempotencyKey);
        if (duplicate) return { solicitation: duplicate, reused: true };
      }
      throw error;
    }

    this.logger.log(
      { solicitationId: created.id, status: created.status },
      'Solicitation created from webhook payload',
    );

    this.eventEmitter.emit(
      'solicitations.created',
      new SolicitationCreatedEvent(
        null,
        created.id,
        created.originType,
        created.formId,
        created.submissionId,
      ),
    );
    if (entryPhase) {
      // Os fluxos "Entrou na fase" da fase de entrada valem também para quem chega de fora.
      this.eventEmitter.emit(
        'solicitations.phase_changed',
        new PhaseChangedEvent(null, created.id, null, entryPhase.id, input.flowEventDepth ?? 0),
      );
    }

    this.metricsService.incrementSolicitationsByStatus(created.status);
    this.metricsService.incrementSolicitationsCreatedTotal(created.originType);

    return { solicitation: created, reused: false };
  }

  /**
   * Encaminhar para outro processo: cria no formulário de destino um envio de verdade, com as
   * respostas do card de origem copiadas com o tipo (ver process-handoff.answers.ts), e o card desse
   * envio. Assim o destino enxerga tudo como um card aberto pelo formulário: Respostas, Registros,
   * condições, filtros e cálculos. O solicitante é o mesmo da origem e os dois cards ficam ligados
   * (`sourceSolicitationId` + histórico nos dois).
   *
   * Cada card vai uma vez para cada processo: repetir devolve o já criado (`reused`). Campo
   * obrigatório que ficou sem resposta não trava — volta em `missingRequired`.
   */
  async createFromHandoff(input: {
    sourceSolicitationId: string;
    targetFormId: string;
    /** Fase em que o card nasce no destino; sem ela, a 1ª (ou a da faixa de pontuação). */
    targetPhaseId?: string | null;
    /** Título do card no destino; vazio = o título do card de origem. */
    title?: string | null;
    mappings?: HandoffMapping[];
    autoMatchByCode?: boolean;
    copyAttachments?: boolean;
    flowEventDepth?: number;
  }): Promise<HandoffResult> {
    const source = await this.solicitationsRepository.findOne({
      where: { id: input.sourceSolicitationId },
      relations: { form: true, submission: { items: true }, createdByUser: true },
    });
    if (!source) throw new NotFoundException('Card de origem do encaminhamento não encontrado.');

    const idempotencyKey = `handoff:${source.id}:${input.targetFormId}`;
    const existing = await this.findHandoffByKey(idempotencyKey);
    if (existing) return { ...emptyHandoffReport(), solicitation: existing, reused: true };

    const targetForm = await this.dataSource.getRepository(FormEntity).findOne({
      where: { id: input.targetFormId },
    });
    if (!targetForm) throw new BadRequestException('O processo de destino não existe mais.');
    if (targetForm.status === FormStatus.ARCHIVED) {
      throw new BadRequestException(`O processo de destino "${targetForm.name}" está arquivado.`);
    }
    // Versão no ar do destino. "Salvar" no construtor tira o formulário do ar, mas a versão
    // publicada antes continua sendo a que vale para as respostas.
    const version = await this.dataSource.getRepository(FormVersionEntity).findOne({
      where: { formId: targetForm.id, isPublished: true },
      relations: { sections: { fields: { options: true } } },
      order: { versionNumber: 'DESC' },
    });
    if (!version) {
      throw new BadRequestException(`O processo de destino "${targetForm.name}" não tem versão publicada.`);
    }

    const plan = buildHandoffAnswers({
      targetFields: version.sections
        .flatMap((section) => section.fields)
        .sort((left, right) => left.order - right.order)
        .map((field) => ({
          id: field.id,
          code: field.code,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          options: (field.options ?? []).map((option) => ({
            value: option.internalValue,
            label: option.displayLabel,
          })),
          settingsJson: field.settingsJson ?? null,
        })),
      sourceAnswers: await this.collectHandoffSourceAnswers(source),
      mappings: input.mappings ?? [],
      autoMatchByCode: input.autoMatchByCode ?? true,
    });

    const entryPhase = await this.resolveEntryPhase(targetForm.id, input.targetPhaseId ?? null);
    const requesterName =
      source.submission?.responderName ?? source.createdByUser?.fullName ?? metadataText(source.metadata, 'responderName');
    const requesterEmail =
      source.submission?.responderEmail ?? source.createdByUser?.email ?? metadataText(source.metadata, 'responderEmail');
    const sourceFormName = source.form?.name ?? 'outro processo';
    const title = (input.title?.trim() ? input.title.trim() : source.title).slice(0, 180);

    let created: SolicitationEntity;
    let submissionId: string;
    const entry: { phase: KanbanPhaseEntity | null } = { phase: entryPhase };
    try {
      const slaFields = await this.resolveInitialSlaFields();
      ({ created, submissionId } = await this.dataSource.transaction(async (manager) => {
        const submission = await manager.getRepository(SubmissionEntity).save(
          manager.getRepository(SubmissionEntity).create({
            formId: targetForm.id,
            formVersionId: version.id,
            responderName: requesterName,
            responderEmail: requesterEmail,
            idempotencyKey,
            status: SubmissionStatus.SUBMITTED,
            submittedAt: new Date(),
          }),
        );
        if (plan.items.length > 0) {
          await manager.getRepository(SubmissionItemEntity).save(
            plan.items.map((item) =>
              manager.getRepository(SubmissionItemEntity).create({
                submissionId: submission.id,
                fieldId: item.fieldId,
                fieldCode: item.fieldCode,
                valueText: item.valueText,
                valueNumber: item.valueNumber,
                valueBoolean: item.valueBoolean,
                valueJson: item.valueJson as Record<string, unknown> | null,
              }),
            ),
          );
        }

        let saved = await manager.getRepository(SolicitationEntity).save(
          manager.getRepository(SolicitationEntity).create({
            title,
            description: null,
            priority: source.priority,
            status: SolicitationStatus.NEW,
            originType: SolicitationOriginType.PROCESS_HANDOFF,
            formId: targetForm.id,
            submissionId: submission.id,
            createdBy: source.createdBy,
            assigneeId: null,
            areaId: targetForm.areaId ?? null,
            requesterPhone: source.requesterPhone,
            metadata: {
              responderName: requesterName,
              responderEmail: requesterEmail,
              formVersionId: version.id,
              handoff: { sourceSolicitationId: source.id, sourceFormId: source.formId, sourceFormName },
            },
            sourceSolicitationId: source.id,
            idempotencyKey,
            trackingToken: randomUUID(),
            ...slaFields,
          }),
        );

        await this.registerHistory(
          {
            solicitationId: saved.id,
            eventType: SolicitationHistoryEventType.CREATED,
            toValue: saved.status,
            message: `Recebida do processo "${sourceFormName}" (card "${source.title}").`,
            metadata: { originType: saved.originType, sourceSolicitationId: source.id, submissionId: submission.id },
          },
          manager,
        );

        if (!entry.phase) {
          // Sem fase escolhida, vale a faixa de pontuação, como num envio do formulário.
          const scoreEntry = await this.resolveScoreEntry(manager, submission);
          if (scoreEntry) {
            saved.metadata = {
              ...(saved.metadata ?? {}),
              scoreRange: {
                fieldCode: scoreEntry.match.fieldCode,
                value: scoreEntry.match.value,
                from: scoreEntry.match.range.from,
                label: scoreEntry.match.range.label ?? null,
                phaseId: scoreEntry.match.range.phaseId,
              },
            };
            entry.phase = scoreEntry.phase;
          }
        }
        if (entry.phase) {
          saved.currentPhaseId = entry.phase.id;
          await recordPhaseChange(manager, { solicitation: saved, from: null, to: entry.phase, now: new Date() });
        }
        saved = await manager.getRepository(SolicitationEntity).save(saved);

        await this.registerHistory(
          {
            solicitationId: source.id,
            eventType: SolicitationHistoryEventType.FORWARDED,
            toValue: targetForm.name,
            message: `Encaminhada para o processo "${targetForm.name}".`,
            metadata: { targetSolicitationId: saved.id, targetFormId: targetForm.id },
          },
          manager,
        );

        return { created: saved, submissionId: submission.id };
      }));
    } catch (error) {
      // Duas execuções ao mesmo tempo: a segunda bate na chave única do envio.
      if (this.isHandoffSubmissionUniqueViolation(error)) {
        const duplicate = await this.findHandoffByKey(idempotencyKey);
        if (duplicate) return { ...emptyHandoffReport(), solicitation: duplicate, reused: true };
      }
      throw error;
    }

    const attachments =
      input.copyAttachments === false || !this.attachmentsService
        ? { copied: 0, failed: [] as string[] }
        : await this.attachmentsService.copyToSolicitation(source.id, {
            solicitationId: created.id,
            submissionId,
          });

    this.logger.log(
      { solicitationId: created.id, sourceSolicitationId: source.id, formId: targetForm.id },
      'Solicitation forwarded to another process',
    );

    const flowDepth = input.flowEventDepth ?? 0;
    this.eventEmitter.emit(
      'solicitations.created',
      new SolicitationCreatedEvent(null, created.id, created.originType, created.formId, created.submissionId, flowDepth),
    );
    if (entry.phase) {
      this.eventEmitter.emit(
        'solicitations.phase_changed',
        new PhaseChangedEvent(null, created.id, null, entry.phase.id, flowDepth),
      );
    }
    this.metricsService.incrementSolicitationsByStatus(created.status);
    this.metricsService.incrementSolicitationsCreatedTotal(created.originType);

    return {
      solicitation: created,
      reused: false,
      copiedFields: plan.items.map((item) => item.fieldCode),
      skipped: plan.skipped,
      missingRequired: plan.missingRequired,
      attachmentsCopied: attachments.copied,
      attachmentsFailed: attachments.failed,
    };
  }

  /**
   * O que o card de origem tem, por código: respostas do formulário (com o tipo e as opções do
   * campo), respostas dadas por fluxo (texto) e campos de fase. Código repetido: vale a resposta
   * do formulário, como em FlowsService.withPhaseFieldValues.
   */
  private async collectHandoffSourceAnswers(
    source: SolicitationEntity,
  ): Promise<Map<string, HandoffSourceAnswer>> {
    const answers = new Map<string, HandoffSourceAnswer>();

    const phaseValues = await this.phaseFieldValuesRepository.find({
      where: { solicitationId: source.id },
      relations: { phaseField: true },
    });
    for (const value of phaseValues) {
      answers.set(value.fieldCode, {
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueBoolean: value.valueBoolean,
        valueJson: value.valueJson,
        fieldType: value.phaseField?.fieldType ?? null,
        options: (value.phaseField?.optionsJson ?? []).map((option) => ({
          value: option.value,
          label: option.label,
        })),
      });
    }

    for (const [code, text] of Object.entries(readSolicitationFormFieldValues(source.metadata))) {
      answers.set(code, {
        valueText: text,
        valueNumber: null,
        valueBoolean: null,
        valueJson: null,
        fieldType: null,
        options: [],
      });
    }

    const items = source.submission?.items ?? [];
    if (items.length > 0) {
      const fields = await this.dataSource.getRepository(FormFieldEntity).find({
        where: { id: In(items.map((item) => item.fieldId)) },
        relations: { options: true },
      });
      const fieldById = new Map(fields.map((field) => [field.id, field]));
      for (const item of items) {
        const field = fieldById.get(item.fieldId);
        answers.set(item.fieldCode, {
          valueText: item.valueText,
          valueNumber: item.valueNumber,
          valueBoolean: item.valueBoolean,
          valueJson: item.valueJson,
          fieldType: field?.fieldType ?? null,
          options: (field?.options ?? []).map((option) => ({
            value: option.internalValue,
            label: option.displayLabel,
          })),
        });
      }
    }

    return answers;
  }

  /** Card criado por um encaminhamento (mesmo card de origem → mesmo processo de destino). */
  private findHandoffByKey(idempotencyKey: string): Promise<SolicitationEntity | null> {
    return this.solicitationsRepository.findOne({
      where: { originType: SolicitationOriginType.PROCESS_HANDOFF, idempotencyKey },
    });
  }

  private isHandoffSubmissionUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return (
      driverError?.code === '23505' &&
      driverError.constraint === 'UQ_submissions_form_id_idempotency_key'
    );
  }

  /**
   * De onde o card veio e para onde foi encaminhado, para a tela do card. Quem vê o card vê o
   * título e o processo dos cards ligados; abrir cada um confere o acesso dele.
   */
  async findHandoffLinks(id: string, actor: SolicitationActor): Promise<HandoffLinksDto> {
    const solicitation = await this.findOne(id, actor);
    const toLink = (card: SolicitationEntity): HandoffLinkDto => ({
      id: card.id,
      title: card.title,
      formId: card.formId,
      formName: card.form?.name ?? null,
      status: card.status,
      createdAt: card.createdAt,
    });
    const [source, forwarded] = await Promise.all([
      solicitation.sourceSolicitationId
        ? this.solicitationsRepository.findOne({
            where: { id: solicitation.sourceSolicitationId },
            relations: { form: true },
          })
        : Promise.resolve(null),
      this.solicitationsRepository.find({
        where: { sourceSolicitationId: solicitation.id },
        relations: { form: true },
        order: { createdAt: 'ASC' },
      }),
    ]);
    return { source: source ? toLink(source) : null, forwarded: forwarded.map(toLink) };
  }

  /**
   * Fase de entrada de uma solicitação criada por fluxo: precisa ser do formulário dela. A 1ª fase
   * (ou nenhuma) devolve null — é onde toda solicitação nasce, sem período aberto nem "Entrou na
   * fase".
   */
  private async resolveEntryPhase(
    formId: string | null,
    phaseId: string | null,
  ): Promise<KanbanPhaseEntity | null> {
    if (!phaseId) return null;
    const phase = await this.kanbanPhasesRepository.findOne({ where: { id: phaseId } });
    if (!phase) throw new BadRequestException('A fase de entrada da solicitação não existe mais.');
    if (!formId || phase.formId !== formId) {
      throw new BadRequestException('A fase de entrada não pertence ao formulário da solicitação.');
    }
    const first = await this.resolveEffectivePhaseId(formId, null);
    return first === phase.id ? null : phase;
  }

  /**
   * Faixa do resultado de um campo calculado (pontuação) em que o envio caiu, e a fase em que o card
   * nasce por ela. `phase` é null quando a faixa aponta para a 1ª fase (onde todo card já nasce).
   * Fase apagada ou de outro processo não trava a abertura: o card nasce na 1ª fase e fica o aviso
   * no log — a resposta já foi aceita, e a publicação recusa faixa com fase que não existe.
   */
  private async resolveScoreEntry(
    manager: EntityManager,
    submission: SubmissionEntity,
  ): Promise<{ match: ScoreEntryMatch; phase: KanbanPhaseEntity | null } | null> {
    const fields = await manager.find(FormFieldEntity, {
      where: { formVersionId: submission.formVersionId, fieldType: FormFieldType.CALCULATED },
      relations: { section: true },
    });
    const candidates = scoreEntryCandidates(
      fields.map((field) => ({
        code: field.code,
        label: field.label,
        settingsJson: field.settingsJson,
        sectionOrder: field.section?.order ?? 0,
        order: field.order,
      })),
    );
    if (candidates.length === 0) return null;

    const items = await manager.find(SubmissionItemEntity, {
      where: { submissionId: submission.id, fieldCode: In(candidates.map((field) => field.code)) },
    });
    const match = pickScoreEntry(
      candidates,
      new Map(items.map((item) => [item.fieldCode, item.valueNumber === null ? null : Number(item.valueNumber)])),
    );
    if (!match) return null;

    const phase = await this.kanbanPhasesRepository.findOne({ where: { id: match.range.phaseId } });
    if (phase?.formId !== submission.formId) {
      this.logger.warn(
        { submissionId: submission.id, fieldCode: match.fieldCode, phaseId: match.range.phaseId },
        'Score range points to a phase outside this form; card stays in the first phase',
      );
      return null;
    }
    const first = await this.resolveEffectivePhaseId(submission.formId, null);
    return { match, phase: first === phase.id ? null : phase };
  }

  async findAll(
    query: QuerySolicitationsDto,
    actor: JwtPayload,
  ): Promise<PaginatedResponseDto<SolicitationEntity>> {
    const { page, limit, search, status, priority, originType, assigneeId, formId } = query;
    const skip = (page - 1) * limit;

    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoinAndSelect('solicitation.form', 'form')
      .leftJoinAndSelect('solicitation.submission', 'submission')
      .leftJoinAndSelect('solicitation.assignee', 'assignee')
      .leftJoinAndSelect('solicitation.createdByUser', 'createdByUser');

    await this.processAccess.applySolicitationScope(qb, actor);

    if (search) {
      qb.andWhere(
        `(solicitation.title ILIKE :search OR solicitation.description ILIKE :search OR submission.responder_name ILIKE :search OR submission.responder_email ILIKE :search)`,
        { search: `%${search}%` },
      );
    }
    if (status) qb.andWhere('solicitation.status = :status', { status });
    if (priority) qb.andWhere('solicitation.priority = :priority', { priority });
    if (originType) qb.andWhere('solicitation.origin_type = :originType', { originType });
    if (assigneeId) qb.andWhere('solicitation.assignee_id = :assigneeId', { assigneeId });
    if (formId) qb.andWhere('solicitation.form_id = :formId', { formId });

    // Card que o filtro da fase esconde da pessoa também some da lista.
    const hiddenIds = (await this.processAccess.hiddenCards(actor, formId)).map((card) => card.id);
    if (hiddenIds.length) {
      qb.andWhere('NOT (solicitation.id = ANY(CAST(:hiddenCardIds AS uuid[])))', { hiddenCardIds: hiddenIds });
    }

    qb.orderBy('solicitation.updatedAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return PaginatedResponseDto.of(data, total, page, limit);
  }

  async findOne(id: string, actor: SolicitationActor): Promise<SolicitationWithContact> {
    const solicitation = await this.loadDetail(id);
    await this.assertActorCanAccess(solicitation, actor, 'solicitations.view');
    return solicitation;
  }

  /**
   * O card com o que a tela de detalhe mostra, sem conferir acesso. Para devolver o card depois de uma
   * mudança que já passou pela checagem: mover para uma fase cujo filtro o esconde de quem moveu (ou
   * passar a responsabilidade adiante) não pode transformar a mudança feita em erro.
   */
  private async loadDetail(id: string): Promise<SolicitationWithContact> {
    const solicitation = await this.solicitationsRepository.findOne({
      where: { id },
      relations: {
        form: true,
        submission: { items: { field: true } },
        assignee: true,
        createdByUser: true,
      },
    });
    if (!solicitation) throw new NotFoundException('Solicitacao nao encontrada.');
    return { ...solicitation, requesterContact: extractRequesterContact(solicitation.submission) };
  }

  async findHistory(
    solicitationId: string,
    actor: JwtPayload,
  ): Promise<SolicitationHistoryEntity[]> {
    await this.findOne(solicitationId, actor);
    return this.historyRepository.find({
      where: { solicitationId },
      relations: { actor: true },
      order: { createdAt: 'ASC' },
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateSolicitationStatusDto,
    actor: SolicitationActor,
  ): Promise<SolicitationEntity> {
    const actorId = this.getActorId(actor);
    const changed = await this.dataSource.transaction(async (manager) => {
      const solicitation = await this.findForMutationOrFail(manager, id, actor);
      if (solicitation.status === dto.status) return null;

      const previous = solicitation.status;
      solicitation.status = dto.status;
      await manager.getRepository(SolicitationEntity).save(solicitation);
      await this.registerHistory(
        {
          solicitationId: solicitation.id,
          eventType: SolicitationHistoryEventType.STATUS_CHANGED,
          actorId,
          fromValue: previous,
          toValue: dto.status,
          message: dto.note ?? null,
        },
        manager,
      );
      return { fromStatus: previous, toStatus: dto.status };
    });

    if (changed) {
      this.eventEmitter.emit(
        'solicitations.status_changed',
        new SolicitationStatusChangedEvent(
          actorId,
          id,
          changed.fromStatus,
          changed.toStatus,
        ),
      );
      const result = await this.loadDetail(id);
      await this.notifyStatusChange(result, changed.fromStatus, changed.toStatus, actorId);
      return result;
    }

    return this.loadDetail(id);
  }

  async updateAssignee(
    id: string,
    dto: UpdateSolicitationAssigneeDto,
    actor: SolicitationActor,
  ): Promise<SolicitationEntity> {
    const actorId = this.getActorId(actor);
    const changed = await this.dataSource.transaction(async (manager) => {
      const solicitation = await this.findForMutationOrFail(manager, id, actor, 'solicitations.reassign');
      const nextAssigneeId = await this.resolveAssigneeId(manager, dto.assigneeId ?? null);
      if (solicitation.assigneeId === nextAssigneeId) return null;

      const previous = solicitation.assigneeId;
      solicitation.assigneeId = nextAssigneeId;
      await manager.getRepository(SolicitationEntity).save(solicitation);
      await this.registerHistory(
        {
          solicitationId: solicitation.id,
          eventType: SolicitationHistoryEventType.ASSIGNEE_CHANGED,
          actorId,
          fromValue: previous,
          toValue: nextAssigneeId,
          message: dto.note ?? null,
        },
        manager,
      );
      return { fromAssigneeId: previous, toAssigneeId: nextAssigneeId };
    });

    if (changed) {
      this.eventEmitter.emit(
        'solicitations.assignee_changed',
        new SolicitationAssigneeChangedEvent(
          actorId,
          id,
          changed.fromAssigneeId,
          changed.toAssigneeId,
        ),
      );
    }

    const result = await this.loadDetail(id);
    if (changed) this.notifyAssigned(id, result.title, changed.toAssigneeId, actorId);
    return result;
  }

  async updatePriority(
    id: string,
    dto: UpdateSolicitationPriorityDto,
    actor: SolicitationActor,
  ): Promise<SolicitationEntity> {
    const actorId = this.getActorId(actor);
    const changed = await this.dataSource.transaction(async (manager) => {
      const solicitation = await this.findForMutationOrFail(manager, id, actor, 'solicitations.reassign');
      if (solicitation.priority === dto.priority) return null;

      const previous = solicitation.priority;
      solicitation.priority = dto.priority;
      await manager.getRepository(SolicitationEntity).save(solicitation);
      await this.registerHistory(
        {
          solicitationId: solicitation.id,
          eventType: SolicitationHistoryEventType.PRIORITY_CHANGED,
          actorId,
          fromValue: previous,
          toValue: dto.priority,
          message: dto.note ?? null,
        },
        manager,
      );
      return { fromPriority: previous, toPriority: dto.priority };
    });

    if (changed) {
      this.eventEmitter.emit(
        'solicitations.priority_changed',
        new SolicitationPriorityChangedEvent(
          actorId,
          id,
          changed.fromPriority,
          changed.toPriority,
        ),
      );
    }

    return this.loadDetail(id);
  }

  async getKanbanBoard(actor: JwtPayload, formId?: string): Promise<KanbanBoardDto> {
    // O board por status foi descontinuado: todo board é de um formulário (fases) ou o
    // "Sem formulário" (colunas padrão calculadas pelo status).
    if (!formId) throw new BadRequestException('Informe o formulário do Kanban.');
    if (formId === 'unassigned') return this.getUnassignedKanbanBoard(actor);

    // Os cards já saíam filtrados, mas as colunas — as fases do processo — iam para qualquer
    // pessoa logada que soubesse o id do formulário.
    await this.processAccess.assertProcessVisible(formId, actor);

    let phases = await this.kanbanPhasesRepository.find({
      where: { formId },
      order: { order: 'ASC' },
    });
    if (phases.length === 0) {
      // Rede de segurança: formulários nascem com as fases padrão (e a migration
      // DefaultKanbanPhases semeou os antigos). Trava o form para dois GETs simultâneos
      // não semearem em dobro.
      phases = await this.dataSource.transaction(async (manager) => {
        const form = await manager.getRepository(FormEntity).findOne({
          where: { id: formId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!form) throw new NotFoundException('Formulario nao encontrado.');
        const existing = await manager
          .getRepository(KanbanPhaseEntity)
          .find({ where: { formId }, order: { order: 'ASC' } });
        return existing.length > 0 ? existing : createDefaultKanbanPhases(manager, formId);
      });
    }

    return this.getKanbanBoardByPhase(actor, formId, phases);
  }

  private async getUnassignedKanbanBoard(actor: JwtPayload): Promise<KanbanBoardDto> {
    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoinAndSelect('solicitation.form', 'form')
      .leftJoinAndSelect('solicitation.assignee', 'assignee')
      .leftJoinAndSelect('solicitation.createdByUser', 'createdByUser')
      .where('solicitation.formId IS NULL')
      .orderBy('solicitation.updatedAt', 'DESC');

    await this.processAccess.applySolicitationScope(qb, actor);

    const solicitations = await qb.getMany();

    const cardsByStage = new Map<DefaultKanbanStage, KanbanCard[]>(
      DEFAULT_KANBAN_STAGES.map((stage) => [stage, []]),
    );
    for (const sol of solicitations) {
      cardsByStage.get(defaultStageForStatus(sol.status))?.push(this.toKanbanCard(sol));
    }

    return {
      groupBy: 'stage',
      columns: DEFAULT_KANBAN_PHASES.map((phase) => ({
        id: phase.key,
        label: phase.label,
        color: phase.color,
        cards: cardsByStage.get(phase.key) ?? [],
      })),
    };
  }

  private async getKanbanBoardByPhase(
    actor: JwtPayload,
    formId: string,
    phases: KanbanPhaseEntity[],
  ): Promise<KanbanBoardDto> {
    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoinAndSelect('solicitation.form', 'form')
      .leftJoinAndSelect('solicitation.assignee', 'assignee')
      .leftJoinAndSelect('solicitation.createdByUser', 'createdByUser')
      .where('solicitation.form_id = :formId', { formId })
      .orderBy('solicitation.updatedAt', 'DESC');

    await this.processAccess.applySolicitationScope(qb, actor);

    const solicitations = await qb.getMany();
    // A fase de cada card é resolvida contra TODAS as fases (fase vencida cai na primeira);
    // só depois a visibilidade esconde colunas — e, com elas, os cards que estão nelas.
    const initialPhaseId = phases[0].id;
    const allPhaseIds = new Set(phases.map((phase) => phase.id));
    // Quem configura as fases DESTE processo vê todas as colunas, para poder configurá-las.
    const seesAll = await this.processAccess.hasInProcess(actor, formId, 'kanban_phases.manage');
    const visiblePhases = phases.filter((phase) => canSeePhase(phase, actor, seesAll));

    // Nome e configuração do processo vêm da relação já carregada; board vazio (processo novo ou
    // tudo escondido pelo filtro de cards) busca o formulário, senão o título some da tela.
    const form =
      solicitations[0]?.form ??
      (await this.dataSource.manager.findOne(FormEntity, {
        where: { id: formId },
        select: { id: true, name: true, kanbanSettings: true },
      }));
    // "Valor do card" (configuração do Kanban do formulário): o valor em R$ de cada card e a
    // soma por coluna.
    const valueField = normalizeKanbanSettings(form?.kanbanSettings).cardValueField;
    const valuesBySolicitation = valueField
      ? await this.loadCardValues(valueField, solicitations)
      : new Map<string, number>();

    const phasesById = new Map(phases.map((phase) => [phase.id, phase]));
    const resolvePhaseId = (sol: SolicitationEntity): string =>
      sol.currentPhaseId && allPhaseIds.has(sol.currentPhaseId) ? sol.currentPhaseId : initialPhaseId;
    // Filtro de cards pela resposta: só busca respostas se alguma fase tem regra e o usuário não é
    // quem configura as fases (esse vê tudo).
    const answerOf = seesAll
      ? null
      : await this.cardFilter.loadAnswers(solicitations, (sol) => phasesById.get(resolvePhaseId(sol)));
    // "Personalizar card": o que o card mostra em cada fase para ESTA pessoa (ajuste dela, padrão
    // da fase ou padrão do sistema).
    const personalDisplays = this.cardDisplay
      ? await this.cardDisplay.personalByPhase(actor.sub, visiblePhases.map((phase) => phase.id))
      : new Map<string, KanbanCardDisplay>();
    const displayByPhase = new Map(
      visiblePhases.map((phase) => [phase.id, effectiveCardDisplay(personalDisplays.get(phase.id), phase.cardDisplay)]),
    );
    const cardsByPhase = new Map<string, KanbanCard[]>();
    for (const phase of visiblePhases) {
      cardsByPhase.set(phase.id, []);
    }
    const shown: SolicitationEntity[] = [];
    const cardsById = new Map<string, KanbanCard>();
    for (const sol of solicitations) {
      // Card cancelado sai do quadro (continua em Respostas/Solicitações, com o histórico).
      if (sol.status === SolicitationStatus.CANCELLED) continue;
      const phaseId = resolvePhaseId(sol);
      const cardPhase = phasesById.get(phaseId);
      if (cardPhase && !this.cardFilter.shows(cardPhase, sol, actor, seesAll, answerOf)) continue;
      const card = this.toKanbanCard(sol);
      if (valueField) card.value = valuesBySolicitation.get(sol.id) ?? null;
      card.phaseEnteredAt = phaseEnteredAtOf(sol).toISOString();
      const phaseSla = this.cardPhaseSla(sol, phasesById.get(phaseId));
      if (phaseSla) card.phaseSla = phaseSla;
      const column = cardsByPhase.get(phaseId);
      if (!column) continue;
      column.push(card);
      shown.push(sol);
      cardsById.set(sol.id, card);
    }
    // Solicitante de quem respondeu pelo link público (sem usuário): o nome que a pessoa deu no envio.
    // Só quando alguma fase mostra o solicitante no card.
    const showsRequester = [...displayByPhase.values()].some(({ display }) => display.indicators.includes('requester'));
    const anonymous = shown.filter((sol) => !sol.createdByUser && sol.submissionId);
    if (showsRequester && anonymous.length) {
      const submissions = await this.dataSource.getRepository(SubmissionEntity).find({
        where: { id: In(anonymous.map((sol) => sol.submissionId as string)) },
        select: { id: true, responderName: true },
      });
      const nameBySubmission = new Map(
        (submissions ?? []).map((sub) => {
          const name = sub.responderName?.trim();
          return [sub.id, name === '' ? null : (name ?? null)] as const;
        }),
      );
      for (const sol of anonymous) {
        const card = cardsById.get(sol.id);
        const name = nameBySubmission.get(sol.submissionId as string);
        if (card && name && !card.requesterName) card.requesterName = name;
      }
    }
    if (this.cardDisplay) {
      const fieldsByCard = await this.cardDisplay.loadCardFields(
        formId,
        shown,
        (sol) => displayByPhase.get(resolvePhaseId(sol))?.display ?? DEFAULT_CARD_DISPLAY,
      );
      for (const [id, fields] of fieldsByCard) {
        const card = cardsById.get(id);
        if (card) card.fields = fields;
      }
    }

    return {
      groupBy: 'phase',
      ...(typeof form?.name === 'string' ? { formName: form.name } : {}),
      ...(valueField ? { valueField } : {}),
      columns: visiblePhases.map((phase) => {
        const cards = cardsByPhase.get(phase.id) ?? [];
        return {
          id: phase.id,
          label: phase.label,
          color: phase.color,
          ...(seesAll && normalizePhaseVisibility(phase.visibleTo) ? { restrictedVisibility: true } : {}),
          ...(seesAll && cardFilterRulesOf(phase) ? { cardFilterRules: cardFilterRulesOf(phase) } : {}),
          ...(valueField ? { totalValue: sumCardValues(cards) } : {}),
          // Ponto sem volta: o web segura o arrastar para trás de quem não configura as fases.
          ...(phase.blockMoveBack ? { blockMoveBack: true } : {}),
          cardDisplay: displayByPhase.get(phase.id)?.display ?? DEFAULT_CARD_DISPLAY,
          cardDisplaySource: displayByPhase.get(phase.id)?.source ?? 'default',
          cards,
        };
      }),
    };
  }

  /**
   * Valor do campo escolhido em cada solicitação, como número. Mesma precedência dos fluxos: a
   * resposta do formulário ganha, depois o valor dado por um fluxo, por último o campo de fase.
   */
  private async loadCardValues(
    fieldCode: string,
    solicitations: SolicitationEntity[],
  ): Promise<Map<string, number>> {
    const ids = solicitations.map((sol) => sol.id);
    const submissionIds = solicitations
      .map((sol) => sol.submissionId)
      .filter((id): id is string => !!id);
    const [phaseValues, formItems] = await Promise.all([
      ids.length
        ? this.phaseFieldValuesRepository.find({ where: { solicitationId: In(ids), fieldCode } })
        : Promise.resolve([]),
      submissionIds.length
        ? this.dataSource
            .getRepository(SubmissionItemEntity)
            .find({ where: { submissionId: In(submissionIds), fieldCode } })
        : Promise.resolve([]),
    ]);
    const asNumber = (item: { valueNumber: number | null; valueText: string | null }): number | null =>
      coerceAnswerToNumber(item.valueNumber ?? item.valueText);
    const phaseBySolicitation = new Map(phaseValues.map((item) => [item.solicitationId, asNumber(item)]));
    const formBySubmission = new Map(formItems.map((item) => [item.submissionId, asNumber(item)]));

    const values = new Map<string, number>();
    for (const sol of solicitations) {
      const fromForm = sol.submissionId ? formBySubmission.get(sol.submissionId) : undefined;
      const fromFlow = coerceAnswerToNumber(readSolicitationFormFieldValues(sol.metadata)[fieldCode]);
      const value = fromForm ?? fromFlow ?? phaseBySolicitation.get(sol.id) ?? null;
      if (value !== null) values.set(sol.id, value);
    }
    return values;
  }

  /** Prazo do card na fase em que está; `undefined` quando a fase não tem prazo. */
  private cardPhaseSla(
    sol: SolicitationEntity,
    phase: KanbanPhaseEntity | undefined,
  ): KanbanCard['phaseSla'] {
    if (!phase || !hasPhaseSla(phase)) return undefined;
    const dueAt = effectivePhaseDueAt(sol, phase) as Date;
    const enteredAt = phaseEnteredAtOf(sol);
    const progress = phaseSlaProgress(enteredAt, dueAt, {
      businessHours: phase.slaBusinessHours,
      warningPercent: warningPercentOf(phase),
    });
    return {
      enteredAt: enteredAt.toISOString(),
      dueAt: dueAt.toISOString(),
      businessHours: phase.slaBusinessHours,
      extended: Boolean(sol.phaseDueAt),
      ...progress,
    };
  }

  /**
   * Painel inicial: solicitações em andamento de todos os processos que o usuário vê (mesmo escopo
   * e mesma visibilidade de fase do Kanban), agrupadas por processo e fase, e as que dependem dele.
   */
  async getProcessPanel(actor: JwtPayload): Promise<ProcessPanelDto> {
    const allPhases = await this.kanbanPhasesRepository.find({ order: { order: 'ASC' } });
    const phasesByFormId = new Map<string, KanbanPhaseEntity[]>();
    for (const phase of allPhases) {
      const list = phasesByFormId.get(phase.formId);
      if (list) list.push(phase);
      else phasesByFormId.set(phase.formId, [phase]);
    }

    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoinAndSelect('solicitation.form', 'form')
      .leftJoinAndSelect('solicitation.assignee', 'assignee')
      .leftJoinAndSelect('solicitation.createdByUser', 'createdByUser')
      .where('solicitation.form_id IS NOT NULL');
    await this.processAccess.applySolicitationScope(qb, actor);

    const [solicitations, grants, myPendingSteps] = await Promise.all([
      qb.getMany(),
      this.processAccess.grantsOf(actor),
      this.dataSource
        .getRepository(ApprovalStepEntity)
        .createQueryBuilder('step')
        .innerJoin('step.approval', 'approval')
        .select('approval.solicitation_id', 'solicitationId')
        .where('step.status = :pending', { pending: ApprovalStepStatus.PENDING })
        .andWhere('approval.status = :approvalPending', { approvalPending: ApprovalStatus.PENDING })
        .andWhere('(step.assigned_user_id = :sub OR step.assigned_role_code = :role)', {
          sub: actor.sub,
          role: actor.role,
        })
        .getRawMany<{ solicitationId: string }>(),
    ]);

    // Vê todas as fases de um processo quem configura as fases dele.
    const seesAllIn = (formId: string): boolean => grants.scope(formId, 'kanban_phases.manage') !== 'none';

    // Mesma regra do board: card sem fase (ou com fase apagada) está na primeira; fase final não
    // conta; fase que o usuário não vê esconde o card.
    const panelPhaseOf = (sol: SolicitationEntity): KanbanPhaseEntity | undefined => {
      const formPhases = phasesByFormId.get(sol.formId as string);
      if (!formPhases?.length) return undefined;
      return formPhases.find((p) => p.id === sol.currentPhaseId) ?? formPhases[0];
    };
    // Filtro de cards pela resposta, só nos processos em que o usuário não configura as fases.
    const panelAnswerOf = await this.cardFilter.loadAnswers(solicitations, (sol) => {
      const phase = panelPhaseOf(sol);
      return phase && !seesAllIn(phase.formId) ? phase : undefined;
    });
    const entries: ProcessPanelCard[] = [];
    for (const sol of solicitations) {
      const phase = panelPhaseOf(sol);
      if (!phase) continue;
      if (phase.isTerminal || !canSeePhase(phase, actor, seesAllIn(phase.formId))) continue;
      if (!this.cardFilter.shows(phase, sol, actor, seesAllIn(phase.formId), panelAnswerOf)) continue;
      const card = this.toKanbanCard(sol);
      const enteredAt = phaseEnteredAtOf(sol);
      card.phaseId = phase.id;
      card.phaseEnteredAt = enteredAt.toISOString();
      const phaseSla = this.cardPhaseSla(sol, phase);
      if (phaseSla) card.phaseSla = phaseSla;
      entries.push({ card, formName: sol.form?.name ?? 'Processo', phase, enteredAt });
    }

    const visiblePhasesByForm = new Map(
      [...phasesByFormId].map(([formId, phases]) => [
        formId,
        phases.filter((phase) => !phase.isTerminal && canSeePhase(phase, actor, seesAllIn(phase.formId))),
      ]),
    );

    return buildProcessPanel({
      entries,
      phasesByForm: visiblePhasesByForm,
      viewer: actor,
      myApprovalSolicitationIds: new Set(myPendingSteps.map((row) => row.solicitationId)),
    });
  }

  /**
   * Resumo da solicitação para o aviso em tempo real, ou `null` se o usuário não a vê: mesmo
   * escopo de `findOne` e, com processo, a fase em que está precisa estar visível para ele.
   */
  async describeIfVisible(
    id: string,
    actor: JwtPayload,
  ): Promise<{ id: string; title: string; formId: string | null; formName: string | null } | null> {
    let solicitation: SolicitationEntity;
    try {
      solicitation = await this.findOne(id, actor);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) return null;
      throw error;
    }
    if (solicitation.formId) {
      const phases = await this.kanbanPhasesRepository.find({
        where: { formId: solicitation.formId },
        order: { order: 'ASC' },
      });
      const phase = phases.find((p) => p.id === solicitation.currentPhaseId) ?? phases[0];
      const seesAll = await this.processAccess.hasInProcess(actor, solicitation.formId, 'kanban_phases.manage');
      // O filtro de cards da fase pela resposta já barrou em `findOne` (é regra de acesso ao card).
      if (phase && !canSeePhase(phase, actor, seesAll)) return null;
    }
    return {
      id: solicitation.id,
      title: solicitation.title,
      formId: solicitation.formId,
      formName: solicitation.form?.name ?? null,
    };
  }

  async getKanbanSummary(actor: JwtPayload): Promise<KanbanFormSummary[]> {
    const allPhases = await this.kanbanPhasesRepository.find({ order: { order: 'ASC' } });
    const phasesByFormId = new Map<string, KanbanPhaseEntity[]>();
    for (const phase of allPhases) {
      const list = phasesByFormId.get(phase.formId);
      if (list) list.push(phase);
      else phasesByFormId.set(phase.formId, [phase]);
    }

    // Com formulário, quem decide se conta é a fase (isTerminal); sem formulário, o status
    // (mesma regra das colunas padrão do board "Sem formulário").
    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoinAndSelect('solicitation.form', 'form')
      .where('(solicitation.form_id IS NOT NULL OR solicitation.status NOT IN (:...doneStatuses))', {
        doneStatuses: DONE_STAGE_STATUSES,
      });

    await this.processAccess.applySolicitationScope(qb, actor);

    const solicitations = await qb.getMany();
    const grants = await this.processAccess.grantsOf(actor);

    const seesAllPhasesIn = (formId: string): boolean => grants.scope(formId, 'kanban_phases.manage') !== 'none';
    // Mesma regra do board: card escondido pelo filtro de respostas da fase não conta.
    const summaryAnswerOf = await this.cardFilter.loadAnswers(solicitations, (sol) => {
      const formPhases = sol.formId ? phasesByFormId.get(sol.formId) : undefined;
      const phase = formPhases?.length
        ? (formPhases.find((p) => p.id === sol.currentPhaseId) ?? formPhases[0])
        : undefined;
      return phase && !seesAllPhasesIn(phase.formId) ? phase : undefined;
    });

    const summaryByFormId = new Map<string, KanbanFormSummary>();
    for (const sol of solicitations) {
      const formPhases = sol.formId ? phasesByFormId.get(sol.formId) : undefined;
      if (formPhases && formPhases.length > 0) {
        // Mesma regra do board: cancelado não aparece, então não conta.
        if (sol.status === SolicitationStatus.CANCELLED) continue;
        // A solicitation with no (or stale) currentPhaseId falls back to the
        // first phase, mirroring getKanbanBoardByPhase's column assignment.
        const resolvedPhase =
          formPhases.find((p) => p.id === sol.currentPhaseId) ?? formPhases[0];
        if (resolvedPhase.isTerminal) continue;
        // Mesma regra do board: card numa fase que o usuário não vê não conta.
        if (!canSeePhase(resolvedPhase, actor, seesAllPhasesIn(resolvedPhase.formId))) {
          continue;
        }
        if (!this.cardFilter.shows(resolvedPhase, sol, actor, seesAllPhasesIn(resolvedPhase.formId), summaryAnswerOf)) {
          continue;
        }
      } else if (defaultStageForStatus(sol.status) === 'concluido') {
        continue;
      }

      const key = sol.formId ?? 'unassigned';
      const existing = summaryByFormId.get(key);
      const isUrgent = sol.priority === SolicitationPriority.URGENT;
      if (existing) {
        existing.totalCards += 1;
        if (isUrgent) existing.urgentCount += 1;
      } else {
        summaryByFormId.set(key, {
          formId: sol.formId ?? null,
          formName: sol.form?.name ?? 'Sem formulário',
          totalCards: 1,
          urgentCount: isUrgent ? 1 : 0,
        });
      }
    }

    return Array.from(summaryByFormId.values()).sort((a, b) =>
      a.formName.localeCompare(b.formName, 'pt-BR'),
    );
  }

  async moveCard(
    id: string,
    dto: MoveKanbanCardDto,
    actor: SolicitationActor,
    options: FlowMutationOptions = {},
  ): Promise<SolicitationEntity> {
    const actorId = this.getActorId(actor);
    const changed = await this.dataSource.transaction(async (manager) => {
      const solicitation = await this.findForMutationOrFail(manager, id, actor);

      if (!options.skipTransitionCheck && !isTransitionAllowed(solicitation.status, dto.status)) {
        throw new BadRequestException(
          `Transição de "${solicitation.status}" para "${dto.status}" não é permitida.`,
        );
      }

      const fromStatus = solicitation.status;
      const fromAssigneeId = solicitation.assigneeId;
      solicitation.status = dto.status;

      if (dto.responsibleUserId !== undefined) {
        solicitation.assigneeId = await this.resolveAssigneeId(manager, dto.responsibleUserId);
      }

      if (dto.currentStage !== undefined) {
        solicitation.metadata = { ...(solicitation.metadata ?? {}), currentStage: dto.currentStage };
      }

      await manager.getRepository(SolicitationEntity).save(solicitation);

      await this.registerHistory(
        {
          solicitationId: solicitation.id,
          eventType: SolicitationHistoryEventType.STATUS_CHANGED,
          actorId,
          fromValue: fromStatus,
          toValue: dto.status,
          message: `Movido via Kanban${dto.currentStage ? ` — estágio: ${dto.currentStage}` : ''}.`,
          metadata: { currentStage: dto.currentStage ?? null },
        },
        manager,
      );

      return {
        fromStatus,
        toStatus: dto.status,
        createdAt: solicitation.createdAt,
        slaStartedAt: solicitation.slaStartedAt,
        newAssigneeId:
          solicitation.assigneeId !== fromAssigneeId ? solicitation.assigneeId : null,
      };
    });

    this.eventEmitter.emit(
      'solicitations.moved',
      new SolicitationMovedEvent(
        actorId,
        id,
        changed.fromStatus,
        changed.toStatus,
        options.flowEventDepth ?? 0,
      ),
    );

    this.metricsService.decrementSolicitationsByStatus(changed.fromStatus);
    this.metricsService.incrementSolicitationsByStatus(changed.toStatus);
    this.metricsService.incrementKanbanMoves(changed.fromStatus, changed.toStatus);

    if (changed.toStatus === SolicitationStatus.COMPLETED) {
      const startedAt = changed.slaStartedAt ?? changed.createdAt;
      const completionHours = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);
      this.metricsService.observeSolicitationCompletionHours(completionHours);
    }

    this.logger.log(
      {
        solicitationId: id,
        actorId: actorId ?? undefined,
        status: changed.toStatus,
      },
      'Solicitation moved',
    );

    const result = await this.loadDetail(id);

    if (changed.newAssigneeId) this.notifyAssigned(id, result.title, changed.newAssigneeId, actorId);
    await this.notifyStatusChange(result, changed.fromStatus, changed.toStatus, actorId);

    return result;
  }

  /** Quem passou a ser responsável pelo card (se não foi a própria pessoa que se atribuiu). */
  private notifyAssigned(
    solicitationId: string,
    title: string,
    assigneeId: string | null | undefined,
    actorId: string | null,
  ): void {
    if (!assigneeId) return;
    void this.userNotice?.notify({
      kind: 'assigned',
      userIds: [assigneeId],
      exceptUserIds: [actorId],
      title: 'Você é o responsável',
      pushTitle: '📌 Você é o responsável',
      body: `"${title}" foi atribuída a você.`,
      link: solicitationLink(solicitationId),
      solicitationId,
    });
  }

  /**
   * Mudança de status (Kanban, quadro "Sem formulário" ou o seletor do detalhe): aviso no sino/app
   * para quem abriu a solicitação e e-mail para o solicitante — o mesmo em qualquer caminho.
   */
  private async notifyStatusChange(
    result: SolicitationEntity,
    fromStatus: string,
    toStatus: string,
    actorId: string | null,
  ): Promise<void> {
    const NOTIFY_TRANSITIONS = ['approved', 'rejected', 'completed', 'cancelled', 'in_progress'];
    if (!NOTIFY_TRANSITIONS.includes(toStatus)) return;

    void this.userNotice?.notify({
      kind: 'status_update',
      userIds: [result.createdBy],
      exceptUserIds: [actorId],
      title: 'Solicitação atualizada',
      pushTitle: '✅ Solicitação atualizada',
      body: `Sua solicitação "${result.title}" agora está: ${statusLabel(toStatus)}.`,
      link: solicitationLink(result.id),
      solicitationId: result.id,
    });

    if (!this.mailerService) return;
    const requesterEmail =
      result.createdByUser?.email ??
      (result.metadata?.['responderEmail'] as string | undefined) ??
      null;
    if (!requesterEmail) return;
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const orgName = await this.settingsService
      .getValue<string>('org.name', PRODUCT_NAME)
      .catch(() => PRODUCT_NAME);
    const html = buildStatusChangeEmail({
      orgName,
      solicitationTitle: result.title,
      solicitationNumber: result.id.slice(0, 8).toUpperCase(),
      fromStatusLabel: statusLabel(fromStatus),
      toStatusLabel: statusLabel(toStatus),
      trackingUrl: `${frontendUrl}/acompanhar/${result.trackingToken}`,
    });
    void this.mailerService
      .send([requesterEmail], `[${PRODUCT_NAME}] Sua solicitação foi atualizada`, html)
      .catch((err: unknown) =>
        this.logger.warn({ err }, 'Falha ao enviar email de notificação de status'),
      );
  }

  /**
   * Move uma solicitação SEM formulário entre as colunas padrão (Novo/Pendente/Concluído) do
   * board "Sem formulário". Como ela não tem fases, a coluna vira status (STATUS_FOR_DEFAULT_STAGE)
   * e passa pelo moveCard — histórico, eventos de fluxo, métricas e notificações iguais.
   */
  async moveStage(
    id: string,
    dto: MoveStageDto,
    actor: SolicitationActor,
  ): Promise<SolicitationEntity> {
    const solicitation = await this.dataSource.transaction((manager) =>
      this.findForMutationOrFail(manager, id, actor),
    );
    if (solicitation.formId) {
      throw new BadRequestException(
        'Esta solicitação pertence a um formulário: mova-a pelas fases do Kanban do formulário.',
      );
    }
    if (defaultStageForStatus(solicitation.status) === dto.stage) {
      return this.findOne(id, actor);
    }
    return this.moveCard(id, { status: STATUS_FOR_DEFAULT_STAGE[dto.stage] }, actor, {
      skipTransitionCheck: true,
    });
  }

  async movePhase(
    id: string,
    dto: MovePhaseDto,
    actor: SolicitationActor,
    /** `byAutomation`: o movimento é do processo (fluxo, regra da fase), não de uma pessoa. */
    options: { flowEventDepth?: number; byAutomation?: boolean } = {},
  ): Promise<SolicitationEntity> {
    const actorId = this.getActorId(actor);
    const phase = await this.kanbanPhasesRepository.findOne({ where: { id: dto.phaseId } });
    if (!phase) throw new NotFoundException('Fase nao encontrada.');

    // Quem aprova a fase e leva o card adiante aprova ao mover (antes da trava, que então passa).
    const approvedByMove = await this.approveCurrentPhaseOnMove(id, phase, actor, options.byAutomation === true);
    try {
      return await this.movePhaseUnchecked(id, dto, phase, actor, actorId, options, approvedByMove);
    } finally {
      if (approvedByMove) this.approvalsDecidedByMove.delete(approvedByMove);
    }
  }

  private async movePhaseUnchecked(
    id: string,
    dto: MovePhaseDto,
    phase: KanbanPhaseEntity,
    actor: SolicitationActor,
    actorId: string | null,
    options: { flowEventDepth?: number; byAutomation?: boolean },
    approvedByMove: string | null,
  ): Promise<SolicitationEntity> {
    const changed = await this.dataSource.transaction(async (manager) => {
      const solicitation = await this.findForMutationOrFail(manager, id, actor);
      if (phase.formId !== solicitation.formId) {
        throw new BadRequestException('Esta fase nao pertence ao formulario desta solicitacao.');
      }
      if (solicitation.currentPhaseId === dto.phaseId) return null;

      const effectiveCurrentPhaseId = await this.resolveEffectivePhaseId(
        solicitation.formId,
        solicitation.currentPhaseId,
        manager,
      );
      // Só faz sentido exigir aprovação ao sair da fase efetiva — formalizar a
      // entrada nela pela primeira vez (currentPhaseId nulo -> a própria fase
      // efetiva) não é uma saída.
      const isRealMove = !effectiveCurrentPhaseId || effectiveCurrentPhaseId !== dto.phaseId;
      const currentPhase =
        effectiveCurrentPhaseId && effectiveCurrentPhaseId !== dto.phaseId
          ? await manager.findOne(KanbanPhaseEntity, { where: { id: effectiveCurrentPhaseId } })
          : null;
      // Voltar para uma fase anterior (devolver o card) nunca depende de aprovação: é o caminho de
      // quem reprovou. A aprovação pendente da fase que o card deixa é cancelada.
      const movingBack =
        currentPhase !== null &&
        typeof currentPhase.order === 'number' &&
        typeof phase.order === 'number' &&
        phase.order < currentPhase.order;
      if (currentPhase && movingBack) {
        await this.assertCanMoveBack(manager, solicitation.formId, currentPhase, phase, actor, options.byAutomation === true);
        await this.cancelPendingPhaseApprovals(manager, id, currentPhase.id);
      } else if (currentPhase) {
        await this.assertPhaseExitRequirements(manager, solicitation, currentPhase);
        await this.assertPhaseApprovalsAllowExit(manager, solicitation, currentPhase, {
          byAutomation: options.byAutomation === true,
          actor,
          approvedByMe: approvedByMove !== null,
        });
      }

      const previous = solicitation.currentPhaseId;
      solicitation.currentPhaseId = dto.phaseId;
      // Linha do tempo e prazo da fase: entrar na fase em que o card já estava (sair do "sem
      // fase" para a 1ª) não reinicia o relógio.
      if (isRealMove) {
        await recordPhaseChange(manager, { solicitation, from: currentPhase, to: phase, now: new Date() });
      }
      await manager.getRepository(SolicitationEntity).save(solicitation);

      await this.registerHistory(
        {
          solicitationId: solicitation.id,
          eventType: SolicitationHistoryEventType.PHASE_CHANGED,
          actorId,
          fromValue: previous,
          toValue: dto.phaseId,
          message: `Movido para a fase "${phase.label}".`,
        },
        manager,
      );

      return {
        fromPhaseId: effectiveCurrentPhaseId,
        toPhaseId: dto.phaseId,
        toPhaseLabel: phase.label,
        isRealMove,
      };
    });

    if (changed) {
      this.logger.log(
        { solicitationId: id, actorId: actorId ?? undefined, phaseId: changed.toPhaseId },
        'Solicitation phase changed',
      );
      // Só mudança de verdade: formalizar a entrada na 1ª fase (sem fase → ela mesma) não é
      // "entrar na fase" — o gatilho de solicitação criada já cobre esse momento.
      if (changed.isRealMove) {
        this.eventEmitter.emit(
          'solicitations.phase_changed',
          new PhaseChangedEvent(
            actorId,
            id,
            changed.fromPhaseId,
            changed.toPhaseId,
            options.flowEventDepth ?? 0,
          ),
        );
      }
    }

    const detail = await this.loadDetail(id);
    if (changed?.isRealMove) {
      // Quem abriu a solicitação acompanha o andamento pelas fases (quem moveu já sabe).
      void this.userNotice?.notify({
        kind: 'phase_changed',
        userIds: [detail.createdBy],
        exceptUserIds: [actorId],
        title: 'Solicitação mudou de fase',
        pushTitle: '➡️ Solicitação mudou de fase',
        body: `Sua solicitação "${detail.title}" está agora na fase "${changed.toPhaseLabel}".`,
        link: solicitationLink(id),
        solicitationId: id,
      });
    }
    return detail;
  }

  /**
   * Volta do card que cruza um ponto sem volta (`blockMoveBack`) só passa para quem configura as
   * fases do processo (corrigir avanço por engano) e para o processo (fluxo, reprovação que devolve
   * sozinha). Ator nulo é o sistema.
   */
  private async assertCanMoveBack(
    manager: EntityManager,
    formId: string,
    currentPhase: KanbanPhaseEntity,
    target: KanbanPhaseEntity,
    actor: SolicitationActor,
    byAutomation: boolean,
  ): Promise<void> {
    if (byAutomation || !actor) return;
    const phases = await manager.find(KanbanPhaseEntity, { where: { formId } });
    const barrier = moveBackBarrier(phases, currentPhase.order, target.order);
    if (!barrier) return;
    if (await this.processAccess.hasInProcess(actor, formId, 'kanban_phases.manage')) return;
    throw new BadRequestException(moveBackMessage(barrier));
  }

  /**
   * Para sair da fase (para frente): se ela exige aprovação, precisa de uma aprovada NESTA passagem
   * do card — card devolvido e que volta à fase precisa ser aprovado de novo; e qualquer aprovação
   * da fase criada nesta passagem (pelo botão ou por um fluxo, como "acima de R$ 10 mil o diretor
   * aprova") segura o card enquanto estiver pendente ou se foi reprovada.
   *
   * Reprovada segura só as pessoas. O movimento do processo (`byAutomation`: nó "Mover para fase"
   * de um fluxo, regra da fase) passa, porque é o caminho da reprovação, como "Não → Cancelado"
   * quando Cancelado vem depois na ordem. Pendente segura todo mundo.
   */
  private async assertPhaseApprovalsAllowExit(
    manager: EntityManager,
    solicitation: SolicitationEntity,
    currentPhase: KanbanPhaseEntity,
    context: { byAutomation: boolean; actor: SolicitationActor; approvedByMe: boolean },
  ): Promise<void> {
    const latest = await this.latestVisitApproval(manager, solicitation.id, currentPhase.id);
    if (latest?.status === ApprovalStatus.PENDING) {
      throw await this.phaseApprovalBlock(
        manager,
        currentPhase,
        'phase_approval_pending',
        context.approvedByMe
          ? `Sua aprovação da fase "${currentPhase.label}" foi registrada. O card avança quando os demais aprovadores decidirem.`
          : `A fase atual ("${currentPhase.label}") tem uma aprovação pendente. Aguarde a decisão para avançar.`,
        false,
      );
    }
    if (latest?.status === ApprovalStatus.REJECTED) {
      if (context.byAutomation) return;
      throw await this.phaseApprovalBlock(
        manager,
        currentPhase,
        'phase_approval_rejected',
        `A aprovação da fase atual ("${currentPhase.label}") foi reprovada: o card só pode voltar para uma fase anterior.`,
        false,
      );
    }

    if (currentPhase.requiresApproval) {
      const approved = await this.latestVisitApproval(manager, solicitation.id, currentPhase.id, ApprovalStatus.APPROVED);
      if (!approved) {
        throw await this.phaseApprovalBlock(
          manager,
          currentPhase,
          'phase_approval_required',
          `A fase atual ("${currentPhase.label}") exige aprovação antes de avançar.`,
          await this.canRequestPhaseApproval(currentPhase, context.actor),
        );
      }
    }
  }

  /**
   * Recusa da trava de aprovação com o que a tela precisa para o pop-up: qual fase, quem aprova e se
   * quem tentou mover pode pedir a aprovação ali mesmo. `message` continua sendo o texto de sempre
   * (o app móvel e quem só lê `message` não mudam).
   */
  private async phaseApprovalBlock(
    manager: EntityManager,
    phase: KanbanPhaseEntity,
    code: 'phase_approval_required' | 'phase_approval_pending' | 'phase_approval_rejected',
    message: string,
    canRequest: boolean,
  ): Promise<BadRequestException> {
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message,
      code,
      phaseId: phase.id,
      phaseLabel: phase.label,
      approvers: await this.approverNames(manager, phaseApprovers(phase)),
      canRequest,
    });
  }

  /** "Ana Souza", "perfil Gerente": nomes para o pop-up (o código quando o nome não é achado). */
  private async approverNames(
    manager: EntityManager,
    approvers: ReturnType<typeof phaseApprovers>,
  ): Promise<string[]> {
    if (!approvers) return [];
    const [users, roles] = await Promise.all([
      approvers.userIds.length
        ? manager.find(UserEntity, { where: { id: In(approvers.userIds) }, select: ['id', 'fullName'] })
        : Promise.resolve([] as UserEntity[]),
      approvers.roleCodes.length
        ? manager.find(RoleEntity, { where: { code: In(approvers.roleCodes) }, select: ['code', 'name'] })
        : Promise.resolve([] as RoleEntity[]),
    ]);
    const userName = new Map((users ?? []).map((user) => [user.id, user.fullName]));
    const roleName = new Map((roles ?? []).map((role) => [role.code, role.name]));
    return [
      ...approvers.userIds.map((userId) => userName.get(userId) ?? 'usuário removido'),
      ...approvers.roleCodes.map((code) => `perfil ${roleName.get(code) ?? code}`),
    ];
  }

  /** Mesma regra do "Solicitar aprovação" (requestCurrentPhaseApproval), para o pop-up oferecer o botão. */
  private async canRequestPhaseApproval(phase: KanbanPhaseEntity, actor: SolicitationActor): Promise<boolean> {
    if (!actor || !phase.requiresApproval || !phaseApprovers(phase)) return false;
    const actors = phaseActors(phase);
    if (!actors || isPhasePerson(actors, actor)) return true;
    return (await this.processAccess.grantsOf(actor)).fullAccess;
  }

  /**
   * Quem aprova a fase (perfil ou usuário da lista de aprovadores) e leva o card para frente aprova
   * ao mover: decide a etapa dele na aprovação pendente desta passagem ou, sem uma pendente (nenhuma,
   * reprovada ou cancelada), pede uma e já a aprova. Antes de aprovar confere as outras travas de
   * saída (obrigatórios, responsável), para não deixar uma aprovação concluída com o card parado.
   *
   * Basta um aprovador: a aprovação conclui e a trava passa. "Todos" ou "em sequência": a etapa dele
   * fica aprovada e a trava segura o card até os demais decidirem. Devolve o id da aprovação decidida
   * aqui — a regra "aprovada → próxima fase" fica de fora dela (ver applyPhaseApprovalOutcome), quem
   * leva o card é este movimento — ou null quando não aprovou nada.
   */
  private async approveCurrentPhaseOnMove(
    id: string,
    target: KanbanPhaseEntity,
    actor: SolicitationActor,
    byAutomation: boolean,
  ): Promise<string | null> {
    if (!actor || byAutomation) return null;
    const manager = this.dataSource.manager;
    const solicitation = await this.findForMutationOrFail(manager, id, actor);
    if (!solicitation.formId || target.formId !== solicitation.formId) return null;
    if (TERMINAL_SOLICITATION_STATUSES.includes(solicitation.status)) return null;
    const currentPhaseId = await this.resolveEffectivePhaseId(solicitation.formId, solicitation.currentPhaseId, manager);
    if (!currentPhaseId || currentPhaseId === target.id) return null;
    const current = await manager.findOne(KanbanPhaseEntity, { where: { id: currentPhaseId } });
    if (!current?.requiresApproval) return null;
    if (typeof current.order === 'number' && typeof target.order === 'number' && target.order < current.order) {
      return null;
    }
    const approvers = phaseApprovers(current);
    if (!approvers || !isPhasePerson(approvers, actor)) return null;

    const latest = await this.latestVisitApproval(manager, solicitation.id, current.id);
    if (latest?.status === ApprovalStatus.APPROVED) return null;
    await this.assertPhaseExitRequirements(manager, solicitation, current);

    const approval =
      latest?.status === ApprovalStatus.PENDING
        ? latest
        : await this.createPhaseApproval(id, current, approvers, actor, {
            // Basta um: decide agora mesmo, ninguém mais precisa ser avisado.
            notify: (current.approvalMode ?? 'any') !== 'any',
          });
    const myStep = await manager.findOne(ApprovalStepEntity, {
      where: [
        { approvalId: approval.id, status: ApprovalStepStatus.PENDING, assignedUserId: actor.sub },
        { approvalId: approval.id, status: ApprovalStepStatus.PENDING, assignedRoleCode: actor.role },
      ],
    });
    // Em sequência e não é a vez dele: o pedido fica feito e a trava mostra que está pendente.
    if (!myStep) return null;

    this.approvalsDecidedByMove.add(approval.id);
    try {
      await this.approvalsService.approveStep(
        myStep.id,
        { decision: 'approved', comment: `Aprovado ao mover o card para "${target.label}".` },
        actor,
      );
    } catch (error) {
      this.approvalsDecidedByMove.delete(approval.id);
      throw error;
    }
    return approval.id;
  }

  /**
   * Última aprovação da fase criada desde que o card entrou nela. A comparação é toda no banco:
   * `approvals.created_at` não tem fuso (gravado pelo relógio da sessão) e `phase_entered_at` tem —
   * converter a entrada para o relógio da sessão vale em qualquer fuso do servidor da API.
   */
  private latestVisitApproval(
    manager: EntityManager,
    solicitationId: string,
    phaseId: string,
    status?: ApprovalStatus,
  ): Promise<ApprovalEntity | null> {
    const query = manager
      .createQueryBuilder(ApprovalEntity, 'approval')
      .innerJoin(SolicitationEntity, 'visit', 'visit.id = approval.solicitationId')
      .where('approval.solicitationId = :solicitationId', { solicitationId })
      .andWhere('approval.phaseId = :phaseId', { phaseId })
      .andWhere(
        "approval.created_at >= COALESCE(visit.phase_entered_at AT TIME ZONE current_setting('TimeZone'), visit.created_at)",
      );
    if (status) query.andWhere('approval.status = :status', { status });
    return query.orderBy('approval.created_at', 'DESC').getOne();
  }

  /** Card devolvido para trás: a aprovação pendente da fase que ele deixou não vale mais. */
  private async cancelPendingPhaseApprovals(
    manager: EntityManager,
    solicitationId: string,
    phaseId: string,
  ): Promise<void> {
    const pending = await manager.find(ApprovalEntity, {
      where: { solicitationId, phaseId, status: ApprovalStatus.PENDING },
    });
    const now = new Date();
    for (const approval of pending) {
      await manager.getRepository(ApprovalEntity).save({
        ...approval,
        status: ApprovalStatus.CANCELLED,
        cancelledAt: now,
      });
      const steps = await manager.find(ApprovalStepEntity, {
        where: [
          { approvalId: approval.id, status: ApprovalStepStatus.PENDING },
          { approvalId: approval.id, status: ApprovalStepStatus.WAITING },
        ],
      });
      for (const step of steps) {
        await manager.getRepository(ApprovalStepEntity).save({ ...step, status: ApprovalStepStatus.SKIPPED });
      }
    }
  }

  async getPhaseFieldValues(
    id: string,
    actor: SolicitationActor,
  ): Promise<KanbanPhaseFieldValueEntity[]> {
    await this.findOne(id, actor);
    return this.phaseFieldValuesRepository.find({ where: { solicitationId: id } });
  }

  async savePhaseFieldValues(
    id: string,
    dto: SavePhaseFieldValuesDto,
    actor: SolicitationActor,
  ): Promise<KanbanPhaseFieldValueEntity[]> {
    const solicitation = await this.findOne(id, actor);
    await this.assertActorCanAccess(solicitation, actor, 'solicitations.act');
    const effectivePhaseId = await this.resolveEffectivePhaseId(
      solicitation.formId,
      solicitation.currentPhaseId,
    );

    const phase = effectivePhaseId
      ? await this.kanbanPhasesRepository.findOne({
          where: { id: effectivePhaseId },
          relations: { fields: true },
        })
      : null;

    if (actor && phase) {
      await this.assertCanActInPhase(phase, actor, 'preencher os campos desta fase');
    }

    // "Pedido de itens" só é preenchido pelo portal web, que manda sempre um objeto (`{ rows }`,
    // vazio para limpar). O app móvel não conhece o campo e manda texto ou nada: fica de fora, para
    // não apagar o pedido salvo.
    const orderFieldIds = new Set(
      (phase?.fields ?? [])
        .filter((field) => field.fieldType === FormFieldType.ITEM_ORDER)
        .map((field) => field.id),
    );
    const items = dto.items.filter(
      (item) =>
        !orderFieldIds.has(item.phaseFieldId) ||
        (!!item.valueJson && typeof item.valueJson === 'object' && !Array.isArray(item.valueJson)),
    );

    // Formulário da fase com ramificação: só as seções do caminho (com as respostas como ficam
    // depois deste salvamento) contam. Campo fora do caminho não é cobrado e perde o valor — como
    // no formulário de abertura, que não guarda resposta de seção que não foi visitada.
    const hiddenFieldIds =
      phase?.sectionFlow?.length && phase.fields?.length
        ? await this.hiddenPhaseFieldIds(id, phase, items)
        : new Set<string>();

    if (phase?.fields?.length) {
      await this.assertRequiredPhaseFields(
        id,
        phase.fields.filter((field) => !hiddenFieldIds.has(field.id)),
        items,
      );
      await this.assertSuggestedUserEmails(
        phase.fields.filter((field) => !hiddenFieldIds.has(field.id)),
        items,
      );
    }

    // Campos de todas as fases do formulário: o tipo diz como o valor vai para o banco, e os
    // cálculos de qualquer fase são refeitos depois deste salvamento.
    const formPhaseFields = solicitation.formId
      ? ((await this.kanbanPhasesRepository.find({
          where: { formId: solicitation.formId },
          relations: { fields: true },
        })) ?? []).flatMap((formPhase) => formPhase.fields ?? [])
      : (phase?.fields ?? []);
    const fieldsById = new Map(formPhaseFields.map((field) => [field.id, field]));

    // "Pedido de itens": grava o retrato montado com a lista atual, nunca o que o navegador mandou.
    // Montado antes de gravar qualquer coisa, para um item inválido não deixar o salvamento pela metade.
    const itemOrderValues = new Map<PhaseFieldValueItemDto, ReturnType<typeof normalizePhaseValue>>();
    for (const item of items) {
      const definition = fieldsById.get(item.phaseFieldId);
      if (definition?.fieldType !== FormFieldType.ITEM_ORDER || hiddenFieldIds.has(item.phaseFieldId)) {
        continue;
      }
      itemOrderValues.set(item, {
        ...normalizePhaseValue(definition.fieldType, {}),
        ...(await this.itemOrderFields.resolvePhaseValue(definition, item.valueJson)),
      });
    }

    for (const item of items) {
      const definition = fieldsById.get(item.phaseFieldId);
      // O valor de um cálculo nunca vem do navegador (recalculado abaixo).
      if (definition?.fieldType === FormFieldType.CALCULATED) continue;
      if (hiddenFieldIds.has(item.phaseFieldId)) continue;
      const normalized =
        itemOrderValues.get(item) ?? normalizePhaseValue(definition?.fieldType ?? '', item);
      const existing = await this.phaseFieldValuesRepository.findOne({
        where: { solicitationId: id, phaseFieldId: item.phaseFieldId },
      });
      const values = {
        solicitationId: id,
        phaseFieldId: item.phaseFieldId,
        fieldCode: item.fieldCode,
        ...normalized,
      };
      if (existing) {
        await this.phaseFieldValuesRepository.save({ ...existing, ...values });
      } else {
        await this.phaseFieldValuesRepository.save(this.phaseFieldValuesRepository.create(values));
      }
    }

    if (hiddenFieldIds.size > 0) {
      await this.phaseFieldValuesRepository.delete({
        solicitationId: id,
        phaseFieldId: In([...hiddenFieldIds]),
      });
    }

    await this.recalculatePhaseCalculations(solicitation, formPhaseFields);

    // Campos de fase não sabem nada sobre Flows — só avisam que foram salvos. Qualquer
    // automação (pedir aprovação automaticamente, etc.) é responsabilidade de um Flow com o
    // gatilho "Campos de fase salvos" (ver FlowsPhaseFieldsListener).
    if (effectivePhaseId) {
      this.eventEmitter.emit(
        'solicitations.phase_fields_saved',
        new PhaseFieldsSavedEvent(actor?.sub ?? null, id, effectivePhaseId),
      );
    }

    return this.getPhaseFieldValues(id, actor);
  }

  /**
   * Refaz os campos "Cálculo" de todas as fases com o que está salvo agora (respostas do
   * formulário, valores dados por fluxo e campos de fase). Resultado em branco apaga o valor velho.
   */
  private async recalculatePhaseCalculations(
    solicitation: SolicitationEntity,
    phaseFields: KanbanPhaseFieldEntity[],
  ): Promise<void> {
    const calculated = phaseFields.filter((field) => field.fieldType === FormFieldType.CALCULATED);
    if (calculated.length === 0) return;

    const [formItems, phaseValues] = await Promise.all([
      solicitation.submissionId
        ? this.dataSource
            .getRepository(SubmissionItemEntity)
            .find({ where: { submissionId: solicitation.submissionId } })
        : Promise.resolve([]),
      this.phaseFieldValuesRepository.find({ where: { solicitationId: solicitation.id } }),
    ]);
    const computed = computePhaseCalculations(
      calculated,
      phaseFormulaScope(formItems, readSolicitationFormFieldValues(solicitation.metadata), phaseValues),
    );

    for (const field of calculated) {
      const value = computed[field.code] ?? null;
      const existing = phaseValues.find((item) => item.phaseFieldId === field.id);
      if (value === null) {
        if (existing) await this.phaseFieldValuesRepository.delete(existing.id);
        continue;
      }
      await this.phaseFieldValuesRepository.save({
        ...(existing ?? this.phaseFieldValuesRepository.create({ solicitationId: solicitation.id })),
        phaseFieldId: field.id,
        fieldCode: field.code,
        valueText: null,
        valueNumber: value,
        valueBoolean: null,
        valueJson: null,
      });
    }
  }

  /**
   * Campos da fase que ficam fora do caminho do formulário (ramificação), com as respostas que
   * valem depois deste salvamento: as que vieram agora e, para o resto, as já salvas.
   */
  private async hiddenPhaseFieldIds(
    solicitationId: string,
    phase: KanbanPhaseEntity,
    items: PhaseFieldValueItemDto[],
  ): Promise<Set<string>> {
    const saved = await this.phaseFieldValuesRepository.find({ where: { solicitationId } });
    const savedByField = new Map(saved.map((value) => [value.phaseFieldId, value]));
    const incoming = new Map(items.map((item) => [item.phaseFieldId, item]));
    const valueOf = (field: KanbanPhaseFieldEntity): unknown => {
      const value = incoming.get(field.id) ?? savedByField.get(field.id);
      if (!value) return null;
      return value.valueJson ?? value.valueBoolean ?? value.valueText ?? value.valueNumber ?? null;
    };
    const reachable = reachablePhaseFields(phase.fields, phase.sectionFlow, valueOf);
    return new Set(phase.fields.filter((field) => !reachable.has(field)).map((field) => field.id));
  }

  /**
   * "E-mail de usuário" com "só e-mails sugeridos" na fase: e-mail de quem não é usuário ativo
   * (ou não está entre as pessoas escolhidas) é recusado, com o rótulo do campo na mensagem.
   */
  private async assertSuggestedUserEmails(
    fields: KanbanPhaseFieldEntity[],
    items: PhaseFieldValueItemDto[],
  ): Promise<void> {
    if (!this.userEmailFields) return;
    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    const errors = await this.userEmailFields.findNotSuggested(
      items.flatMap((item) => {
        const field = fieldsById.get(item.phaseFieldId);
        return field
          ? [{ key: field.label, fieldType: field.fieldType, settingsJson: field.settingsJson, value: item.valueText }]
          : [];
      }),
    );
    const labels = Object.keys(errors);
    if (labels.length > 0) {
      throw new BadRequestException(
        `${labels.map((label) => `"${label}"`).join(', ')}: escolha um dos e-mails sugeridos.`,
      );
    }
  }

  /**
   * Campo obrigatório da fase precisa ficar com valor depois deste salvamento — o que veio agora ou,
   * se não veio, o que já estava salvo (regra em kanban-phases/phase-required-fields.ts).
   */
  private async assertRequiredPhaseFields(
    solicitationId: string,
    fields: KanbanPhaseFieldEntity[],
    items: PhaseFieldValueItemDto[],
  ): Promise<void> {
    if (!fields.some((field) => field.required)) return;
    const incoming = new Map(items.map((item) => [item.phaseFieldId, item]));
    const needsSaved = fields.some((field) => field.required && !incoming.has(field.id));
    const saved = needsSaved
      ? await this.phaseFieldValuesRepository.find({ where: { solicitationId } })
      : [];
    const savedByField = new Map(saved.map((value) => [value.phaseFieldId, value]));

    const empty = missingRequiredPhaseFields(
      fields,
      (field) => incoming.get(field.id) ?? savedByField.get(field.id),
    );
    if (empty.length > 0) {
      throw new BadRequestException(
        `Preencha os campos obrigatórios desta fase: ${empty.map((field) => field.label).join(', ')}.`,
      );
    }
  }

  /**
   * O que a fase exige para o card sair para a frente, numa checagem só: alguém atribuído
   * (`requireAssigneeToExit`) e os campos obrigatórios dela preenchidos no que está salvo
   * (`requireFieldsToExit`). A mensagem lista tudo o que falta. Campo fora do caminho do
   * formulário da fase (ramificação) não é cobrado, como no salvamento. Vale para pessoas e para o
   * processo (fluxo, aprovação que avança sozinha); quem chama já liberou a volta para trás.
   */
  private async assertPhaseExitRequirements(
    manager: EntityManager,
    solicitation: SolicitationEntity,
    currentPhase: KanbanPhaseEntity,
  ): Promise<void> {
    const message = await this.phaseExitBlocker(manager, solicitation, currentPhase);
    if (message) throw new BadRequestException(message);
  }

  /** O que falta para o card sair da fase para a frente, em texto; `null` = pode sair. */
  private async phaseExitBlocker(
    manager: EntityManager,
    solicitation: SolicitationEntity,
    currentPhase: KanbanPhaseEntity,
  ): Promise<string | null> {
    const needsAssignee = currentPhase.requireAssigneeToExit === true && !solicitation.assigneeId;
    const missingFields = currentPhase.requireFieldsToExit
      ? await this.missingRequiredFieldsToExit(manager, solicitation.id, currentPhase)
      : [];
    return phaseExitMessage(currentPhase.label, { needsAssignee, missingFields });
  }

  /** Obrigatórios da fase em branco no que está salvo, sem os que ficam fora do caminho do formulário. */
  private async missingRequiredFieldsToExit(
    manager: EntityManager,
    solicitationId: string,
    currentPhase: KanbanPhaseEntity,
  ): Promise<KanbanPhaseFieldEntity[]> {
    const fields = await manager.find(KanbanPhaseFieldEntity, {
      where: { phaseId: currentPhase.id },
      order: { order: 'ASC' },
    });
    if (!fields.some((field) => field.required)) return [];
    const saved = await manager.find(KanbanPhaseFieldValueEntity, { where: { solicitationId } });
    const savedByField = new Map(saved.map((value) => [value.phaseFieldId, value]));
    const valueOf = (field: KanbanPhaseFieldEntity): KanbanPhaseFieldValueEntity | undefined =>
      savedByField.get(field.id);
    const reachable = currentPhase.sectionFlow?.length
      ? reachablePhaseFields(fields, currentPhase.sectionFlow, (field) => {
          const value = valueOf(field);
          return value
            ? (value.valueJson ?? value.valueBoolean ?? value.valueText ?? value.valueNumber ?? null)
            : null;
        })
      : new Set(fields);
    return missingRequiredPhaseFields(
      fields.filter((field) => reachable.has(field)),
      valueOf,
    );
  }

  /** Fase pelo id — o motor de fluxos usa para saber em que fase o card ficou depois de "Mover para fase". */
  findKanbanPhase(phaseId: string): Promise<KanbanPhaseEntity | null> {
    return this.kanbanPhasesRepository.findOne({ where: { id: phaseId } });
  }

  /** Cria a Approval para quem aprova a fase atual (perfis e/ou usuários) — usada pelo botão "Solicitar aprovação" no card de fase. */
  async requestCurrentPhaseApproval(
    id: string,
    actor: SolicitationActor,
  ): Promise<ApprovalEntity> {
    if (!actor) throw new ForbiddenException('Acesso negado.');
    const solicitation = await this.findOne(id, actor);
    await this.assertActorCanAccess(solicitation, actor, 'solicitations.act');
    const effectivePhaseId = await this.resolveEffectivePhaseId(
      solicitation.formId,
      solicitation.currentPhaseId,
    );
    if (!effectivePhaseId) {
      throw new BadRequestException('Esta solicitação não está em nenhuma fase.');
    }

    const phase = await this.kanbanPhasesRepository.findOne({
      where: { id: effectivePhaseId },
    });
    if (!phase) throw new NotFoundException('Fase não encontrada.');
    const approvers = phaseApprovers(phase);
    if (!phase.requiresApproval || !approvers) {
      throw new BadRequestException('A fase atual não exige aprovação.');
    }

    await this.assertCanActInPhase(phase, actor, 'solicitar aprovação desta fase');
    return this.createPhaseApproval(id, phase, approvers, actor);
  }

  /**
   * A fase pede a própria aprovação (regra `approvalRequest`, ver PhaseApprovalAutomationListener).
   * Não pede se o card já saiu da fase, se a solicitação foi encerrada ou se nesta passagem já há
   * uma pendente ou aprovada; depois de uma reprovada pede de novo (a pessoa corrigiu e salvou).
   * Devolve null quando não pediu.
   */
  async requestPhaseApprovalAutomatically(id: string, phaseId: string): Promise<ApprovalEntity | null> {
    const solicitation = await this.solicitationsRepository.findOne({ where: { id } });
    if (!solicitation || TERMINAL_SOLICITATION_STATUSES.includes(solicitation.status)) return null;
    const effectivePhaseId = await this.resolveEffectivePhaseId(
      solicitation.formId,
      solicitation.currentPhaseId,
    );
    if (effectivePhaseId !== phaseId) return null;

    const phase = await this.kanbanPhasesRepository.findOne({ where: { id: phaseId } });
    const approvers = phase ? phaseApprovers(phase) : null;
    if (!phase?.requiresApproval || !approvers) return null;

    const latest = await this.latestVisitApproval(this.dataSource.manager, id, phaseId);
    if (latest?.status === ApprovalStatus.PENDING || latest?.status === ApprovalStatus.APPROVED) {
      return null;
    }
    return this.createPhaseApproval(id, phase, approvers, null);
  }

  /**
   * O que a fase manda fazer depois da decisão (`approvalOnApproved` / `approvalOnRejected`):
   * aprovada, o card vai para a próxima fase; reprovada, volta para a anterior ou a solicitação é
   * encerrada como reprovada. Só vale para a última aprovação da passagem atual do card pela fase:
   * se alguém já o moveu, ou pediram de novo depois, nada muda.
   */
  async applyPhaseApprovalOutcome(approvalId: string, flowEventDepth = 0): Promise<void> {
    // Aprovada por quem moveu o card: o movimento dele já leva o card para onde foi solto.
    if (this.approvalsDecidedByMove.has(approvalId)) return;
    const manager = this.dataSource.manager;
    const approval = await manager.findOne(ApprovalEntity, { where: { id: approvalId } });
    if (!approval?.phaseId) return;
    const approved = approval.status === ApprovalStatus.APPROVED;
    if (!approved && approval.status !== ApprovalStatus.REJECTED) return;

    const solicitation = await manager.findOne(SolicitationEntity, {
      where: { id: approval.solicitationId },
    });
    if (!solicitation?.formId || TERMINAL_SOLICITATION_STATUSES.includes(solicitation.status)) return;
    const effectivePhaseId = await this.resolveEffectivePhaseId(
      solicitation.formId,
      solicitation.currentPhaseId,
    );
    if (effectivePhaseId !== approval.phaseId) return;

    const phases = await this.kanbanPhasesRepository.find({ where: { formId: solicitation.formId } });
    const phase = phases.find((candidate) => candidate.id === approval.phaseId);
    if (!phase) return;
    const latest = await this.latestVisitApproval(manager, solicitation.id, phase.id);
    if (latest?.id !== approval.id) return;

    // Sem pessoa: quem decidiu já aparece no histórico da aprovação; o movimento é da fase.
    if (approved) {
      const next = phase.approvalOnApproved === 'next' ? neighborPhase(phases, phase.id, 1) : null;
      if (!next) return;
      // Trava de saída (obrigatórios, responsável): antes o movimento falhava só no log e o card
      // ficava parado com a aprovação "Aprovada". Agora avisa quem atua na fase; quando
      // resolverem, resumeApprovedAdvance leva o card adiante.
      const blocker = await this.phaseExitBlocker(manager, solicitation, phase);
      if (blocker) {
        await this.recordApprovedAdvanceBlocked(solicitation, phase, next, approval.id, blocker);
        return;
      }
      await this.movePhase(solicitation.id, { phaseId: next.id }, null, { flowEventDepth, byAutomation: true });
      return;
    }
    if (phase.approvalOnRejected === 'previous') {
      const previous = neighborPhase(phases, phase.id, -1);
      if (previous) {
        await this.movePhase(solicitation.id, { phaseId: previous.id }, null, { flowEventDepth, byAutomation: true });
      }
    } else if (phase.approvalOnRejected === 'close') {
      // Regra do processo: encerra de qualquer status em andamento.
      await this.moveCard(
        solicitation.id,
        { status: SolicitationStatus.REJECTED },
        null,
        { flowEventDepth, skipTransitionCheck: true },
      );
    }
  }

  /**
   * Fase que avança sozinha quando aprovada, aprovada nesta passagem, e o card ainda nela porque
   * a saída estava travada: resolvida a trava (campos da fase salvos, responsável definido), o
   * card segue. Ainda travado, nada acontece — o aviso já foi dado na aprovação.
   */
  async resumeApprovedAdvance(solicitationId: string, flowEventDepth = 0): Promise<void> {
    const manager = this.dataSource.manager;
    const solicitation = await manager.findOne(SolicitationEntity, { where: { id: solicitationId } });
    if (!solicitation?.formId || TERMINAL_SOLICITATION_STATUSES.includes(solicitation.status)) return;
    const phaseId = await this.resolveEffectivePhaseId(solicitation.formId, solicitation.currentPhaseId);
    if (!phaseId) return;
    const phases = await this.kanbanPhasesRepository.find({ where: { formId: solicitation.formId } });
    const phase = phases.find((candidate) => candidate.id === phaseId);
    if (!phase?.requiresApproval || phase.approvalOnApproved !== 'next') return;
    const latest = await this.latestVisitApproval(manager, solicitation.id, phase.id);
    if (latest?.status !== ApprovalStatus.APPROVED) return;
    const next = neighborPhase(phases, phase.id, 1);
    if (!next) return;
    if (await this.phaseExitBlocker(manager, solicitation, phase)) return;
    await this.movePhase(solicitation.id, { phaseId: next.id }, null, { flowEventDepth, byAutomation: true });
  }

  /** Histórico do card + aviso no sino/app para quem atua na fase e o responsável. */
  private async recordApprovedAdvanceBlocked(
    solicitation: SolicitationEntity,
    phase: KanbanPhaseEntity,
    next: KanbanPhaseEntity,
    approvalId: string,
    blocker: string,
  ): Promise<void> {
    const message = `Aprovada, mas o card não seguiu para "${next.label}". ${blocker} Resolvido isso, ele segue sozinho.`;
    await this.historyRepository.save(
      this.historyRepository.create({
        solicitationId: solicitation.id,
        eventType: SolicitationHistoryEventType.PHASE_ADVANCE_BLOCKED,
        actorId: null,
        fromValue: phase.label,
        toValue: next.label,
        message,
        metadata: { phaseId: phase.id, nextPhaseId: next.id, approvalId },
      }),
    );

    const actors = phaseActors(phase);
    const byRole = actors?.roleCodes.length
      ? await this.dataSource.manager.find(UserEntity, {
          where: { role: In(actors.roleCodes), isActive: true },
          select: ['id'],
        })
      : [];
    void this.userNotice?.notify({
      kind: 'phase_advance_blocked',
      userIds: [...byRole.map((user) => user.id), ...(actors?.userIds ?? []), solicitation.assigneeId],
      title: 'Aprovada, mas o card não avançou',
      pushTitle: '⚠️ Card aprovado parado',
      body: `"${solicitation.title}": ${blocker}`,
      link: solicitationLink(solicitation.id),
      solicitationId: solicitation.id,
      priority: 'high',
      dedupeKey: `phase-advance-blocked:${approvalId}`,
    });
  }

  /** Perfis e usuários juntos, pela regra da fase: basta um, todos, ou um depois do outro. */
  private createPhaseApproval(
    id: string,
    phase: KanbanPhaseEntity,
    approvers: NonNullable<ReturnType<typeof phaseApprovers>>,
    actor: SolicitationActor,
    options?: { notify?: boolean },
  ): Promise<ApprovalEntity> {
    const dto = {
      title: `Aprovação de fase: ${phase.label}`,
      phaseId: phase.id,
      ...(approvers.roleCodes.length ? { assignedRoleCodes: approvers.roleCodes } : {}),
      ...(approvers.userIds.length ? { assignedUserIds: approvers.userIds } : {}),
      ...phaseApprovalRule(phase, approvers),
    };
    return options
      ? this.approvalsService.createApproval(id, dto, actor, options)
      : this.approvalsService.createApproval(id, dto, actor);
  }

  /**
   * Quem atua na fase (perfil OU usuário da lista) passa; quem tem acesso total aos processos também.
   * Sem lista, qualquer um que possa atuar no card.
   */
  private async assertCanActInPhase(
    phase: KanbanPhaseEntity,
    actor: JwtPayload,
    action: string,
  ): Promise<void> {
    const actors = phaseActors(phase);
    if (isPhasePerson(actors, actor) || !actors) return;
    if ((await this.processAccess.grantsOf(actor)).fullAccess) return;
    throw new ForbiddenException(`Apenas ${describePhasePeople(actors)} pode ${action}.`);
  }

  async getStandardAnswers(
    id: string,
    actor: SolicitationActor,
  ): Promise<SolicitationStandardAnswerEntity[]> {
    await this.findOne(id, actor);
    return this.standardAnswersRepository.find({ where: { solicitationId: id } });
  }

  async saveStandardAnswers(
    id: string,
    dto: SaveStandardAnswersDto,
    actor: SolicitationActor,
  ): Promise<SolicitationStandardAnswerEntity[]> {
    const solicitation = await this.findOne(id, actor);
    await this.assertActorCanAccess(solicitation, actor, 'solicitations.act');

    for (const item of dto.items) {
      const existing = await this.standardAnswersRepository.findOne({
        where: { solicitationId: id, questionId: item.questionId },
      });
      const values = {
        solicitationId: id,
        questionId: item.questionId,
        fieldCode: item.fieldCode,
        valueText: item.valueText ?? null,
        valueNumber: item.valueNumber ?? null,
        valueBoolean: item.valueBoolean ?? null,
        valueJson: item.valueJson ?? null,
      };
      if (existing) {
        await this.standardAnswersRepository.save({ ...existing, ...values });
      } else {
        await this.standardAnswersRepository.save(this.standardAnswersRepository.create(values));
      }
    }

    return this.getStandardAnswers(id, actor);
  }

  async registerHistory(
    input: HistoryInput,
    manager?: EntityManager,
  ): Promise<SolicitationHistoryEntity> {
    const repository = manager
      ? manager.getRepository(SolicitationHistoryEntity)
      : this.historyRepository;
    const history = repository.create({
      solicitationId: input.solicitationId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? null,
    });
    return repository.save(history);
  }

  /**
   * O Kanban resolve uma solicitação sem `currentPhaseId` (padrão até o primeiro
   * `movePhase`) como estando visualmente na primeira fase do formulário (ver
   * `getKanbanBoardByPhase`). O gate de aprovação por fase e o `actorRoleCode`
   * precisam enxergar essa mesma fase "efetiva" — senão uma solicitação nova
   * nunca é bloqueada pela fase inicial, mesmo que ela exija aprovação.
   */
  private async resolveEffectivePhaseId(
    formId: string | null,
    currentPhaseId: string | null,
    manager?: EntityManager,
  ): Promise<string | null> {
    if (currentPhaseId) return currentPhaseId;
    if (!formId) return null;
    const repo = manager
      ? manager.getRepository(KanbanPhaseEntity)
      : this.kanbanPhasesRepository;
    const phases = await repo.find({ where: { formId }, order: { order: 'ASC' } });
    return phases[0]?.id ?? null;
  }

  private findBySubmissionId(submissionId: string): Promise<SolicitationEntity | null> {
    return this.solicitationsRepository.findOne({
      where: { originType: SolicitationOriginType.FORM_SUBMISSION, submissionId },
      relations: { form: true, submission: true, assignee: true, createdByUser: true },
    });
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<SolicitationEntity | null> {
    return this.solicitationsRepository.findOne({
      where: { originType: SolicitationOriginType.WEBHOOK, idempotencyKey },
    });
  }

  private async findForMutationOrFail(
    manager: EntityManager,
    id: string,
    actor: SolicitationActor,
    permissionCode: string = 'solicitations.act',
  ): Promise<SolicitationEntity> {
    const solicitation = await manager.findOne(SolicitationEntity, {
      where: { id },
      relations: { form: true },
    });
    if (!solicitation) throw new NotFoundException('Solicitacao nao encontrada.');
    await this.assertActorCanAccess(solicitation, actor, permissionCode);
    return solicitation;
  }

  /** Sem ator = o próprio sistema (fluxo, aprovação automática): passa. */
  private async assertActorCanAccess(
    solicitation: SolicitationEntity,
    actor: SolicitationActor,
    permissionCode: string,
  ): Promise<void> {
    if (!actor) return;
    await this.processAccess.assertCanAccessSolicitation(solicitation, actor, permissionCode);
  }

  private getActorId(actor: SolicitationActor): string | null {
    return actor?.sub ?? null;
  }

  private async resolveAssigneeId(
    manager: EntityManager,
    assigneeId: string | null,
  ): Promise<string | null> {
    if (!assigneeId) return null;
    const user = await manager.findOne(UserEntity, {
      where: { id: assigneeId, isActive: true },
    });
    if (!user) throw new NotFoundException('Responsavel nao encontrado.');
    return user.id;
  }

  private async resolveFormId(
    manager: EntityManager,
    formId: string | null,
    actor: JwtPayload,
  ): Promise<string | null> {
    if (!formId) return null;
    const form = await manager.findOne(FormEntity, { where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    // Abre card no processo quem tem "abrir solicitações" nele. Antes só o perfil `editor` era
    // conferido, e qualquer outro abria card em qualquer processo pelo id.
    if (!(await this.processAccess.hasInProcess(actor, form.id, 'solicitations.create'))) {
      throw new ForbiddenException('Acesso negado.');
    }
    return form.id;
  }

  private buildTitleFromSubmission(submission: SubmissionEntity): string {
    const formName = submission.form?.name ?? 'formulário';
    const responder = submission.responderName ?? submission.responderEmail;
    const title = responder
      ? `Solicitação de ${responder} - ${formName}`
      : `Solicitação - ${formName}`;
    return title.length > 180 ? title.slice(0, 177).trimEnd() + '...' : title;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  private toKanbanCard(sol: SolicitationEntity): KanbanCard {
    return {
      id: sol.id,
      title: sol.title,
      formId: sol.formId,
      formName: sol.form?.name ?? null,
      requesterName: sol.createdByUser?.fullName ?? null,
      requesterEmail: sol.createdByUser?.email ?? null,
      responsibleUserId: sol.assigneeId,
      responsibleName: sol.assignee?.fullName ?? null,
      priority: sol.priority,
      slaDueAt: sol.slaDueAt?.toISOString() ?? (sol.metadata?.slaDueAt as string | null) ?? null,
      currentStage: (sol.metadata?.currentStage as string | null) ?? null,
      phaseId: sol.currentPhaseId,
      updatedAt: sol.updatedAt,
      originType: sol.originType,
      hasIntegrationError: !!(sol.metadata?.integrationError),
      createdAt: sol.createdAt,
    };
  }

  private async resolveInitialSlaFields(): Promise<Partial<SolicitationEntity>> {
    const durationHours = await this.settingsService.getValue<number | null>(
      'sla.default_hours',
      null,
    );
    const normalizedDurationHours = this.normalizeSlaDurationHours(durationHours);
    if (!normalizedDurationHours) return {};
    return this.slaCalculatorService.initializeSlaForSolicitation(
      {} as SolicitationEntity,
      normalizedDurationHours,
    );
  }

  private normalizeSlaDurationHours(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.trunc(parsed);
  }

  async findByTrackingToken(token: string): Promise<SolicitationEntity> {
    const solicitation = await this.solicitationsRepository.findOne({
      where: { trackingToken: token },
      relations: { form: true, history: true },
    });
    if (!solicitation) throw new NotFoundException('Solicitacao nao encontrada.');
    return solicitation;
  }

  /** Só de um card que a pessoa enxerga — a permissão global sozinha valia para qualquer id. */
  async regenerateTrackingToken(
    id: string,
    actor: JwtPayload,
  ): Promise<{ trackingToken: string }> {
    const solicitation = await this.processAccess.assertSolicitationAccess(
      id,
      actor,
      'solicitations.regenerate_token',
    );
    solicitation.trackingToken = randomUUID();
    await this.solicitationsRepository.save(solicitation);
    return { trackingToken: solicitation.trackingToken };
  }

  private isSubmissionUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return (
      driverError?.code === '23505' &&
      driverError.constraint === 'UQ_solicitations_form_submission'
    );
  }

  private isIdempotencyKeyUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return (
      driverError?.code === '23505' &&
      driverError.constraint === 'UQ_solicitations_webhook_idempotency_key'
    );
  }
}
