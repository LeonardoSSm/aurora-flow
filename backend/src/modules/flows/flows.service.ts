import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CronExpressionParser } from 'cron-parser';
import { IsNull, QueryFailedError, Raw, Repository } from 'typeorm';
import {
  ApprovalEntity,
  AttachmentEntity,
  FlowEntity,
  FlowExecutionEntity,
  FormEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { MAX_FLOW_NODES } from '../../common/constants/security.constants';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { normalizeEmailAddress } from '../notifications/channels/address.util';
import { MetricsService } from '../observability/metrics.service';
import { ProcessAccessService } from '../access/process-access.service';
import { PermissionsService } from '../roles/permissions.service';
import {
  FlowExecutionEngine,
  isPausedApprovalResult,
  isPausedPhaseFieldsResult,
  isPausedSubflowResult,
} from './flow-execution.engine';
import type { CreateFlowDto } from './dto/create-flow.dto';
import type { UpdateFlowDto } from './dto/update-flow.dto';
import type { QueryFlowsDto } from './dto/query-flows.dto';
import type { RunFlowTestDto } from './dto/run-flow-test.dto';
import type { FlowEdgeDto, FlowNodeDto } from './dto/flow-node.dto';
import { computeNextRunAt, DEFAULT_SCHEDULE_TIMEZONE } from './lib/compute-next-run';
import {
  buildFlowFieldValues,
  buildPhaseFieldValues,
  readSolicitationFormFieldValues,
} from './lib/flow-field-values';
import { getNotificationNodeErrors } from './notification/notification-node.validation';
import { hasMalformedTokens } from '../notifications/domain/notification-template';
import { APPROVAL_EMAIL_BODY_MAX, APPROVAL_EMAIL_SUBJECT_MAX } from './notification/approval-email';
import {
  FLOW_NODE_TYPES,
  isFlowTriggerNodeType,
  MAX_FORWARD_FIELD_MAPPINGS,
} from './types/flow.types';
import type { FlowContextJob } from './flows.queue';
import type {
  FlowEdge,
  FlowExecutionContext,
  FlowNode,
  FlowTriggerNodeType,
  NodeExecutionResult,
  TriggerFormSubmitData,
  TriggerPhaseEnteredData,
  TriggerPhaseFieldSavedData,
  TriggerScheduledData,
  TriggerSlaData,
  TriggerSolicitationCreatedData,
} from './types/flow.types';

/** Após N execuções agendadas consecutivas com falha, o fluxo é desativado automaticamente. */
const MAX_CONSECUTIVE_SCHEDULED_FAILURES = 5;

/** Respostas do formulário que um nó "Criar solicitação" pode preencher. */
const MAX_SOLICITATION_FIELD_VALUES = 50;

/** O que o evento traz para conferir com os filtros de cada gatilho (ver findActiveFlowEntries). */
export interface FlowTriggerMatch {
  /** Formulário do evento; null = evento sem formulário (só gatilhos sem formulário aceitam). */
  formId: string | null;
  /** trigger_webhook_received: endpoint que recebeu. */
  endpointId?: string;
  /**
   * trigger_phase_field_saved: fase salva; trigger_sla_* com slaScope 'phase': fase do prazo;
   * trigger_phase_entered: fase em que o card entrou; trigger_approval_completed: fase da aprovação.
   */
  phaseId?: string;
  /** trigger_phase_entered: fase de onde o card saiu. */
  fromPhaseId?: string;
  /** trigger_sla_*: o prazo que mudou de estado — o geral da solicitação (padrão) ou o da fase. */
  slaScope?: 'solicitation' | 'phase';
  /** trigger_solicitation_created: origem da solicitação (SolicitationOriginType). */
  originType?: string;
}

/** Confere os formulários que um fluxo referencia; lança se a pessoa não puder mexer em algum. */
export type AuthorizeFlowForms = (formIds: string[]) => Promise<void>;

/**
 * Formulários que um fluxo referencia: o `form_id` do fluxo e o `data.formId` de qualquer nó
 * (gatilho, criar solicitação, mover card...). Todos os tipos de nó usam essa mesma chave.
 */
export function referencedFormIds(
  formId: string | null,
  nodes: ReadonlyArray<{ data?: unknown }>,
): Set<string> {
  const ids = new Set<string>();
  if (formId) ids.add(formId);
  for (const node of nodes) {
    const nodeFormId = (node.data as { formId?: unknown } | undefined)?.formId;
    if (typeof nodeFormId === 'string' && nodeFormId.trim()) ids.add(nodeFormId);
  }
  return ids;
}

/** Um fluxo que reage ao evento e o gatilho por onde a execução entra. */
export interface FlowEntry {
  flow: FlowEntity;
  entryNode: FlowNode;
}

@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    @InjectRepository(FlowEntity)
    private readonly flowsRepo: Repository<FlowEntity>,
    @InjectRepository(FlowExecutionEntity)
    private readonly executionsRepo: Repository<FlowExecutionEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepo: Repository<SubmissionEntity>,
    @InjectRepository(FormEntity)
    private readonly formsRepo: Repository<FormEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(ApprovalEntity)
    private readonly approvalsRepo: Repository<ApprovalEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
    private readonly engine: FlowExecutionEngine,
    private readonly metricsService: MetricsService,
    private readonly processAccess: ProcessAccessService,
    @InjectRepository(KanbanPhaseFieldValueEntity)
    private readonly phaseFieldValuesRepo: Repository<KanbanPhaseFieldValueEntity>,
    @Optional() private readonly rolePermissions?: PermissionsService,
  ) {}

  async findAll(
    userId: string,
    role: string,
    query: QueryFlowsDto,
  ): Promise<PaginatedResponseDto<FlowEntity>> {
    const qb = this.flowsRepo.createQueryBuilder('flow').leftJoinAndSelect('flow.form', 'form');

    const systemScope = (await this.rolePermissions?.getScope(role, 'flows.view')) ?? 'none';
    if (systemScope === 'all' || systemScope === 'area') {
      // Permissão de plataforma: lista todos os fluxos.
    } else if (systemScope === 'own' || systemScope === 'assigned') {
      qb.andWhere('flow.created_by = :flowActorId', { flowActorId: userId });
    } else {
      // Compatibilidade: vínculo legado com processos (ciclo 01 ainda persiste o domínio interno).
      const grants = await this.processAccess.grantsOf({ sub: userId, role });
      if (!grants.fullAccess) {
        const formIds = grants.formIds('flows.view').all;
        const conditions = ['flow.created_by = :flowActorId'];
        if (formIds.length > 0) {
          conditions.push('flow.form_id IN (:...flowFormIds)');
          conditions.push(
            `(flow.form_id IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(flow.nodes) AS node WHERE node->>'type' LIKE 'trigger\_%' AND node->'data'->>'formId' IN (:...flowFormIds)))`,
          );
        }
        qb.andWhere(`(${conditions.join(' OR ')})`, { flowActorId: userId, flowFormIds: formIds });
      }
    }

    if (query.search) {
      qb.andWhere('flow.name ILIKE :search', { search: `%${query.search}%` });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('flow.is_active = :isActive', { isActive: query.isActive });
    }
    if (query.excludeId) {
      qb.andWhere('flow.id <> :excludeId', { excludeId: query.excludeId });
    }

    const [data, total] = await qb
      .orderBy('flow.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return PaginatedResponseDto.of(data, total, query.page, query.limit);
  }

  async findByForm(formId: string, userId: string, role: string): Promise<FlowEntity[]> {
    const scope = await this.processAccess.scopeIn({ sub: userId, role }, formId, 'flows.view');
    // Fluxo criado na tela de Fluxos não tem form_id: o formulário fica só no nó gatilho. Ele
    // também é do processo (é o que vale na execução — getEffectiveTriggerFormId).
    const standalone = {
      formId: IsNull(),
      nodes: Raw((alias) => `${alias} @> CAST(:triggerFormPattern AS jsonb)`, {
        triggerFormPattern: JSON.stringify([{ data: { formId } }]),
      }),
    };
    // "Ver fluxos" no processo: todos os fluxos dele. Sem isso, só os que a pessoa criou.
    if (scope === 'all') {
      const flows = await this.flowsRepo.find({
        where: [{ formId }, standalone] as never,
        order: { createdAt: 'ASC' },
      });
      return flows.filter((flow) => this.belongsToForm(flow, formId));
    }
    const where: Array<Record<string, unknown>> = [
      { formId, createdBy: userId },
      { ...standalone, createdBy: userId },
    ];
    const flows = await this.flowsRepo.find({ where: where as never, order: { createdAt: 'ASC' } });
    return flows.filter((flow) => this.belongsToForm(flow, formId));
  }

  /** O fluxo é do formulário pelo form_id ou por um nó gatilho que aponta para ele. */
  private belongsToForm(flow: FlowEntity, formId: string): boolean {
    if (flow.formId === formId) return true;
    return (flow.nodes ?? []).some(
      (node) => node.type.startsWith('trigger_') && this.getEffectiveTriggerFormId(flow, node) === formId,
    );
  }

  /**
   * Garante que o usuário pode ver (`flows.view`) ou gerenciar (`flows.manage`) o fluxo — mesma
   * regra de escopo/atribuição do restante do módulo. Lança 404 se não puder. Usado pelos
   * endpoints de notificações do fluxo.
   */
  assertFlowAccess(
    id: string,
    userId: string,
    role: string,
    mode: 'view' | 'manage',
  ): Promise<FlowEntity> {
    return this.findByIdOrFail(id, userId, role, [], mode === 'view' ? 'flows.view' : 'flows.manage');
  }

  findOne(id: string, userId: string, role: string): Promise<FlowEntity> {
    return this.findByIdOrFail(id, userId, role, ['form'], 'flows.view');
  }

  /**
   * `authorizeForms` recebe os formulários que o fluxo passa a referenciar (o do fluxo e o
   * `data.formId` dos nós) e lança se a pessoa não puder mexer em algum — a rota confere ali o
   * processo. Sem ele (chamadas internas), nada é conferido.
   */
  async create(
    dto: CreateFlowDto,
    userId: string,
    formIdFromRoute?: string,
    authorizeForms?: AuthorizeFlowForms,
  ): Promise<FlowEntity> {
    const formId = formIdFromRoute ?? dto.formId ?? null;
    const name = this.normalizeFlowName(dto.name);
    if (formId) await this.assertFormExists(formId);
    await this.assertFlowNameAvailable(userId, name);

    if (dto.nodes) this.validateFlowStructure(dto.nodes, dto.edges ?? [], undefined);

    const nodes = this.syncFormIdIntoTriggerNode(
      (dto.nodes ?? []) as FlowNode[],
      formId,
      false,
    );
    if (authorizeForms) await authorizeForms([...referencedFormIds(formId, nodes)]);

    const flow = this.flowsRepo.create({
      formId,
      name,
      isActive: dto.isActive ?? true,
      nodes: nodes as unknown as FlowNode[],
      edges: (dto.edges ?? []) as unknown as FlowEdge[],
      viewport: dto.viewport ?? null,
      createdBy: userId,
      nextRunAt: this.computeNextRunForFlow(nodes),
    });
    return this.withHasSubFlows(await this.saveFlow(flow));
  }

  /**
   * Fluxo novo conferido e pronto para gravar, sem gravar — a criação de processo pela LOPS IA grava
   * formulário, fases e fluxos numa transação só. Nome repetido do mesmo criador ganha " (2)",
   * " (3)"... (`reservedNames`: os já usados nesta mesma criação). Erro de estrutura lança
   * BadRequestException com a mensagem do nó.
   */
  async prepareNewFlow(
    dto: CreateFlowDto,
    userId: string,
    reservedNames: Set<string> = new Set(),
  ): Promise<FlowEntity> {
    const formId = dto.formId ?? null;
    const base = this.normalizeFlowName(dto.name);
    let name = base;
    for (let attempt = 2; ; attempt++) {
      const taken =
        reservedNames.has(name.toLowerCase()) ||
        (await this.flowsRepo
          .createQueryBuilder('flow')
          .where('flow.created_by = :userId', { userId })
          .andWhere('LOWER(BTRIM(flow.name)) = LOWER(BTRIM(:name))', { name })
          .getExists());
      if (!taken) break;
      name = `${base} (${attempt})`.slice(0, 150);
    }
    reservedNames.add(name.toLowerCase());

    this.validateFlowStructure(dto.nodes ?? [], dto.edges ?? [], undefined);
    const nodes = this.syncFormIdIntoTriggerNode((dto.nodes ?? []) as FlowNode[], formId, false);
    return this.flowsRepo.create({
      formId,
      name,
      isActive: dto.isActive ?? true,
      nodes: nodes as unknown as FlowNode[],
      edges: (dto.edges ?? []) as unknown as FlowEdge[],
      viewport: dto.viewport ?? null,
      createdBy: userId,
      nextRunAt: this.computeNextRunForFlow(nodes),
    });
  }

  /** Só a estrutura (nós, dados e arestas), sem gravar — a conferência da LOPS IA usa antes de criar. */
  assertValidFlowStructure(nodes: FlowNodeDto[], edges: FlowEdgeDto[]): void {
    this.validateFlowStructure(nodes, edges, undefined);
  }

  /** `authorizeForms` como em `create`, só com os formulários que a edição ACRESCENTA. */
  async update(
    id: string,
    dto: UpdateFlowDto,
    userId: string,
    role: string,
    authorizeForms?: AuthorizeFlowForms,
  ): Promise<FlowEntity> {
    const flow = await this.findByIdOrFail(id, userId, role);
    const formsBefore = referencedFormIds(flow.formId ?? null, flow.nodes ?? []);
    const formIdChanged = dto.formId !== undefined;
    if (formIdChanged) {
      if (dto.formId) await this.assertFormExists(dto.formId);
      flow.formId = dto.formId ?? null;
      flow.form = null;
    }
    if (dto.name !== undefined) {
      const name = this.normalizeFlowName(dto.name);
      await this.assertFlowNameAvailable(userId, name, id);
      flow.name = name;
    }
    if (dto.isActive !== undefined) flow.isActive = dto.isActive;
    if (dto.nodes !== undefined) {
      this.validateFlowStructure(dto.nodes, dto.edges ?? (flow.edges as unknown as FlowEdgeDto[]), id);
      flow.nodes = dto.nodes as unknown as FlowNode[];
    } else if (dto.edges !== undefined) {
      this.validateFlowEdges(flow.nodes ?? [], dto.edges);
    }
    if (dto.edges !== undefined) flow.edges = dto.edges as unknown as FlowEdge[];
    if (dto.viewport !== undefined) flow.viewport = dto.viewport;

    // Sync flow.formId into trigger_form_submit nodes (backfill or force-update on explicit change)
    if (formIdChanged || dto.nodes !== undefined) {
      flow.nodes = this.syncFormIdIntoTriggerNode(
        flow.nodes as unknown as FlowNode[],
        flow.formId ?? null,
        formIdChanged,
      ) as unknown as FlowNode[];
    }

    // Ativar nunca deixa passar uma notificação mal configurada (ex.: nó editado direto no banco).
    // Só os nós de notificação são revalidados aqui, para não barrar a reativação de fluxos antigos.
    if (flow.isActive) this.assertNotificationNodesValid(flow.nodes as unknown as FlowNodeDto[]);

    // Recalcula a próxima execução agendada a partir de agora (nunca "recupera" atraso) sempre
    // que os nós mudam ou o fluxo é (re)ativado explicitamente.
    if (dto.nodes !== undefined || dto.isActive === true) {
      flow.nextRunAt = this.computeNextRunForFlow(flow.nodes as unknown as FlowNode[]);
    }

    if (authorizeForms) {
      const added = [...referencedFormIds(flow.formId ?? null, flow.nodes ?? [])].filter(
        (formId) => !formsBefore.has(formId),
      );
      if (added.length > 0) await authorizeForms(added);
    }

    return this.withHasSubFlows(await this.saveFlow(flow));
  }

  async toggleActive(id: string, userId: string, role: string): Promise<FlowEntity> {
    const flow = await this.findByIdOrFail(id, userId, role);
    flow.isActive = !flow.isActive;
    if (flow.isActive) this.assertNotificationNodesValid(flow.nodes as unknown as FlowNodeDto[]);
    return this.saveFlow(flow);
  }

  async delete(id: string, userId: string, role: string): Promise<void> {
    const flow = await this.findByIdOrFail(id, userId, role);
    await this.flowsRepo.remove(flow);
  }

  async getExecutions(
    flowId: string,
    page: number,
    limit: number,
    userId: string,
    role: string,
  ): Promise<{
    data: FlowExecutionEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.findByIdOrFail(flowId, userId, role, [], 'flows.view');

    const [data, total] = await this.executionsRepo.findAndCount({
      where: { flowId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async executeForSubmission(submissionId: string): Promise<void> {
    const submission = await this.submissionsRepo.findOne({
      where: { id: submissionId },
      relations: ['form', 'items'],
    });
    if (!submission) return;

    const entries = await this.findActiveFlowEntries('trigger_form_submit', {
      formId: submission.formId,
    });
    if (entries.length === 0) return;

    this.logger.log(
      { submissionId, eventName: 'responses.submitted', flowCount: entries.length },
      'Executing flows for submission',
    );

    const context: FlowExecutionContext = {
      eventName: 'responses.submitted',
      submission,
      form: submission.form,
      fields: this.buildFieldsFromSubmission(submission),
    };

    for (const { flow, entryNode } of entries) {
      await this.executeFlowWithContext(flow, { ...context, entryNodeId: entryNode.id });
    }
  }

  /**
   * Fluxos ativos que reagem a um evento, cada um com o gatilho por onde entrar. Um fluxo pode
   * ter vários gatilhos (cada um ligado a um ponto do grafo); cada gatilho do tipo do evento é
   * conferido com os próprios filtros (formulário, endpoint, fase, origem). Se mais de um casa,
   * o fluxo roda UMA vez, pelo mais específico (filtro preenchido que bateu vence curinga);
   * empate fica com o que vem primeiro no fluxo.
   */
  async findActiveFlowEntries(
    triggerType: FlowTriggerNodeType,
    match: FlowTriggerMatch,
  ): Promise<FlowEntry[]> {
    const flows = await this.flowsRepo.find({ where: { isActive: true } });
    const entries: FlowEntry[] = [];
    for (const flow of flows) {
      const entryNode = this.pickEntryNode(flow, triggerType, match);
      if (entryNode) entries.push({ flow, entryNode });
    }
    return entries;
  }

  private pickEntryNode(
    flow: FlowEntity,
    triggerType: FlowTriggerNodeType,
    match: FlowTriggerMatch,
  ): FlowNode | null {
    let best: { node: FlowNode; score: number } | null = null;
    for (const node of flow.nodes ?? []) {
      if (node.type !== triggerType) continue;
      const score = this.scoreTriggerNode(flow, node, match);
      if (score !== null && (!best || score > best.score)) best = { node, score };
    }
    return best?.node ?? null;
  }

  /** null = o gatilho não aceita o evento; número = quantos filtros preenchidos bateram. */
  private scoreTriggerNode(flow: FlowEntity, node: FlowNode, match: FlowTriggerMatch): number | null {
    if (node.type === 'trigger_scheduled') return 0;

    if (node.type === 'trigger_webhook_received') {
      const configuredEndpointId = this.getConfiguredWebhookEndpointId(node);
      if (configuredEndpointId) return configuredEndpointId === match.endpointId ? 1 : null;
      // Regra antiga: sem endpoint escolhido, só um fluxo sem formulário aceita qualquer endpoint.
      return flow.formId ? null : 0;
    }

    let score = 0;
    const formId = this.getEffectiveTriggerFormId(flow, node);
    if (match.formId === null) {
      if (formId !== null) return null;
    } else if (formId !== null) {
      if (formId !== match.formId) return null;
      score++;
    }

    if (
      node.type === 'trigger_phase_field_saved' ||
      node.type === 'trigger_phase_entered' ||
      node.type === 'trigger_approval_completed'
    ) {
      const phaseId = (node.data as TriggerPhaseFieldSavedData).phaseId;
      if (phaseId) {
        if (phaseId !== match.phaseId) return null;
        score++;
      }
    }

    if (node.type === 'trigger_phase_entered') {
      const fromPhaseId = (node.data as TriggerPhaseEnteredData).fromPhaseId;
      if (fromPhaseId) {
        if (fromPhaseId !== match.fromPhaseId) return null;
        score++;
      }
    }

    if (node.type === 'trigger_sla_warning' || node.type === 'trigger_sla_breached') {
      const data = node.data as TriggerSlaData;
      const nodeScope = data.slaScope ?? 'solicitation';
      if (nodeScope !== (match.slaScope ?? 'solicitation')) return null;
      if (nodeScope === 'phase' && data.phaseId) {
        if (data.phaseId !== match.phaseId) return null;
        score++;
      }
    }

    if (node.type === 'trigger_solicitation_created') {
      const origins = (node.data as TriggerSolicitationCreatedData).originTypes ?? [];
      if (origins.length > 0) {
        if (!match.originType || !origins.includes(match.originType)) return null;
        score++;
      }
    }

    return score;
  }

  async migrateFlowFormIds(): Promise<{ migrated: number; skipped: number }> {
    const flows = await this.flowsRepo.find();
    let migrated = 0;
    let skipped = 0;

    for (const flow of flows) {
      if (!flow.formId) {
        skipped++;
        continue;
      }
      const triggerIndex = flow.nodes.findIndex((n) => n.type === 'trigger_form_submit');
      if (triggerIndex === -1) {
        skipped++;
        continue;
      }
      const triggerData = flow.nodes[triggerIndex].data as TriggerFormSubmitData;
      if (triggerData.formId) {
        skipped++;
        continue;
      }

      const updatedNodes = [...flow.nodes];
      updatedNodes[triggerIndex] = {
        ...updatedNodes[triggerIndex],
        data: { ...triggerData, formId: flow.formId },
      };
      await this.flowsRepo.update(flow.id, {
        nodes: updatedNodes as unknown as FlowNode[],
      });
      migrated++;
    }

    this.logger.log({ migrated, skipped }, 'Flow formId migration completed');
    return { migrated, skipped };
  }

  async executeFlowWithContext(flow: FlowEntity, context: FlowExecutionContext): Promise<void> {
    const execution = await this.startFlowExecution(flow.id, context);
    if (!execution) return;

    const flowStartedAt = Date.now();
    let finalStatus:
      | 'success'
      | 'partial_failure'
      | 'failed'
      | 'waiting_approval'
      | 'waiting_phase_fields'
      | 'waiting_subflow' = 'success';
    const logBase = {
      flowId: flow.id,
      executionId: execution.id,
      submissionId: context.submission?.id,
      solicitationId: context.solicitation?.id,
      eventName: context.eventName,
    };

    this.logger.log({ ...logBase, status: 'started' }, 'Flow execution started');

    try {
      const nodeResults = await this.engine.execute(flow, {
        ...(await this.withSolicitationFieldValues(context)),
        flowId: flow.id,
        flowExecutionId: execution.id,
      });

      // action_create_approval não tem etapa de espera de verdade no motor — ele para de
      // percorrer o grafo bem ali (ver isPausedApprovalResult) em vez de seguir com um
      // ctx.solicitation desatualizado. FlowsApprovalListener retoma esta MESMA execução
      // (resumePausedExecution) quando approvals.approved/rejected dispara para approvalId.
      const pausedResult = nodeResults.find(isPausedApprovalResult);
      if (pausedResult) {
        finalStatus = 'waiting_approval';
        await this.executionsRepo.update(execution.id, {
          status: 'waiting_approval',
          nodeResults: nodeResults as unknown as Record<string, unknown>[],
          approvalId: pausedResult.output.approvalId,
          pausedNodeId: pausedResult.nodeId,
        });
        this.logger.log(
          { ...logBase, status: 'waiting_approval', durationMs: Date.now() - flowStartedAt },
          'Flow execution paused, awaiting approval decision',
        );
        return;
      }

      // action_wait_for_phase_fields — mesma ideia, mas pausando até uma fase específica ser
      // salva (solicitations.phase_fields_saved) em vez de uma aprovação ser decidida.
      // FlowsPhaseFieldsListener retoma esta MESMA execução (resumePausedPhaseFieldsExecution).
      const pausedPhaseFields = nodeResults.find(isPausedPhaseFieldsResult);
      if (pausedPhaseFields) {
        finalStatus = 'waiting_phase_fields';
        await this.executionsRepo.update(execution.id, {
          status: 'waiting_phase_fields',
          nodeResults: nodeResults as unknown as Record<string, unknown>[],
          waitingPhaseId: pausedPhaseFields.output.waitingPhaseId,
          pausedNodeId: pausedPhaseFields.nodeId,
        });
        this.logger.log(
          { ...logBase, status: 'waiting_phase_fields', durationMs: Date.now() - flowStartedAt },
          'Flow execution paused, awaiting phase fields to be saved',
        );
        return;
      }

      // action_run_flow `sync` cujo filho pausou: o pai espera o filho terminar. Quem retoma é
      // continuePausedExecution, ao concluir a execução do filho (resumeParentAfterSubflow).
      const pausedSubflow = nodeResults.find(isPausedSubflowResult);
      if (pausedSubflow) {
        finalStatus = 'waiting_subflow';
        await this.executionsRepo.update(execution.id, {
          status: 'waiting_subflow',
          nodeResults: nodeResults as unknown as Record<string, unknown>[],
          pausedNodeId: pausedSubflow.nodeId,
        });
        this.logger.log(
          { ...logBase, status: 'waiting_subflow', durationMs: Date.now() - flowStartedAt },
          'Flow execution paused, awaiting sub-flow to finish',
        );
        return;
      }

      const hasFailed = nodeResults.some((r) => r.status === 'failed');
      const firstError = nodeResults.find((r) => r.status === 'failed')?.error;
      finalStatus = hasFailed ? 'partial_failure' : 'success';
      await this.executionsRepo.update(execution.id, {
        status: finalStatus,
        completedAt: new Date(),
        nodeResults: nodeResults as unknown as Record<string, unknown>[],
        errorMessage: hasFailed ? (firstError ?? 'Um ou mais nos falharam.') : null,
      });
      this.logger.log(
        { ...logBase, status: finalStatus, durationMs: Date.now() - flowStartedAt },
        'Flow execution completed',
      );
    } catch (err) {
      finalStatus = 'failed';
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { ...logBase, status: 'failed', durationMs: Date.now() - flowStartedAt, error: msg },
        'Flow execution failed',
      );
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: msg,
      });
    } finally {
      if (
        finalStatus !== 'waiting_approval' &&
        finalStatus !== 'waiting_phase_fields' &&
        finalStatus !== 'waiting_subflow'
      ) {
        this.metricsService.recordFlowExecution(flow.id, finalStatus, Date.now() - flowStartedAt);
        await this.updateScheduledTriggerHealth(flow, finalStatus, context.entryNodeId);
      }
    }
  }

  /**
   * Retoma uma execução parada em action_create_approval (status 'waiting_approval'), agora
   * que a aprovação foi decidida. Reaproveita a MESMA linha de FlowExecutionEntity — os
   * resultados de antes da pausa ficam preservados, os novos são anexados. Se o motor pausar
   * de novo (um segundo action_create_approval mais adiante no mesmo fluxo), volta a marcar
   * 'waiting_approval' no novo nó em vez de fechar a execução.
   */
  async resumePausedExecution(executionId: string, approvalId: string): Promise<void> {
    const execution = await this.executionsRepo.findOne({ where: { id: executionId } });
    if (execution?.status !== 'waiting_approval' || !execution.pausedNodeId) {
      return;
    }

    const flow = await this.flowsRepo.findOne({ where: { id: execution.flowId, isActive: true } });
    if (!flow) {
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Fluxo removido ou desativado antes da retomada.',
      });
      return;
    }

    const context = await this.buildContextFromJob({
      kind: 'flow_context',
      flowId: flow.id,
      triggerType: 'trigger_approval_completed',
      eventName: 'approvals.resume',
      approvalId,
      emittedAt: new Date().toISOString(),
    });
    if (!context) {
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Aprovação não encontrada ao retomar o fluxo.',
      });
      return;
    }

    await this.continuePausedExecution(execution, 'waiting_approval', flow, context);
  }

  /**
   * Retoma uma execução parada em action_wait_for_phase_fields (status 'waiting_phase_fields'),
   * agora que a fase esperada teve seus campos salvos. Mesma ideia de resumePausedExecution,
   * mas o gatilho da retomada é FlowsPhaseFieldsListener em vez de uma decisão de aprovação —
   * `metadata` traz phaseId/phaseLabel/approverRoleCode FRESCOS da fase recém-salva, para que um
   * action_create_approval logo depois (scope: phase / phase_role) resolva a fase certa, e não a
   * fase do gatilho original que iniciou o fluxo.
   */
  async resumePausedPhaseFieldsExecution(
    executionId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const execution = await this.executionsRepo.findOne({ where: { id: executionId } });
    if (execution?.status !== 'waiting_phase_fields' || !execution.pausedNodeId) {
      return;
    }

    const flow = await this.flowsRepo.findOne({ where: { id: execution.flowId, isActive: true } });
    if (!flow) {
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Fluxo removido ou desativado antes da retomada.',
      });
      return;
    }

    if (!execution.solicitationId) {
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Execução sem solicitação associada ao retomar o fluxo.',
      });
      return;
    }

    const context = await this.buildContextFromJob({
      kind: 'flow_context',
      flowId: flow.id,
      triggerType: 'trigger_phase_field_saved',
      eventName: 'solicitations.phase_fields_saved',
      solicitationId: execution.solicitationId,
      metadata,
      emittedAt: new Date().toISOString(),
    });
    if (!context) {
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Solicitação não encontrada ao retomar o fluxo.',
      });
      return;
    }

    await this.continuePausedExecution(execution, 'waiting_phase_fields', flow, context);
  }

  /**
   * Núcleo comum de retomada, compartilhado por resumePausedExecution e
   * resumePausedPhaseFieldsExecution: chama engine.resumeFrom a partir do nó pausado, anexa os
   * novos resultados aos anteriores e decide o que fazer a seguir — pausar de novo (em qualquer
   * um dos dois tipos de pausa, se o motor encontrar outro nó de espera mais adiante no mesmo
   * caminho) ou concluir a execução.
   *
   * Antes de rodar, "reserva" a execução com um UPDATE condicional (só passa de `pausedStatus`
   * para 'running' quem chegar primeiro): uma decisão entregue duas vezes, ou dois eventos quase
   * simultâneos, não executam o ramo pós-pausa em dobro.
   */
  private async continuePausedExecution(
    execution: FlowExecutionEntity,
    pausedStatus: 'waiting_approval' | 'waiting_phase_fields' | 'waiting_subflow',
    flow: FlowEntity,
    context: FlowExecutionContext,
  ): Promise<void> {
    const claim = await this.executionsRepo.update(
      { id: execution.id, status: pausedStatus, pausedNodeId: execution.pausedNodeId as string },
      { status: 'running' },
    );
    if (!claim.affected) {
      this.logger.log(
        { flowId: flow.id, executionId: execution.id, pausedStatus },
        'Flow execution already resumed by another delivery — skipping',
      );
      return;
    }

    const flowStartedAt = Date.now();
    let terminalStatus: 'success' | 'partial_failure' | 'failed' | null = null;
    try {
      const newResults = await this.engine.resumeFrom(flow, execution.pausedNodeId as string, {
        ...(await this.withSolicitationFieldValues(context)),
        flowId: flow.id,
        flowExecutionId: execution.id,
      });
      const mergedResults = [...(execution.nodeResults ?? []), ...newResults];

      const nextApprovalPause = newResults.find(isPausedApprovalResult);
      if (nextApprovalPause) {
        await this.executionsRepo.update(execution.id, {
          status: 'waiting_approval',
          nodeResults: mergedResults as unknown as Record<string, unknown>[],
          approvalId: nextApprovalPause.output.approvalId,
          pausedNodeId: nextApprovalPause.nodeId,
          waitingPhaseId: null,
        });
        return;
      }

      const nextPhaseFieldsPause = newResults.find(isPausedPhaseFieldsResult);
      if (nextPhaseFieldsPause) {
        await this.executionsRepo.update(execution.id, {
          status: 'waiting_phase_fields',
          nodeResults: mergedResults as unknown as Record<string, unknown>[],
          waitingPhaseId: nextPhaseFieldsPause.output.waitingPhaseId,
          pausedNodeId: nextPhaseFieldsPause.nodeId,
          approvalId: null,
        });
        return;
      }

      const nextSubflowPause = newResults.find(isPausedSubflowResult);
      if (nextSubflowPause) {
        await this.executionsRepo.update(execution.id, {
          status: 'waiting_subflow',
          nodeResults: mergedResults as unknown as Record<string, unknown>[],
          pausedNodeId: nextSubflowPause.nodeId,
          approvalId: null,
          waitingPhaseId: null,
        });
        return;
      }

      const hasFailed = newResults.some((r) => r.status === 'failed');
      const firstError = newResults.find((r) => r.status === 'failed')?.error;
      const status: 'success' | 'partial_failure' = hasFailed ? 'partial_failure' : 'success';
      await this.executionsRepo.update(execution.id, {
        status,
        completedAt: new Date(),
        nodeResults: mergedResults as unknown as Record<string, unknown>[],
        errorMessage: hasFailed ? (firstError ?? 'Um ou mais nós falharam.') : null,
      });
      this.metricsService.recordFlowExecution(flow.id, status, Date.now() - flowStartedAt);
      terminalStatus = status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.executionsRepo.update(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: msg,
      });
      this.metricsService.recordFlowExecution(flow.id, 'failed', Date.now() - flowStartedAt);
      terminalStatus = 'failed';
    }

    if (terminalStatus && execution.parentExecutionId) {
      await this.resumeParentAfterSubflow(execution, terminalStatus);
    }
  }

  /**
   * Um filho chamado por action_run_flow `sync` terminou depois de ter pausado. O pai, parado em
   * 'waiting_subflow' no nó do sub-fluxo, segue daquele nó; se o filho falhou, o nó do pai falha
   * como falharia sem a pausa ("Sub-fluxo falhou") e o ramo para ali. Só vale para o filho que o
   * pai está esperando — um filho `async` do mesmo pai que termina depois não mexe nele.
   */
  private async resumeParentAfterSubflow(
    child: FlowExecutionEntity,
    childStatus: 'success' | 'partial_failure' | 'failed',
  ): Promise<void> {
    const parent = await this.executionsRepo.findOne({ where: { id: child.parentExecutionId as string } });
    if (parent?.status !== 'waiting_subflow' || !parent.pausedNodeId) return;
    const waiting = [...(parent.nodeResults ?? [])].reverse().find(isPausedSubflowResult);
    if (waiting?.nodeId !== parent.pausedNodeId || waiting.output.waitingSubflowExecutionId !== child.id) {
      return;
    }

    if (childStatus !== 'success') {
      const error = `Sub-fluxo falhou com status: ${childStatus}`;
      const claim = await this.executionsRepo.update(
        { id: parent.id, status: 'waiting_subflow', pausedNodeId: parent.pausedNodeId },
        {
          status: 'partial_failure',
          completedAt: new Date(),
          nodeResults: [
            ...(parent.nodeResults ?? []),
            { nodeId: parent.pausedNodeId, status: 'failed', error, durationMs: 0 },
          ] as unknown as Record<string, unknown>[],
          errorMessage: error,
        },
      );
      if (claim.affected) {
        this.metricsService.recordFlowExecution(parent.flowId, 'partial_failure', 0);
        // O pai também pode ser o filho `sync` de alguém: a falha sobe a cadeia.
        if (parent.parentExecutionId) await this.resumeParentAfterSubflow(parent, 'partial_failure');
      }
      return;
    }

    const flow = await this.flowsRepo.findOne({ where: { id: parent.flowId, isActive: true } });
    if (!flow) {
      await this.executionsRepo.update(parent.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Fluxo removido ou desativado antes da retomada.',
      });
      return;
    }

    const trigger = flow.nodes.find((node) => isFlowTriggerNodeType(node.type));
    const context = await this.buildContextFromJob({
      kind: 'flow_context',
      flowId: flow.id,
      triggerType: (trigger?.type ?? 'trigger_solicitation_created') as FlowTriggerNodeType,
      eventName: 'subflow.completed',
      solicitationId: parent.solicitationId,
      metadata: { childExecutionId: child.id, childStatus },
      emittedAt: new Date().toISOString(),
    });
    if (!context) {
      await this.executionsRepo.update(parent.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Solicitação não encontrada ao retomar o fluxo depois do sub-fluxo.',
      });
      return;
    }

    await this.continuePausedExecution(parent, 'waiting_subflow', flow, context);
  }

  /**
   * Mantém a "saúde" de fluxos com gatilho agendado: zera o contador de falhas consecutivas em
   * caso de sucesso, ou incrementa e desativa o fluxo automaticamente ao atingir o limite — assim
   * um gatilho agendado quebrado (ex: API fora do ar) não fica tentando pra sempre sem ninguém
   * perceber. Só conta execuções que entraram pelo gatilho agendado: num fluxo com várias
   * entradas, a falha de outra entrada não desativa o agendamento.
   */
  private async updateScheduledTriggerHealth(
    flow: FlowEntity,
    status: 'success' | 'partial_failure' | 'failed',
    entryNodeId: string | undefined,
  ): Promise<void> {
    const entryNode = entryNodeId
      ? flow.nodes.find((node) => node.id === entryNodeId)
      : flow.nodes.find((node) => isFlowTriggerNodeType(node.type));
    if (entryNode?.type !== 'trigger_scheduled') return;

    if (status === 'success') {
      if (flow.consecutiveFailureCount !== 0) {
        await this.flowsRepo.update(flow.id, { consecutiveFailureCount: 0 });
      }
      return;
    }

    const nextCount = flow.consecutiveFailureCount + 1;
    const shouldPause = nextCount >= MAX_CONSECUTIVE_SCHEDULED_FAILURES;
    await this.flowsRepo.update(flow.id, {
      consecutiveFailureCount: nextCount,
      ...(shouldPause ? { isActive: false } : {}),
    });
    if (shouldPause) {
      this.logger.warn(
        `Fluxo ${flow.id} desativado automaticamente após ${nextCount} execuções agendadas consecutivas com falha.`,
      );
    }
  }

  /** Calcula next_run_at a partir do nó trigger_scheduled do fluxo, se houver. */
  private computeNextRunForFlow(nodes: FlowNode[]): Date | null {
    const trigger = nodes.find((n) => n.type === 'trigger_scheduled');
    if (!trigger) return null;
    try {
      return computeNextRunAt(trigger.data as TriggerScheduledData, new Date());
    } catch (error) {
      this.logger.error(
        `Falha ao calcular next_run_at: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async executeContextJob(job: FlowContextJob): Promise<void> {
    const flow = await this.flowsRepo.findOne({
      where: { id: job.flowId, isActive: true },
    });
    if (!flow) return;

    // O gatilho escolhido na publicação; se o fluxo foi editado desde então e ele sumiu (ou
    // mudou de tipo), o evento não roda — entrar por outro gatilho seria o caminho errado. Job
    // antigo, sem entryNodeId: o primeiro gatilho do tipo, como era com um gatilho só.
    const entryNode = job.entryNodeId
      ? flow.nodes.find((node) => node.id === job.entryNodeId && node.type === job.triggerType)
      : flow.nodes.find((node) => node.type === job.triggerType);
    if (!entryNode) return;

    const context = await this.buildContextFromJob(job);
    if (!context) return;

    await this.executeFlowWithContext(flow, { ...context, entryNodeId: entryNode.id });
  }

  async runTest(
    flowId: string,
    userId: string,
    dto: RunFlowTestDto = {},
    role: string = 'editor',
  ): Promise<NodeExecutionResult[]> {
    const flow = await this.findByIdOrFail(flowId, userId, role);
    // Com vários gatilhos, o teste entra pelo escolhido no modal; sem escolha, pelo primeiro.
    const trigger = dto.entryNodeId
      ? flow.nodes.find((node) => node.id === dto.entryNodeId && isFlowTriggerNodeType(node.type))
      : flow.nodes.find((node) => isFlowTriggerNodeType(node.type));
    if (dto.entryNodeId && !trigger) {
      throw new BadRequestException('Gatilho de entrada não encontrado neste fluxo.');
    }
    // O editor guarda o formulário só no nó gatilho; flow.formId é o campo legado.
    const formId = trigger ? this.getEffectiveTriggerFormId(flow, trigger) : flow.formId;
    const form = formId
      ? await this.formsRepo.findOne({ where: { id: formId } })
      : ({
          id: 'manual-test',
          name: 'Teste manual',
        } as FormEntity);

    if (!form) throw new NotFoundException('Formulário não encontrado.');

    const testItems = Object.entries(dto.fieldValues ?? {}).map(([code, value]) => ({
      fieldCode: code,
      valueText: typeof value === 'string' ? value : null,
      valueNumber: typeof value === 'number' ? value : null,
      valueBoolean: typeof value === 'boolean' ? value : null,
      valueJson: null,
    }));

    const fakeSubmission = {
      id: 'test-run',
      formId: formId ?? 'manual-test',
      form,
      responderName: 'Teste FormHub',
      responderEmail: 'teste@formhub.dev',
      submittedAt: new Date(),
      items: testItems as unknown as SubmissionItemEntity[],
    } as unknown as SubmissionEntity;

    const context: FlowExecutionContext = {
      eventName: 'flows.test_run',
      flowId: flow.id,
      submission: fakeSubmission,
      form,
      fields: this.buildFieldsFromSubmission(fakeSubmission),
      actorId: userId,
      metadata: { testRun: true },
      entryNodeId: trigger?.id,
    };

    return this.engine.execute(flow, context);
  }

  private async startFlowExecution(
    flowId: string,
    context: FlowExecutionContext,
  ): Promise<FlowExecutionEntity | null> {
    const submissionId = context.submission?.id ?? null;

    // Só o envio do formulário é idempotente por submissão (mesmo índice parcial do banco,
    // UQ_flow_executions_flow_submission). Outros eventos da mesma solicitação executam sempre.
    if (submissionId && context.eventName === 'responses.submitted') {
      const existing = await this.executionsRepo.findOne({
        where: { flowId, submissionId, eventName: 'responses.submitted' },
      });
      if (existing) return null;
    }

    try {
      return await this.executionsRepo.save(
        this.executionsRepo.create({
          flowId,
          submissionId,
          eventName: context.eventName,
          solicitationId: context.solicitation?.id ?? null,
          approvalId: context.approval?.id ?? null,
          status: 'running',
          startedAt: new Date(),
        }),
      );
    } catch (error) {
      if (this.isFlowExecutionUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  /** "Avisar quem aprova por e-mail" do nó Criar aprovação: formato e tamanhos do assunto/texto. */
  private assertApprovalEmailConfig(nodeId: string, raw: unknown): void {
    if (raw === undefined || raw === null) return;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException(`Nó "${nodeId}" tem emailApprovers inválido.`);
    }
    const config = raw as Record<string, unknown>;
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      throw new BadRequestException(`Nó "${nodeId}" tem emailApprovers.enabled inválido.`);
    }
    for (const [key, max] of [
      ['subject', APPROVAL_EMAIL_SUBJECT_MAX],
      ['body', APPROVAL_EMAIL_BODY_MAX],
    ] as const) {
      const value = config[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.length > max) {
        throw new BadRequestException(`Nó "${nodeId}": o ${key === 'subject' ? 'assunto' : 'texto'} do e-mail deve ter até ${max} caracteres.`);
      }
      if (hasMalformedTokens(value)) {
        throw new BadRequestException(`Nó "${nodeId}": o ${key === 'subject' ? 'assunto' : 'texto'} do e-mail tem variável mal formada.`);
      }
    }
  }

  /**
   * Junta a `ctx.fields` os campos de fase do Kanban já salvos na solicitação — é o que deixa uma
   * condição ou um `{{campo}}` usar o que foi preenchido no card (ex.: "retirado de rota" pela
   * Logística) — e as respostas que um fluxo deu ao criá-la sem formulário (ex.: o pedido de um
   * lote recebido por webhook). Lido do banco a cada execução/retomada, então reflete o último
   * salvamento. Num código repetido a resposta do formulário ganha (ela vem por cima, aqui e no
   * motor), depois a dada pelo fluxo, por último o campo de fase.
   */
  private async withSolicitationFieldValues(
    context: FlowExecutionContext,
  ): Promise<FlowExecutionContext> {
    const solicitation = context.solicitation;
    if (!solicitation?.id) return context;
    const phaseValues = await this.phaseFieldValuesRepo.find({
      where: { solicitationId: solicitation.id },
    });
    const flowGivenValues = readSolicitationFormFieldValues(solicitation.metadata);
    if (phaseValues.length === 0 && Object.keys(flowGivenValues).length === 0) return context;
    return {
      ...context,
      fields: {
        ...buildPhaseFieldValues(phaseValues),
        ...flowGivenValues,
        ...(context.fields ?? {}),
      },
    };
  }

  private buildFieldsFromSubmission(submission: SubmissionEntity): Record<string, unknown> {
    return buildFlowFieldValues(submission.items);
  }

  private async buildContextFromJob(job: FlowContextJob): Promise<FlowExecutionContext | null> {
    let submission: SubmissionEntity | undefined;
    let form: FormEntity | undefined;
    let solicitation: SolicitationEntity | undefined;
    let approval: ApprovalEntity | undefined;
    let attachment: AttachmentEntity | undefined;

    if (job.submissionId) {
      const foundSubmission = await this.submissionsRepo.findOne({
        where: { id: job.submissionId },
        relations: ['form', 'items'],
      });
      if (!foundSubmission) return null;
      submission = foundSubmission;
      form = foundSubmission.form;
    }

    if (job.solicitationId) {
      const foundSolicitation = await this.solicitationsRepo.findOne({
        where: { id: job.solicitationId },
        relations: ['form', 'submission', 'submission.items', 'assignee', 'createdByUser'],
      });
      if (!foundSolicitation) return null;
      solicitation = foundSolicitation;
      submission = foundSolicitation.submission ?? submission;
      form = foundSolicitation.form ?? form;
    }

    if (job.approvalId) {
      const foundApproval = await this.approvalsRepo.findOne({
        where: { id: job.approvalId },
        relations: [
          'steps',
          'solicitation',
          'solicitation.form',
          'solicitation.submission',
          'solicitation.submission.items',
          'solicitation.assignee',
          'solicitation.createdByUser',
        ],
      });
      if (!foundApproval) return null;
      approval = foundApproval;
      solicitation = foundApproval.solicitation ?? solicitation;
      submission = foundApproval.solicitation?.submission ?? submission;
      form = foundApproval.solicitation?.form ?? form;
    }

    if (job.attachmentId) {
      const foundAttachment = await this.attachmentsRepo.findOne({ where: { id: job.attachmentId } });
      if (!foundAttachment) return null;
      attachment = foundAttachment;
    }

    return {
      eventName: job.eventName,
      submission,
      form,
      fields: submission ? this.buildFieldsFromSubmission(submission) : undefined,
      solicitation,
      approval,
      attachment,
      metadata: job.metadata,
      actorId: job.actorId ?? undefined,
      flowEventDepth: job.flowEventDepth ?? this.getMetadataNumber(job.metadata, 'flowEventDepth'),
    };
  }

  /**
   * Returns the formId restriction for a trigger node.
   * Priority: trigger node's data.formId → legacy flow.formId → null (no restriction).
   */
  private getEffectiveTriggerFormId(flow: FlowEntity, trigger: FlowNode): string | null {
    const nodeFormId = (trigger.data as { formId?: string | null }).formId;
    if (nodeFormId != null && nodeFormId !== '') return nodeFormId;
    return flow.formId ?? null;
  }

  /**
   * Copies formId into every trigger_form_submit node.
   * backfillOnly=true: only sets if the node has no formId yet.
   * backfillOnly=false: force-sets (used on create / explicit formId change).
   */
  private syncFormIdIntoTriggerNode(
    nodes: FlowNode[],
    formId: string | null,
    forceOverwrite: boolean,
  ): FlowNode[] {
    if (!formId) return nodes;
    return nodes.map((node) => {
      if (node.type !== 'trigger_form_submit') return node;
      const data = node.data as TriggerFormSubmitData;
      if (!forceOverwrite && data.formId) return node;
      return { ...node, data: { ...data, formId } };
    });
  }

  private getConfiguredWebhookEndpointId(trigger: FlowNode): string | null {
    const data = trigger.data as { endpointId?: unknown; webhookEndpointId?: unknown } | undefined;
    const endpointId = data?.endpointId ?? data?.webhookEndpointId;
    return typeof endpointId === 'string' && endpointId.trim() ? endpointId : null;
  }

  /** Revalida apenas os nós `action_notification` (usado ao ativar o fluxo). */
  private assertNotificationNodesValid(nodes: FlowNodeDto[]): void {
    for (const node of nodes ?? []) {
      if (node.type === 'action_notification') this.validateNodeData(node);
    }
  }

  private validateFlowStructure(
    nodes: FlowNodeDto[],
    edges: FlowEdgeDto[],
    currentFlowId?: string,
  ): void {
    if (nodes.length > MAX_FLOW_NODES) {
      throw new BadRequestException(
        `Um fluxo pode ter no máximo ${MAX_FLOW_NODES} nós (recebido: ${nodes.length}).`,
      );
    }

    // Vários gatilhos são várias entradas no mesmo fluxo, cada uma ligada onde o processo deve
    // começar. O agendado é a exceção: o fluxo guarda uma única próxima execução (next_run_at).
    const triggers = nodes.filter((n) => isFlowTriggerNodeType(n.type));
    if (triggers.length === 0) {
      throw new BadRequestException('Um fluxo deve ter pelo menos um nó de gatilho.');
    }
    if (triggers.filter((n) => n.type === 'trigger_scheduled').length > 1) {
      throw new BadRequestException('Um fluxo pode ter só um gatilho agendado.');
    }
    const triggerIds = new Set(triggers.map((n) => n.id));
    if (edges.some((edge) => triggerIds.has(edge.target))) {
      throw new BadRequestException('Um gatilho não pode receber conexão — ele só inicia o fluxo.');
    }

    const knownTypes = new Set<string>(FLOW_NODE_TYPES);
    const seenIds = new Set<string>();
    for (const node of nodes) {
      if (seenIds.has(node.id)) {
        throw new BadRequestException(`Id de nó repetido: "${node.id}".`);
      }
      seenIds.add(node.id);
      if (!knownTypes.has(node.type)) {
        throw new BadRequestException(`Tipo de nó inválido: "${node.type}".`);
      }
      this.validateNodeData(node, currentFlowId);
    }

    this.validateFlowEdges(nodes, edges);
  }

  /**
   * Arestas só entre nós existentes e sem ciclo — mesmas regras do editor (flow-validation.ts),
   * para que um fluxo salvo pela API não entre em laço no motor. Usado também quando um update
   * troca só as arestas, contra os nós já salvos.
   */
  private validateFlowEdges(nodes: Array<{ id: string }>, edges: FlowEdgeDto[]): void {
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        throw new BadRequestException(
          `Edge referencia nó inexistente: ${edge.source} → ${edge.target}`,
        );
      }
    }

    const children = new Map<string, string[]>();
    for (const edge of edges) {
      children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
    }
    // DFS com três estados: chegar de novo a um nó ainda "em visita" é um ciclo.
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string): boolean => {
      state.set(id, 'visiting');
      for (const child of children.get(id) ?? []) {
        const childState = state.get(child);
        if (childState === 'visiting') return true;
        if (childState === undefined && visit(child)) return true;
      }
      state.set(id, 'done');
      return false;
    };
    for (const id of nodeIds) {
      if (!state.has(id) && visit(id)) {
        throw new BadRequestException(
          'O fluxo contém um ciclo (loop infinito) — remova a conexão circular.',
        );
      }
    }
  }

  private async assertFormExists(formId: string): Promise<void> {
    const exists = await this.formsRepo.exists({ where: { id: formId } });
    if (!exists) throw new NotFoundException('Formulário não encontrado.');
  }

  private validateNodeData(node: FlowNodeDto, currentFlowId?: string): void {
    const data = node.data ?? {};
    switch (node.type) {
      case 'trigger_webhook_received':
        if (data.endpointId !== undefined && !this.hasNonEmptyString(data.endpointId)) {
          throw new BadRequestException(`Nó "${node.id}" requer endpointId válido.`);
        }
        if (data.payloadFilters !== undefined && !this.isPlainObject(data.payloadFilters)) {
          throw new BadRequestException(`Nó "${node.id}" requer payloadFilters válido.`);
        }
        if (data.splitItemsPath !== undefined && typeof data.splitItemsPath !== 'string') {
          throw new BadRequestException(`Nó "${node.id}" requer splitItemsPath em texto.`);
        }
        return;
      case 'trigger_solicitation_created':
        if (
          data.originTypes !== undefined &&
          (!Array.isArray(data.originTypes) ||
            data.originTypes.some(
              (origin) =>
                !Object.values(SolicitationOriginType).includes(origin as SolicitationOriginType),
            ))
        ) {
          throw new BadRequestException(`Nó "${node.id}" tem originTypes inválido.`);
        }
        return;
      case 'trigger_scheduled': {
        if (data.mode !== 'interval' && data.mode !== 'cron') {
          throw new BadRequestException(`Nó "${node.id}" requer mode 'interval' ou 'cron'.`);
        }
        if (data.mode === 'interval') {
          const value = Number(data.intervalValue);
          if (!Number.isInteger(value) || value < 1) {
            throw new BadRequestException(`Nó "${node.id}" requer intervalValue inteiro >= 1.`);
          }
          if (!['minutes', 'hours', 'days'].includes(String(data.intervalUnit))) {
            throw new BadRequestException(`Nó "${node.id}" requer intervalUnit válido.`);
          }
        } else {
          if (!this.hasNonEmptyString(data.cronExpression)) {
            throw new BadRequestException(`Nó "${node.id}" requer cronExpression.`);
          }
          try {
            CronExpressionParser.parse(String(data.cronExpression), {
              tz: this.hasNonEmptyString(data.timezone)
                ? String(data.timezone)
                : DEFAULT_SCHEDULE_TIMEZONE,
            });
          } catch {
            throw new BadRequestException(`Nó "${node.id}" tem cronExpression inválida.`);
          }
        }
        return;
      }
      // Os quatro casos abaixo seguem o que o editor já exige antes de salvar (flow-validation.ts),
      // aceitando também os nomes de campo do uso direto pela API (`to`, `url`).
      case 'action_send_email': {
        const toList = Array.isArray(data.to) ? data.to : [];
        if (!this.hasNonEmptyString(data.toEmail) && !toList.some((t) => this.hasNonEmptyString(t))) {
          throw new BadRequestException(`Nó "${node.id}" requer destinatário (toEmail).`);
        }
        return;
      }
      case 'action_webhook':
        if (!this.hasNonEmptyString(data.webhookUrl) && !this.hasNonEmptyString(data.url)) {
          throw new BadRequestException(`Nó "${node.id}" requer webhookUrl.`);
        }
        return;
      case 'action_notify_users':
        if (!Array.isArray(data.userIds) || data.userIds.length === 0) {
          throw new BadRequestException(`Nó "${node.id}" requer ao menos um usuário (userIds).`);
        }
        return;
      case 'condition_field_value':
        if (!this.hasNonEmptyString(data.fieldCode)) {
          throw new BadRequestException(`Nó "${node.id}" requer fieldCode.`);
        }
        this.assertRequiredOperator(node, [
          'equals',
          'not_equals',
          'contains',
          'greater_than',
          'less_than',
          'is_empty',
          'is_not_empty',
        ]);
        return;
      case 'action_http_check':
        if (!this.hasNonEmptyString(data.url)) {
          throw new BadRequestException(`Nó "${node.id}" requer url.`);
        }
        if (!['GET', 'POST', 'PUT', 'PATCH'].includes(String(data.method))) {
          throw new BadRequestException(`Nó "${node.id}" requer method válido.`);
        }
        return;
      case 'condition_response_value':
        if (!this.hasNonEmptyString(data.path)) {
          throw new BadRequestException(`Nó "${node.id}" requer path.`);
        }
        this.assertRequiredOperator(node, [
          'equals',
          'not_equals',
          'contains',
          'greater_than',
          'less_than',
          'is_empty',
          'is_not_empty',
        ]);
        return;
      case 'condition_solicitation_status':
        this.assertRequiredOperator(node, ['equals', 'not_equals']);
        this.assertEnumValue(node, 'value', SolicitationStatus);
        return;
      case 'condition_solicitation_priority':
        this.assertRequiredOperator(node, ['equals', 'not_equals', 'greater_than', 'less_than']);
        this.assertEnumValue(node, 'value', SolicitationPriority);
        return;
      case 'action_update_solicitation_status':
      case 'action_move_kanban_card':
        this.assertEnumValue(node, 'status', SolicitationStatus);
        return;
      case 'action_create_approval': {
        if (!this.hasNonEmptyString(data.title)) {
          throw new BadRequestException(`Nó "${node.id}" requer title.`);
        }
        const approverSourceMode =
          data.approverSourceMode === 'dynamic' ||
          data.approverSourceMode === 'phase_role' ||
          data.approverSourceMode === 'field'
            ? data.approverSourceMode
            : 'fixed';
        if (data.approverEmails !== undefined) {
          const emails = data.approverEmails;
          if (
            !Array.isArray(emails) ||
            emails.length > 10 ||
            emails.some((email) => typeof email !== 'string' || !normalizeEmailAddress(email))
          ) {
            throw new BadRequestException(
              `Nó "${node.id}" tem approverEmails inválido (lista de até 10 e-mails válidos).`,
            );
          }
        }
        if (data.allowExternalApprovers !== undefined && typeof data.allowExternalApprovers !== 'boolean') {
          throw new BadRequestException(`Nó "${node.id}" tem allowExternalApprovers inválido.`);
        }
        this.assertApprovalEmailConfig(node.id, data.emailApprovers);
        if (data.approverRoleCodes !== undefined) {
          const roles = data.approverRoleCodes;
          if (
            !Array.isArray(roles) ||
            roles.length > 20 ||
            roles.some((role) => typeof role !== 'string' || !role.trim())
          ) {
            throw new BadRequestException(
              `Nó "${node.id}" tem approverRoleCodes inválido (lista de até 20 códigos de perfil).`,
            );
          }
        }
        if (approverSourceMode === 'fixed') {
          const hasUsers = Array.isArray(data.assignedUserIds) && data.assignedUserIds.length > 0;
          const hasRoles = Array.isArray(data.approverRoleCodes) && data.approverRoleCodes.length > 0;
          const hasEmails = Array.isArray(data.approverEmails) && data.approverEmails.length > 0;
          if (!hasUsers && !hasRoles && !hasEmails) {
            throw new BadRequestException(
              `Nó "${node.id}" requer assignedUserIds, approverRoleCodes ou approverEmails não vazio.`,
            );
          }
        } else if (approverSourceMode === 'dynamic' && !this.hasNonEmptyString(data.approversPath)) {
          throw new BadRequestException(`Nó "${node.id}" requer approversPath no modo dinâmico.`);
        } else if (approverSourceMode === 'field' && !this.hasNonEmptyString(data.approverFieldCode)) {
          throw new BadRequestException(
            `Nó "${node.id}" requer approverFieldCode no modo campo do formulário.`,
          );
        }
        // 'phase_role' não exige nada em tempo de design — o perfil aprovador vem de
        // ctx.metadata.approverRoleCode, resolvido em runtime pelo gatilho de anexo.
        if (data.scope !== undefined && data.scope !== 'solicitation' && data.scope !== 'phase') {
          throw new BadRequestException(`Nó "${node.id}" tem scope inválido.`);
        }
        return;
      }
      case 'action_ai_agent':
        // A URL vem do servidor (LOPS_AI_BASE_URL); o agente e a chave são por nó. A chave do
        // servidor (LOPS_AI_API_KEY) só lista os agentes — nunca executa um nó.
        if (!this.hasNonEmptyString(data.agentSlug)) {
          throw new BadRequestException(`Nó "${node.id}" requer agentSlug.`);
        }
        if (!this.hasNonEmptyString(data.apiKey)) {
          throw new BadRequestException(`Nó "${node.id}" requer apiKey.`);
        }
        return;
      case 'action_wait_for_phase_fields':
        if (!this.hasNonEmptyString(data.phaseId)) {
          throw new BadRequestException(`Nó "${node.id}" requer phaseId.`);
        }
        return;
      case 'action_move_phase':
        if (!this.hasNonEmptyString(data.phaseId)) {
          throw new BadRequestException(`Nó "${node.id}" requer phaseId.`);
        }
        return;
      case 'trigger_attachment_uploaded':
        if (data.fieldCode !== undefined && !this.hasNonEmptyString(data.fieldCode)) {
          throw new BadRequestException(`Nó "${node.id}" tem fieldCode inválido.`);
        }
        return;
      case 'trigger_phase_field_saved':
      case 'trigger_approval_completed':
        if (data.phaseId !== undefined && !this.hasNonEmptyString(data.phaseId)) {
          throw new BadRequestException(`Nó "${node.id}" tem phaseId inválido.`);
        }
        return;
      case 'trigger_phase_entered':
        if (data.phaseId !== undefined && !this.hasNonEmptyString(data.phaseId)) {
          throw new BadRequestException(`Nó "${node.id}" tem phaseId inválido.`);
        }
        if (data.fromPhaseId !== undefined && !this.hasNonEmptyString(data.fromPhaseId)) {
          throw new BadRequestException(`Nó "${node.id}" tem fromPhaseId inválido.`);
        }
        return;
      case 'condition_approval_result':
        this.assertRequiredOperator(node, ['equals', 'not_equals']);
        if (data.value !== 'approved' && data.value !== 'rejected') {
          throw new BadRequestException(`Nó "${node.id}" requer value "approved" ou "rejected".`);
        }
        return;
      case 'action_create_solicitation_from_payload':
        if (
          !this.hasNonEmptyString(data.titlePath) &&
          !this.hasNonEmptyString(data.titleTemplate)
        ) {
          throw new BadRequestException(`Nó "${node.id}" requer titlePath ou titleTemplate.`);
        }
        if (
          data.metadataFieldMappings !== undefined &&
          !this.isValidFieldMappingArray(data.metadataFieldMappings)
        ) {
          throw new BadRequestException(`Nó "${node.id}" requer metadataFieldMappings válido.`);
        }
        for (const key of ['dueInMonths', 'dueInDays'] as const) {
          if (data[key] !== undefined && !this.isPositiveIntegerValue(data[key])) {
            throw new BadRequestException(`Nó "${node.id}" requer ${key} inteiro positivo.`);
          }
        }
        if (
          data.slaWarningThresholdPercent !== undefined &&
          !this.isPercentValue(data.slaWarningThresholdPercent)
        ) {
          throw new BadRequestException(
            `Nó "${node.id}" requer slaWarningThresholdPercent entre 1 e 99.`,
          );
        }
        if (data.stopIfExisting !== undefined && typeof data.stopIfExisting !== 'boolean') {
          throw new BadRequestException(`Nó "${node.id}" tem stopIfExisting inválido.`);
        }
        if (data.fieldValues !== undefined && !this.isValidSolicitationFieldValues(data.fieldValues)) {
          throw new BadRequestException(
            `Nó "${node.id}" requer fieldValues válido (até ${MAX_SOLICITATION_FIELD_VALUES} campos com código e valor).`,
          );
        }
        if (
          data.formId !== undefined &&
          data.formId !== null &&
          !(this.hasNonEmptyString(data.formId) && this.isValidUuid(data.formId))
        ) {
          throw new BadRequestException(`Nó "${node.id}" requer formId UUID válido.`);
        }
        if (
          data.phaseId !== undefined &&
          data.phaseId !== null &&
          !(this.hasNonEmptyString(data.phaseId) && this.isValidUuid(data.phaseId))
        ) {
          throw new BadRequestException(`Nó "${node.id}" requer phaseId UUID válido.`);
        }
        return;
      case 'action_forward_to_process':
        if (!(this.hasNonEmptyString(data.formId) && this.isValidUuid(String(data.formId)))) {
          throw new BadRequestException(`Nó "${node.id}" requer o processo de destino (formId).`);
        }
        if (
          data.phaseId !== undefined &&
          data.phaseId !== null &&
          data.phaseId !== '' &&
          !this.isValidUuid(String(data.phaseId))
        ) {
          throw new BadRequestException(`Nó "${node.id}" requer phaseId UUID válido.`);
        }
        for (const key of ['autoMatchByCode', 'copyAttachments', 'stopIfExisting'] as const) {
          if (data[key] !== undefined && typeof data[key] !== 'boolean') {
            throw new BadRequestException(`Nó "${node.id}" tem ${key} inválido.`);
          }
        }
        if (data.fieldMappings !== undefined && !this.isValidForwardFieldMappings(data.fieldMappings)) {
          throw new BadRequestException(
            `Nó "${node.id}" requer fieldMappings válido (até ${MAX_FORWARD_FIELD_MAPPINGS} campos, cada um com o campo do destino e de onde vem o valor).`,
          );
        }
        return;
      case 'action_assign_responsible':
        if (!this.hasNonEmptyString(data.userId)) {
          throw new BadRequestException(`Nó "${node.id}" requer userId.`);
        }
        return;
      case 'action_send_whatsapp':
        if (!['requester', 'responsible', 'custom'].includes(String(data.recipientType))) {
          throw new BadRequestException(`Nó "${node.id}" requer recipientType válido.`);
        }
        if (!this.hasNonEmptyString(data.message)) {
          throw new BadRequestException(`Nó "${node.id}" requer message.`);
        }
        if (data.recipientType === 'custom' && !this.hasNonEmptyString(data.customPhone)) {
          throw new BadRequestException(`Nó "${node.id}" requer customPhone.`);
        }
        return;
      case 'action_notification': {
        const problems = getNotificationNodeErrors(data);
        if (problems.length > 0) {
          throw new BadRequestException(`Nó "${node.id}" (notificação): ${problems.join(' ')}`);
        }
        return;
      }
      case 'action_run_flow': {
        if (!this.hasNonEmptyString(data.flowId)) {
          throw new BadRequestException(`Nó "${node.id}" requer flowId.`);
        }
        if (!this.isValidUuid(String(data.flowId))) {
          throw new BadRequestException(`Nó "${node.id}" requer flowId UUID válido.`);
        }
        if (currentFlowId && data.flowId === currentFlowId) {
          throw new BadRequestException(
            `Nó "${node.id}" não pode referenciar o próprio fluxo (auto-referência imediata).`,
          );
        }
        if (!['sync', 'async'].includes(String(data.mode))) {
          throw new BadRequestException(`Nó "${node.id}" requer mode 'sync' ou 'async'.`);
        }
        if (typeof data.passContext !== 'boolean') {
          throw new BadRequestException(`Nó "${node.id}" requer passContext boolean.`);
        }
        return;
      }
      default:
        return;
    }
  }

  private assertRequiredOperator(node: FlowNodeDto, allowed: string[]): void {
    const operator = node.data?.operator;
    if (typeof operator !== 'string' || !allowed.includes(operator)) {
      throw new BadRequestException(`Nó "${node.id}" requer operator válido.`);
    }
  }

  private assertEnumValue<T extends Record<string, string>>(
    node: FlowNodeDto,
    key: string,
    enumObject: T,
  ): void {
    const value = node.data?.[key];
    if (typeof value !== 'string' || !Object.values(enumObject).includes(value)) {
      throw new BadRequestException(`Nó "${node.id}" requer ${key} válido.`);
    }
  }

  private hasNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isValidUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private isValidFieldMappingArray(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    return value.every(
      (entry) =>
        this.isPlainObject(entry) &&
        this.hasNonEmptyString(entry.path) &&
        this.hasNonEmptyString(entry.target),
    );
  }

  private isValidSolicitationFieldValues(value: unknown): boolean {
    if (!Array.isArray(value) || value.length > MAX_SOLICITATION_FIELD_VALUES) return false;
    return value.every(
      (entry) =>
        this.isPlainObject(entry) &&
        this.hasNonEmptyString(entry.fieldCode) &&
        typeof entry.value === 'string' &&
        entry.value.length <= 2000,
    );
  }

  private isValidForwardFieldMappings(value: unknown): boolean {
    if (!Array.isArray(value) || value.length > MAX_FORWARD_FIELD_MAPPINGS) return false;
    return value.every(
      (entry) =>
        this.isPlainObject(entry) &&
        this.hasNonEmptyString(entry.targetFieldCode) &&
        (entry.sourceFieldCode === undefined || typeof entry.sourceFieldCode === 'string') &&
        (entry.value === undefined || (typeof entry.value === 'string' && entry.value.length <= 2000)),
    );
  }

  private isPositiveIntegerValue(value: unknown): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
  }

  private isPercentValue(value: unknown): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 99;
  }

  private getMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number {
    const value = Number(metadata?.[key] ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private normalizeFlowName(name: string): string {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('Nome do fluxo é obrigatório.');
    return normalized;
  }

  private async assertFlowNameAvailable(
    userId: string,
    name: string,
    ignoreFlowId?: string,
  ): Promise<void> {
    const query = this.flowsRepo
      .createQueryBuilder('flow')
      .where('flow.created_by = :userId', { userId })
      .andWhere('LOWER(BTRIM(flow.name)) = LOWER(BTRIM(:name))', { name });

    if (ignoreFlowId) {
      query.andWhere('flow.id <> :ignoreFlowId', { ignoreFlowId });
    }

    const duplicate = await query.getExists();
    if (duplicate) {
      throw new ConflictException('Já existe um fluxo com esse nome.');
    }
  }

  /** Agrega hasSubFlows ao FlowEntity retornado em create/update sem alterar o tipo. */
  private withHasSubFlows(flow: FlowEntity): FlowEntity {
    (flow as unknown as Record<string, unknown>)['hasSubFlows'] =
      flow.nodes?.some((n) => n.type === 'action_run_flow') ?? false;
    return flow;
  }

  private async saveFlow(flow: FlowEntity): Promise<FlowEntity> {
    try {
      return await this.flowsRepo.save(flow);
    } catch (error) {
      if (this.isFlowNameUniqueViolation(error)) {
        throw new ConflictException('Já existe um fluxo com esse nome.');
      }
      throw error;
    }
  }

  private isFlowNameUniqueViolation(error: unknown): boolean {
    return this.isUniqueViolation(error, 'UQ_flows_created_by_name');
  }

  private isFlowExecutionUniqueViolation(error: unknown): boolean {
    return this.isUniqueViolation(error, 'UQ_flow_executions_flow_submission');
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return driverError?.code === '23505' && driverError.constraint === constraint;
  }

  private async findByIdOrFail(
    id: string,
    userId: string,
    role: string,
    relations: string[] = [],
    permissionCode: string = 'flows.manage',
  ): Promise<FlowEntity> {
    const flow = await this.flowsRepo.findOne({
      where: { id },
      relations: [...new Set([...relations, 'form'])],
    });
    if (!flow) throw new NotFoundException('Fluxo não encontrado.');

    // Quem criou o fluxo, ou quem tem o código num processo do fluxo (o form_id ou o formulário de um
    // gatilho). 404, não 403: quem não pode ver não fica sabendo que o fluxo existe.
    if (flow.createdBy === userId) return flow;
    const systemScope = (await this.rolePermissions?.getScope(role, permissionCode)) ?? 'none';
    if (systemScope === 'all' || systemScope === 'area') return flow;
    const grants = await this.processAccess.grantsOf({ sub: userId, role });
    const homeForms = new Set<string>();
    if (flow.formId) homeForms.add(flow.formId);
    for (const node of flow.nodes ?? []) {
      if (!node.type.startsWith('trigger_')) continue;
      const formId = this.getEffectiveTriggerFormId(flow, node);
      if (formId) homeForms.add(formId);
    }
    const allowed =
      grants.fullAccess || [...homeForms].some((formId) => grants.scope(formId, permissionCode) !== 'none');
    if (!allowed) throw new NotFoundException('Fluxo não encontrado.');
    return flow;
  }

  private async findOwnedOrFail(
    id: string,
    userId: string,
    relations?: string[],
  ): Promise<FlowEntity> {
    const flow = await this.flowsRepo.findOne({
      where: { id, createdBy: userId },
      relations,
    });
    if (!flow) throw new NotFoundException('Fluxo não encontrado.');
    return flow;
  }
}
