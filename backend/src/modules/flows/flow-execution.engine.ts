import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import {
  ApprovalEntity,
  AttachmentEntity,
  FlowEntity,
  FlowExecutionEntity,
  NotificationEntity,
} from '../../database/entities';
import type { SolicitationEntity } from '../../database/entities';
import { WebhookDeliveryStatus } from '../../database/entities/webhook-delivery.entity';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import type {
  ActionAiAgentData,
  ActionErpOperationData,
  ActionGoogleSheetsData,
  ActionAssignResponsibleData,
  ActionCreateApprovalData,
  ActionCreateSolicitationFromPayloadData,
  ActionForwardToProcessData,
  ActionHttpCheckData,
  ActionMoveKanbanCardData,
  ActionMovePhaseData,
  ActionNotificationData,
  ActionNotifyUsersData,
  ActionRunFlowData,
  ActionSendEmailData,
  ActionSendWhatsAppData,
  ActionUpdateSolicitationStatusData,
  ActionWaitForPhaseFieldsData,
  ActionWebhookData,
  ConditionApprovalResultData,
  ConditionFieldValueData,
  ConditionResponseValueData,
  ConditionSolicitationPriorityData,
  ConditionSolicitationStatusData,
  FlowEdge,
  FlowExecutionContext,
  FlowNode,
  FlowTriggerNodeType,
  NodeExecutionResult,
  TestRunAssumption,
} from './types/flow.types';
import { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import { FlowMailerService } from './mailer/flow-mailer.service';
import { NodeFailureError } from './lib/node-failure.error';
import { buildFlowFieldValues, readSolicitationFormFieldValues } from './lib/flow-field-values';
import { coerceAnswerToNumber } from '../../common/formula/formula.engine';
import { FlowNotificationNodeExecutor } from './notification/flow-notification-node.executor';
import { MetricsService } from '../observability/metrics.service';
import {
  MAX_FLOW_EVENT_DEPTH,
  SOLICITATION_FORM_FIELD_VALUES_KEY,
  isFlowTriggerNodeType,
} from './types/flow.types';
import { SolicitationsService } from '../solicitations/solicitations.service';
import type { HandoffMapping } from '../solicitations/process-handoff.answers';
import { phaseApproverMetadata } from '../kanban-phases/phase-people';
import { approvalEmailNotification, isApprovalEmailEnabled } from './notification/approval-email';
import { ApprovalsService } from '../approvals/approvals.service';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { OutboundWebhookService } from '../integrations/outbound-webhook.service';
import { WhatsAppConnectorService } from '../integrations/whatsapp/whatsapp-connector.service';
import { ErpConnectorService } from '../integrations/erp/erp-connector.service';
import { resolveLopsAiEndpoint, type LopsAiEndpoint } from '../integrations/lops-ai/lops-ai.config';
import { StorageService } from '../storage/storage.service';
import { FlowFieldLabelsService } from './flow-field-labels.service';
import { fieldTemplateValue } from './lib/flow-field-labels';
import { resolveEmailList, resolvePath, toEmailList } from '../../common/utils/dot-path';

/** Máximo de sub-fluxos aninhados via action_run_flow */
const MAX_SUBFLOW_DEPTH = 5;

/**
 * Marca o resultado de um nó action_create_approval que deixou a execução esperando uma
 * decisão humana — o motor não tem uma etapa de espera de verdade, então ele para de
 * percorrer o grafo bem aqui em vez de continuar com um `ctx.solicitation`/`ctx.approval`
 * desatualizados (o bug original: a condição logo depois via o status de *antes* da
 * aprovação existir). FlowsService.executeFlowWithContext lê esse marcador para persistir
 * `status: 'waiting_approval'`, e FlowsApprovalListener retoma exatamente deste nó
 * (engine.resumeFrom) quando `approvals.approved`/`approvals.rejected` dispara.
 */
export function isPausedApprovalResult(
  result: NodeExecutionResult,
): result is NodeExecutionResult & { output: { paused: true; approvalId: string } } {
  if (result.status !== 'success' || !result.output || typeof result.output !== 'object') {
    return false;
  }
  const output = result.output as { paused?: unknown; approvalId?: unknown };
  return output.paused === true && typeof output.approvalId === 'string';
}

/**
 * Marca o resultado de um nó action_wait_for_phase_fields que deixou a execução esperando os
 * campos de uma fase serem salvos — a mesma ideia de isPausedApprovalResult, mas pausando por
 * um evento diferente (solicitations.phase_fields_saved em vez de uma decisão de aprovação).
 * FlowsService.executeFlowWithContext lê esse marcador para persistir
 * `status: 'waiting_phase_fields'` + `waitingPhaseId`, e FlowsPhaseFieldsListener retoma
 * exatamente deste nó (engine.resumeFrom) quando a fase esperada é salva.
 */
export function isPausedPhaseFieldsResult(
  result: NodeExecutionResult,
): result is NodeExecutionResult & { output: { paused: true; waitingPhaseId: string } } {
  if (result.status !== 'success' || !result.output || typeof result.output !== 'object') {
    return false;
  }
  const output = result.output as { paused?: unknown; waitingPhaseId?: unknown };
  return output.paused === true && typeof output.waitingPhaseId === 'string';
}

/**
 * Marca o resultado de um action_run_flow em modo `sync` cujo filho pausou (aprovação, espera de
 * fase ou o próprio sub-fluxo dele). O pai para aqui, como "esperar o fim" pede: FlowsService
 * grava `status: 'waiting_subflow'` e, quando a execução do filho (`waitingSubflowExecutionId`)
 * termina, retoma o pai deste nó — ou o encerra com falha, se o filho falhou.
 */
export function isPausedSubflowResult(
  result: NodeExecutionResult,
): result is NodeExecutionResult & { output: { paused: true; waitingSubflowExecutionId: string } } {
  if (result.status !== 'success' || !result.output || typeof result.output !== 'object') {
    return false;
  }
  const output = result.output as { paused?: unknown; waitingSubflowExecutionId?: unknown };
  return output.paused === true && typeof output.waitingSubflowExecutionId === 'string';
}

/**
 * Teste manual (FlowsService.runTest): o que cada gatilho traz na execução real e o teste não
 * tem. Um nó que depende disso é simulado em vez de falhar — falhar seria culpa do teste, não do
 * fluxo. Sem o dado e fora desta lista, o nó falha como falharia em produção.
 */
const TEST_RUN_EVENT_DATA: Record<FlowTriggerNodeType, readonly TestRunAssumption[]> = {
  trigger_form_submit: [],
  trigger_webhook_received: ['payload'],
  trigger_solicitation_created: ['solicitation'],
  trigger_solicitation_moved: ['solicitation'],
  trigger_approval_completed: ['solicitation', 'approval'],
  trigger_sla_warning: ['solicitation'],
  trigger_sla_breached: ['solicitation'],
  trigger_scheduled: [],
  trigger_attachment_uploaded: ['solicitation', 'attachment', 'phase'],
  trigger_phase_field_saved: ['solicitation', 'phase'],
  trigger_phase_entered: ['solicitation', 'phase'],
};

/**
 * Saída de um nó no teste manual: o que ele faria, sem fazer. `summary` é a frase mostrada no
 * modal de teste; o resto são detalhes para conferir.
 */
function dryRunOutput(summary: string, details: Record<string, unknown> = {}): Record<string, unknown> {
  return { dryRun: true, summary, ...details };
}

/**
 * Nó que encerrou o caminho de propósito (ex.: "Criar solicitação" com uma solicitação que já
 * existia): sucesso, sem pausa e sem seguir para os filhos. `summary` aparece no histórico.
 */
function stoppedBranchOutput(summary: string, details: Record<string, unknown> = {}): Record<string, unknown> {
  return { stopped: true, summary, ...details };
}

function isStoppedBranchResult(result: NodeExecutionResult): boolean {
  const output = result.output as { stopped?: unknown } | undefined;
  return result.status === 'success' && output?.stopped === true;
}

/** Uma aprovação simulada no teste para a execução ali, como a real esperaria a decisão. */
function isDryRunPauseResult(result: NodeExecutionResult): boolean {
  const output = result.output as { dryRun?: unknown; paused?: unknown } | undefined;
  return result.status === 'success' && output?.dryRun === true && output.paused === true;
}

const DRY_RUN_PREVIEW_MAX = 500;

function previewText(text: string): string {
  return text.length > DRY_RUN_PREVIEW_MAX ? `${text.slice(0, DRY_RUN_PREVIEW_MAX)}…` : text;
}

@Injectable()
export class FlowExecutionEngine {
  private readonly logger = new Logger(FlowExecutionEngine.name);

  constructor(
    private readonly mailer: FlowMailerService,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepo: Repository<NotificationEntity>,
    @InjectRepository(FlowExecutionEntity)
    private readonly executionsRepo: Repository<FlowExecutionEntity>,
    @InjectRepository(FlowEntity)
    private readonly flowsRepo: Repository<FlowEntity>,
    @InjectRepository(ApprovalEntity)
    private readonly approvalsRepo: Repository<ApprovalEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepo: Repository<AttachmentEntity>,
    private readonly googleWorkspace: GoogleWorkspaceService,
    private readonly metricsService: MetricsService,
    private readonly solicitationsService: SolicitationsService,
    private readonly approvalsService: ApprovalsService,
    private readonly usersService: UsersService,
    private readonly outboundWebhookService: OutboundWebhookService,
    private readonly whatsappConnectorService: WhatsAppConnectorService,
    private readonly configService: ConfigService,
    private readonly erpConnectorService: ErpConnectorService,
    private readonly storageService: StorageService,
    private readonly notificationExecutor: FlowNotificationNodeExecutor,
    @Optional() private readonly fieldLabels?: FlowFieldLabelsService,
  ) {}

  async execute(flow: FlowEntity, context: FlowExecutionContext): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = [];
    const executionContext = this.buildContext(context);
    executionContext.fieldLabels = (await this.fieldLabels?.labelsFor(executionContext)) ?? {};

    const triggerNode = this.resolveEntryNode(flow, executionContext.entryNodeId);
    if (!triggerNode) return results;
    executionContext.entryNodeId = triggerNode.id;

    if (this.isTestRun(executionContext)) {
      executionContext.testRunAssumptions = new Set(
        TEST_RUN_EVENT_DATA[triggerNode.type as FlowTriggerNodeType] ?? [],
      );
    }

    await this.executeNode(triggerNode, flow.nodes, flow.edges, executionContext, results);
    return results;
  }

  /**
   * Um fluxo pode ter vários gatilhos, cada um entrando num ponto diferente do grafo. Começa pelo
   * pedido (`entryNodeId`, escolhido por quem casou o evento com o gatilho); sem ele, pelo
   * primeiro gatilho — o comportamento de quando só existia um. Um `entryNodeId` que não é
   * gatilho deste fluxo (removido depois de o evento chegar) não roda nada: cair em outro
   * gatilho executaria o caminho errado.
   */
  private resolveEntryNode(flow: FlowEntity, entryNodeId: string | undefined): FlowNode | undefined {
    if (entryNodeId) {
      return flow.nodes.find((n) => n.id === entryNodeId && isFlowTriggerNodeType(n.type));
    }
    return flow.nodes.find((n) => isFlowTriggerNodeType(n.type));
  }

  private async executeNode(
    node: FlowNode,
    nodes: FlowNode[],
    edges: FlowEdge[],
    context: FlowExecutionContext,
    results: NodeExecutionResult[],
    depth = 0,
  ): Promise<void> {
    if (depth > 50) {
      throw new Error('Limite de profundidade do fluxo excedido (50 níveis).');
    }

    const start = Date.now();

    try {
      let nextHandle = 'default';
      let output: unknown;

      if (isFlowTriggerNodeType(node.type)) {
        nextHandle = 'default';
      } else if (node.type === 'condition_always_true') {
        nextHandle = 'yes';
      } else if (node.type === 'condition_field_value') {
        const passes = this.evaluateCondition(node.data as ConditionFieldValueData, context);
        nextHandle = passes ? 'yes' : 'no';
      } else if (node.type === 'condition_solicitation_status') {
        const passes = this.evaluateSolicitationStatus(
          node.data as ConditionSolicitationStatusData,
          context,
        );
        nextHandle = passes ? 'yes' : 'no';
        output = this.testRunConditionWarning(node.type, context, passes);
      } else if (node.type === 'condition_solicitation_priority') {
        const passes = this.evaluateSolicitationPriority(
          node.data as ConditionSolicitationPriorityData,
          context,
        );
        nextHandle = passes ? 'yes' : 'no';
        output = this.testRunConditionWarning(node.type, context, passes);
      } else if (node.type === 'condition_response_value') {
        const passes = this.evaluateResponseValue(
          node.data as ConditionResponseValueData,
          context,
        );
        nextHandle = passes ? 'yes' : 'no';
        output = this.testRunConditionWarning(node.type, context, passes);
      } else if (node.type === 'condition_approval_result') {
        const passes = this.evaluateApprovalResult(
          node.data as ConditionApprovalResultData,
          context,
        );
        nextHandle = passes ? 'yes' : 'no';
        output = this.testRunConditionWarning(node.type, context, passes);
      } else if (node.type === 'action_send_email') {
        output = await this.executeSendEmail(node.data as ActionSendEmailData, context);
      } else if (node.type === 'action_webhook') {
        output = await this.executeWebhook(node.data as ActionWebhookData, context);
      } else if (node.type === 'action_http_check') {
        output = await this.executeHttpCheck(node.data as ActionHttpCheckData, context);
      } else if (node.type === 'action_notify_users') {
        output = await this.executeNotifyUsers(node.data as ActionNotifyUsersData, context);
      } else if (node.type === 'action_google_sheets') {
        output = await this.executeGoogleSheets(node.data as ActionGoogleSheetsData, context);
      } else if (
        node.type === 'action_update_solicitation_status' ||
        node.type === 'action_move_kanban_card'
      ) {
        output = await this.executeUpdateSolicitationStatus(
          node.data as ActionUpdateSolicitationStatusData | ActionMoveKanbanCardData,
          context,
        );
      } else if (node.type === 'action_create_approval') {
        output = await this.executeCreateApproval(node.data as ActionCreateApprovalData, context, node.id);
      } else if (node.type === 'action_create_solicitation_from_payload') {
        output = await this.executeCreateSolicitationFromPayload(
          node.data as ActionCreateSolicitationFromPayloadData,
          context,
        );
      } else if (node.type === 'action_forward_to_process') {
        output = await this.executeForwardToProcess(node.data as ActionForwardToProcessData, context);
      } else if (node.type === 'action_assign_responsible') {
        output = await this.executeAssignResponsible(
          node.data as ActionAssignResponsibleData,
          context,
        );
      } else if (node.type === 'action_send_whatsapp') {
        output = await this.executeSendWhatsApp(node.data as ActionSendWhatsAppData, context);
      } else if (node.type === 'action_erp_operation') {
        output = await this.executeErpOperation(node.data as ActionErpOperationData, context);
      } else if (node.type === 'action_ai_agent') {
        output = await this.executeAiAgent(node.data as ActionAiAgentData, context);
      } else if (node.type === 'action_wait_for_phase_fields') {
        output = this.executeWaitForPhaseFields(node.data as ActionWaitForPhaseFieldsData, context);
      } else if (node.type === 'action_move_phase') {
        output = await this.executeMovePhase(node.data as ActionMovePhaseData, context);
      } else if (node.type === 'action_run_flow') {
        output = await this.executeRunFlow(node.data as ActionRunFlowData, context);
      } else if (node.type === 'action_notification') {
        output = await this.notificationExecutor.execute(
          node.data as ActionNotificationData,
          context,
          node.id,
        );
      }

      const successResult: NodeExecutionResult = {
        nodeId: node.id,
        status: 'success',
        ...(output === undefined ? {} : { output }),
        durationMs: Date.now() - start,
      };
      results.push(successResult);
      this.metricsService.recordFlowNodeExecution(node.type, successResult.status);
      this.logger.log({
        flowId: context.flowId,
        executionId: context.flowExecutionId,
        nodeId: node.id,
        nodeType: node.type,
        status: 'success',
        durationMs: successResult.durationMs,
      }, 'Node executed');

      if (isPausedApprovalResult(successResult)) {
        this.logger.log({
          flowId: context.flowId,
          executionId: context.flowExecutionId,
          nodeId: node.id,
          approvalId: successResult.output.approvalId,
        }, 'Flow execution paused — waiting for approval decision');
        return;
      }

      if (isPausedPhaseFieldsResult(successResult)) {
        this.logger.log({
          flowId: context.flowId,
          executionId: context.flowExecutionId,
          nodeId: node.id,
          waitingPhaseId: successResult.output.waitingPhaseId,
        }, 'Flow execution paused — waiting for phase fields to be saved');
        return;
      }

      if (isPausedSubflowResult(successResult)) {
        this.logger.log({
          flowId: context.flowId,
          executionId: context.flowExecutionId,
          nodeId: node.id,
          childExecutionId: successResult.output.waitingSubflowExecutionId,
        }, 'Flow execution paused — waiting for sub-flow to finish');
        return;
      }

      if (isDryRunPauseResult(successResult)) return;
      if (isStoppedBranchResult(successResult)) return;

      await this.traverseChildren(node.id, nextHandle, nodes, edges, context, results, depth);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const failResult: NodeExecutionResult = {
        nodeId: node.id,
        status: 'failed',
        error,
        // Falhas que sabem explicar o que já aconteceu (ex.: id da notificação) guardam o output.
        ...(err instanceof NodeFailureError && err.output !== undefined ? { output: err.output } : {}),
        durationMs: Date.now() - start,
      };
      results.push(failResult);
      this.metricsService.recordFlowNodeExecution(node.type, failResult.status);
      this.logger.warn({
        flowId: context.flowId,
        executionId: context.flowExecutionId,
        nodeId: node.id,
        nodeType: node.type,
        status: 'failed',
        durationMs: failResult.durationMs,
        error,
      }, 'Node failed');

      // Por padrão uma falha encerra aquele ramo. Nós que declaram `continueOnFailure` (hoje só a
      // notificação) seguem para os filhos mesmo assim — a falha continua registrada acima.
      if (this.continuesAfterFailure(node)) {
        this.logger.log({
          flowId: context.flowId,
          executionId: context.flowExecutionId,
          nodeId: node.id,
          nodeType: node.type,
        }, 'Node failed — continuing (continueOnFailure)');
        await this.traverseChildren(node.id, 'default', nodes, edges, context, results, depth);
      }
    }
  }

  /** Tipos de nó que aceitam `data.continueOnFailure`. Lista explícita: não vale para nós antigos. */
  private continuesAfterFailure(node: FlowNode): boolean {
    return (
      node.type === 'action_notification' &&
      (node.data as { continueOnFailure?: unknown }).continueOnFailure === true
    );
  }

  private async traverseChildren(
    fromNodeId: string,
    handle: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    context: FlowExecutionContext,
    results: NodeExecutionResult[],
    depth: number,
  ): Promise<void> {
    const nextEdges = edges.filter(
      (e) =>
        e.source === fromNodeId &&
        (e.sourceHandle === handle || !e.sourceHandle || handle === 'default'),
    );

    for (const edge of nextEdges) {
      const nextNode = nodes.find((n) => n.id === edge.target);
      if (nextNode) {
        await this.executeNode(nextNode, nodes, edges, context, results, depth + 1);
      }
    }
  }

  /**
   * Retoma uma execução parada em action_create_approval (ver isPausedApprovalResult), agora
   * que a aprovação foi decidida — continua direto para os filhos do nó pausado, sem
   * re-executar a criação da aprovação. `context` deve trazer `ctx.solicitation`/`ctx.approval`
   * já recarregados do banco (reflete o status final), tipicamente montados por
   * FlowsService.buildContextFromJob a partir do approvalId.
   */
  async resumeFrom(
    flow: FlowEntity,
    fromNodeId: string,
    context: FlowExecutionContext,
  ): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = [];
    const executionContext = this.buildContext(context);
    executionContext.fieldLabels = (await this.fieldLabels?.labelsFor(executionContext)) ?? {};
    executionContext.resumedFromApprovalId = context.approval?.id;
    await this.traverseChildren(fromNodeId, 'default', flow.nodes, flow.edges, executionContext, results, 0);
    return results;
  }

  private buildContext(context: FlowExecutionContext): FlowExecutionContext {
    const fields = context.submission
      ? buildFlowFieldValues(context.submission.items, context.fields ?? {})
      : { ...(context.fields ?? {}) };

    return {
      ...context,
      fields,
    };
  }

  private evaluateCondition(data: ConditionFieldValueData, ctx: FlowExecutionContext): boolean {
    const raw = ctx.fields?.[data.fieldCode];
    return this.compareValues(data.operator, raw, data.value);
  }

  private evaluateResponseValue(
    data: ConditionResponseValueData,
    ctx: FlowExecutionContext,
  ): boolean {
    const lastCheck = ctx.metadata?.lastCheckResponse as { body?: unknown } | undefined;
    const raw = resolvePath(lastCheck?.body, data.path);
    return this.compareValues(data.operator, raw, data.value);
  }

  /** Switch de operadores compartilhado por condition_field_value e condition_response_value. */
  private compareValues(
    operator: ConditionFieldValueData['operator'],
    raw: unknown,
    compareValue: string | undefined,
  ): boolean {
    const value = raw == null ? '' : String(raw);
    const compare = compareValue ?? '';
    switch (operator) {
      case 'equals':
        return value === compare;
      case 'not_equals':
        return value !== compare;
      case 'contains':
        return value.includes(compare);
      case 'greater_than':
      case 'less_than': {
        // Mesmo leitor das fórmulas: "18.500,00", "18500.00", "0,5" e 18500.5 viram número;
        // o separador decimal é o último que aparece. Texto não numérico nunca compara.
        const numVal = coerceAnswerToNumber(value);
        const numCmp = coerceAnswerToNumber(compare);
        if (numVal === null || numCmp === null) return false;
        return operator === 'greater_than' ? numVal > numCmp : numVal < numCmp;
      }
      case 'is_empty':
        return !value;
      case 'is_not_empty':
        return Boolean(value);
      default:
        return false;
    }
  }

  private evaluateSolicitationStatus(
    data: ConditionSolicitationStatusData,
    ctx: FlowExecutionContext,
  ): boolean {
    const current = ctx.solicitation?.status;
    if (!current) return false;
    return data.operator === 'equals' ? current === data.value : current !== data.value;
  }

  private evaluateSolicitationPriority(
    data: ConditionSolicitationPriorityData,
    ctx: FlowExecutionContext,
  ): boolean {
    const current = ctx.solicitation?.priority;
    if (!current) return false;

    if (data.operator === 'equals') return current === data.value;
    if (data.operator === 'not_equals') return current !== data.value;

    const currentRank = this.getPriorityRank(current);
    const expectedRank = this.getPriorityRank(data.value);
    return data.operator === 'greater_than'
      ? currentRank > expectedRank
      : currentRank < expectedRank;
  }

  private evaluateApprovalResult(
    data: ConditionApprovalResultData,
    ctx: FlowExecutionContext,
  ): boolean {
    const current = ctx.approval?.status;
    if (!current) return false;
    return data.operator === 'equals' ? current === data.value : current !== data.value;
  }

  private interpolate(template: string, ctx: FlowExecutionContext): string {
    const solicitation = ctx.solicitation;
    const requester =
      solicitation?.submission?.responderName ??
      solicitation?.submission?.responderEmail ??
      solicitation?.createdByUser?.fullName ??
      null;
    const requesterEmail =
      solicitation?.submission?.responderEmail ?? solicitation?.createdByUser?.email ?? null;

    const trackingUrl = solicitation?.trackingToken
      ? `${this.configService.get<string>('FRONTEND_URL', '')}/acompanhar/${solicitation.trackingToken}`
      : '';

    return template
      .replace(/\{\{responder_name\}\}/g, ctx.submission?.responderName ?? '')
      .replace(/\{\{responder_email\}\}/g, ctx.submission?.responderEmail ?? '')
      .replace(/\{\{form_name\}\}/g, ctx.form?.name ?? '')
      .replace(/\{\{submitted_at\}\}/g, ctx.submission?.submittedAt?.toLocaleString('pt-BR') ?? '')
      .replace(/\{\{solicitation_number\}\}/g, solicitation?.id ?? '')
      .replace(/\{\{solicitation_title\}\}/g, solicitation?.title ?? '')
      .replace(/\{\{solicitation_status\}\}/g, solicitation?.status ?? '')
      .replace(/\{\{solicitation_priority\}\}/g, solicitation?.priority ?? '')
      .replace(/\{\{solicitation_requester_name\}\}/g, requester ?? '')
      .replace(/\{\{solicitation_requester_email\}\}/g, requesterEmail ?? '')
      .replace(/\{\{solicitation_responsible_name\}\}/g, solicitation?.assignee?.fullName ?? '')
      .replace(/\{\{tracking_url\}\}/g, trackingUrl)
      // Escolha sai pelo rótulo; `{{campo_valor}}` dá o valor interno (ver flow-field-labels.ts).
      .replace(/\{\{(\w+)\}\}/g, (_, code: string) => String(fieldTemplateValue(ctx, code) ?? ''));
  }

  private async executeSendEmail(
    data: ActionSendEmailData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    // Frontend saves recipients as a comma-separated string in `toEmail`;
    // fall back to the `to` array for programmatic / direct-API usage.
    const rawTo = data.toEmail ?? '';
    const toList: string[] = data.to?.length
      ? data.to
      : rawTo
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    const subject = this.interpolate(data.subject ?? '', ctx);
    const body = this.interpolate(data.body ?? '', ctx);
    const to = toList.map((t) => this.interpolate(t, ctx));

    if (this.isTestRun(ctx)) {
      if (to.length === 0) throw new Error('action_send_email requer ao menos um destinatário.');
      return dryRunOutput(`Enviaria e-mail para ${to.join(', ')}.`, {
        to,
        subject,
        preview: previewText(body),
      });
    }

    this.logger.log({
      executionId: ctx.flowExecutionId,
      nodeType: 'action_send_email',
      recipientCount: to.length,
    }, 'Sending email');
    await this.mailer.send(to, subject, body);
  }

  private async executeWebhook(
    data: ActionWebhookData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    // Frontend saves the URL in `webhookUrl`; direct API uses `url`.
    const url = String(data.url ?? data.webhookUrl ?? '');
    const method = data.method ?? 'POST';

    // Frontend stores headers as KvPair[]; convert to Record for outbound delivery.
    let headersRecord: Record<string, string> = {};
    if (Array.isArray(data.headers)) {
      for (const pair of data.headers as Array<{ key: string; value: string }>) {
        if (pair.key) headersRecord[pair.key] = pair.value;
      }
    } else if (data.headers && typeof data.headers === 'object') {
      headersRecord = data.headers as Record<string, string>;
    }

    const body = data.bodyTemplate
      ? this.interpolate(data.bodyTemplate, ctx)
      : JSON.stringify({
          eventName: ctx.eventName,
          form: ctx.form ? { id: ctx.form.id, name: ctx.form.name } : null,
          submission: ctx.submission
            ? { id: ctx.submission.id, submittedAt: ctx.submission.submittedAt }
            : null,
          solicitation: ctx.solicitation
            ? { id: ctx.solicitation.id, title: ctx.solicitation.title }
            : null,
          approval: ctx.approval ? { id: ctx.approval.id, title: ctx.approval.title } : null,
          fields: ctx.fields ?? {},
          metadata: ctx.metadata ?? {},
        });

    if (this.isTestRun(ctx)) {
      if (!url) throw new Error('action_webhook requer uma URL.');
      // Cabeçalhos e segredo de assinatura ficam de fora: são credenciais.
      return dryRunOutput(`Chamaria ${method} ${url}.`, {
        method,
        url,
        ...(method === 'GET' ? {} : { bodyPreview: previewText(body) }),
      });
    }

    const delivery = await this.outboundWebhookService.send({
      url,
      method,
      headers: { 'Content-Type': 'application/json', ...headersRecord },
      body: method === 'GET' ? null : body,
      signingSecret: data.signingSecret?.trim() ? data.signingSecret : undefined,
      maxAttempts: data.maxAttempts,
      timeoutMs: data.timeoutMs,
      flowExecutionId: ctx.flowExecutionId ?? null,
    });

    if (delivery.status !== WebhookDeliveryStatus.SUCCESS) {
      throw new Error(delivery.errorMessage ?? `Webhook ${delivery.status}`);
    }

    return {
      deliveryId: delivery.id,
      status: delivery.status,
      responseStatus: delivery.responseStatus,
      attemptCount: delivery.attemptCount,
    };
  }

  /**
   * Chamada HTTP genérica que captura a resposta em ctx.metadata.lastCheckResponse para os
   * nós seguintes (ex: condition_response_value) usarem — diferente de action_webhook, que é
   * fire-and-forget e nunca expõe o corpo da resposta ao resto do fluxo.
   */
  private async executeHttpCheck(
    data: ActionHttpCheckData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    const url = this.interpolate(data.url ?? '', ctx);
    if (!url) {
      throw new Error('action_http_check requer uma URL.');
    }
    const method = data.method ?? 'GET';

    let headersRecord: Record<string, string> = {};
    if (Array.isArray(data.headers)) {
      for (const pair of data.headers as Array<{ key: string; value: string }>) {
        if (pair.key) headersRecord[pair.key] = pair.value;
      }
    } else if (data.headers && typeof data.headers === 'object') {
      headersRecord = data.headers as Record<string, string>;
    }

    const body = data.bodyTemplate ? this.interpolate(data.bodyTemplate, ctx) : undefined;

    if (this.isTestRun(ctx)) {
      // Nem um GET sai no teste: não dá para saber se a API do outro lado só lê.
      this.assumeInTestRun(ctx, 'response');
      return dryRunOutput(`Chamaria ${method} ${url}. No teste não há resposta.`, { method, url });
    }

    const response = await axios.request({
      url,
      method,
      headers: headersRecord,
      data: method !== 'GET' ? body : undefined,
      timeout: data.timeoutMs ?? 15000,
      responseType: 'text',
      transformResponse: [(raw: unknown) => raw],
      validateStatus: () => true,
    });

    let parsedBody: unknown = response.data;
    if (typeof response.data === 'string' && response.data.trim()) {
      try {
        parsedBody = JSON.parse(response.data);
      } catch {
        // Mantém como string crua se não for JSON válido.
      }
    }

    ctx.metadata = {
      ...(ctx.metadata ?? {}),
      lastCheckResponse: { status: response.status, body: parsedBody },
    };

    if (response.status >= 400) {
      throw new Error(`action_http_check: resposta ${response.status}`);
    }

    return { status: response.status };
  }

  private async executeGoogleSheets(
    data: ActionGoogleSheetsData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    if (!data.spreadsheetId) {
      throw new Error('action_google_sheets: spreadsheetId é obrigatório.');
    }

    // Prioridade: usuário Google vinculado explicitamente ao formulário,
    // em seguida o criador do formulário, por fim o ator do evento.
    const form = ctx.form;
    const candidateIds = [
      form?.googleLinkedUserId,
      form?.createdBy,
      ctx.actorId,
    ].filter((id): id is string => Boolean(id));

    let userId: string | null = null;
    for (const id of candidateIds) {
      const connected = await this.googleWorkspace.isUserGoogleConnectedById(id);
      if (connected) {
        userId = id;
        break;
      }
    }

    if (!userId) {
      throw new Error(
        'Google Sheets não configurado para este usuário. Conecte sua conta Google nas configurações.',
      );
    }

    const fieldValues = Object.entries(ctx.fields ?? {}).map(([code, value]) => ({
      fieldCode: code,
      value: value != null ? String(value) : '',
    }));

    const sheetName = data.sheetName ?? 'Respostas';
    if (this.isTestRun(ctx)) {
      return dryRunOutput(`Adicionaria uma linha na aba "${sheetName}" da planilha.`, {
        spreadsheetId: data.spreadsheetId,
        sheetName,
        values: fieldValues,
      });
    }

    await this.googleWorkspace.appendRowToSpreadsheet(
      userId,
      data.spreadsheetId,
      sheetName,
      fieldValues,
    );
  }

  private async executeNotifyUsers(
    data: ActionNotifyUsersData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    const message = this.interpolate(data.message ?? '', ctx);
    if (!data.userIds?.length || !message.trim()) {
      throw new Error('Notificação requer usuários e mensagem.');
    }
    if (this.isTestRun(ctx)) {
      return dryRunOutput(`Notificaria ${data.userIds.length} usuário(s) no sistema.`, {
        userIds: data.userIds,
        message,
      });
    }
    await Promise.all(
      data.userIds.map((userId) =>
        this.notificationsRepo.save(this.notificationsRepo.create({ userId, message })),
      ),
    );
  }

  private async executeUpdateSolicitationStatus(
    data: ActionUpdateSolicitationStatusData | ActionMoveKanbanCardData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    const solicitation = this.requireSolicitationUnlessAssumed(ctx);
    this.assertFlowEventDepthAllowsMutation(ctx);

    if (this.isTestRun(ctx) || !solicitation) {
      const changes = [
        data.status ? `o status para "${data.status}"` : null,
        data.currentStage ? `a etapa para "${data.currentStage}"` : null,
      ].filter(Boolean);
      return dryRunOutput(
        changes.length
          ? `Mudaria ${changes.join(' e ')} da solicitação.`
          : 'Moveria o card da solicitação.',
        { status: data.status, currentStage: data.currentStage },
      );
    }

    const updated = await this.solicitationsService.moveCard(
      solicitation.id,
      { status: data.status, currentStage: data.currentStage },
      this.buildAutomationActor(ctx),
      { flowEventDepth: this.nextFlowEventDepth(ctx) },
    );
    ctx.solicitation = updated;
  }

  private async executeMovePhase(
    data: ActionMovePhaseData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    const solicitation = this.requireSolicitationUnlessAssumed(ctx);
    this.assertFlowEventDepthAllowsMutation(ctx);
    if (!data.phaseId?.trim()) {
      throw new Error('action_move_phase requer phaseId.');
    }

    if (this.isTestRun(ctx) || !solicitation) {
      // O teste também passa a fase adiante (só leitura): sem isso, uma aprovação de fase logo
      // depois falharia no teste e não na execução real.
      await this.enterPhaseContext(data.phaseId, ctx);
      return dryRunOutput(
        `Moveria a solicitação para a fase "${(data.phaseLabel ?? '').trim() || data.phaseId}".`,
        { phaseId: data.phaseId },
      );
    }

    const updated = await this.solicitationsService.movePhase(
      solicitation.id,
      { phaseId: data.phaseId },
      this.buildAutomationActor(ctx),
      // Movimento do processo: depois de uma aprovação de fase reprovada, o ramo "Não" do fluxo
      // pode levar o card adiante (ex.: para Cancelado); a pessoa, não.
      { flowEventDepth: this.nextFlowEventDepth(ctx), byAutomation: true },
    );
    ctx.solicitation = updated;

    const phase = await this.enterPhaseContext(data.phaseId, ctx);
    return { phaseId: data.phaseId, phaseLabel: phase?.label ?? data.phaseLabel ?? null };
  }

  /**
   * Daqui em diante o fluxo "está" na fase de destino: uma aprovação de fase (scope phase,
   * modo "aprovador da fase") logo depois vai para quem aprova ESTA fase — é o que permite
   * encadear "Mover para fase → Criar aprovação" num fluxo que não começou num gatilho de fase.
   */
  private async enterPhaseContext(
    phaseId: string,
    ctx: FlowExecutionContext,
  ): Promise<{ label: string } | null> {
    const phase = await this.solicitationsService.findKanbanPhase(phaseId);
    if (phase) {
      ctx.metadata = {
        ...(ctx.metadata ?? {}),
        phaseId: phase.id,
        phaseLabel: phase.label,
        ...phaseApproverMetadata(phase),
      };
    }
    return phase;
  }

  /** Devolve o marcador de pausa (ver isPausedApprovalResult) quando a aprovação ainda espera decisão. */
  private async executeCreateApproval(
    data: ActionCreateApprovalData,
    ctx: FlowExecutionContext,
    nodeId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const solicitation = this.requireSolicitationUnlessAssumed(ctx);
    const isPhaseScoped = data.scope === 'phase';
    const phaseId = isPhaseScoped ? this.requirePhaseId(ctx) : undefined;

    // createFromFlowPayload's idempotency key can return a pre-existing solicitation (e.g. a
    // reconciliation replay re-processing an item already created by the original webhook, or a
    // retry). Without this guard, every replay would still reach this node and pile up a new,
    // duplicate approval on the same solicitation. Fetching the row (not just checking
    // existence) also lets the caller re-pause on it if it's still pending — a replay must not
    // skip past the wait point and run the rest of the flow on stale data. Phase-scoped
    // approvals are checked per-phase — a completed phase-1 approval must never block phase 3's.
    // (No teste a fase pode faltar; sem ela a busca pegaria a aprovação de qualquer fase.)
    // A busca é pelo título deste nó: num fluxo com várias alçadas, a aprovação de uma alçada não
    // pode passar por "já criada" na seguinte. E a aprovação que acabou de liberar a retomada nunca
    // é a deste nó — é a do nó anterior.
    const title = this.interpolate(data.title, ctx);
    if (solicitation && (!isPhaseScoped || phaseId)) {
      const existingApproval = await this.approvalsRepo.findOne({
        where: isPhaseScoped
          ? { solicitationId: solicitation.id, phaseId, title }
          : { solicitationId: solicitation.id, title },
      });
      if (existingApproval && existingApproval.id !== ctx.resumedFromApprovalId) {
        this.logger.log(
          `action_create_approval: solicitação ${solicitation.id}${isPhaseScoped ? ` (fase ${phaseId})` : ''} já possui aprovação — pulando criação (provável replay/idempotência).`,
        );
        ctx.approval = existingApproval;
        return this.approvalPauseOutput(existingApproval);
      }
    }

    const { assignedUserIds, assignedRoleCodes, assignedEmails } = await this.resolveApprovers(data, ctx);

    if (this.isTestRun(ctx) || !solicitation) {
      const approverCount = (assignedUserIds?.length ?? 0) + (assignedEmails?.length ?? 0);
      const approvers = approverCount
        ? `${approverCount} aprovador(es)${assignedEmails?.length ? ' (e-mail sem usuário no sistema decide por link enviado por e-mail)' : ''}`
        : assignedRoleCodes?.length
          ? `o perfil "${assignedRoleCodes.join(', ')}"`
          : data.approverSourceMode === 'dynamic'
            ? 'os aprovadores do payload, que vem do evento real'
            : 'o perfil aprovador da fase, que vem do evento real';
      return dryRunOutput(
        `Criaria a aprovação "${title}" para ${approvers}${isApprovalEmailEnabled(data) ? ' e avisaria quem aprova por e-mail' : ''}. O fluxo pausaria aqui até a decisão.`,
        { paused: true, title, assignedUserIds, assignedRoleCodes, assignedEmailCount: assignedEmails?.length, phaseId },
      );
    }

    const approval = await this.approvalsService.createApproval(
      solicitation.id,
      {
        title,
        description: data.description ? this.interpolate(data.description, ctx) : undefined,
        assignedUserIds,
        assignedRoleCodes,
        assignedEmails,
        phaseId,
        ...this.approvalRuleFor(data, ctx),
      },
      this.buildAutomationActor(ctx),
    );
    ctx.approval = approval;
    const emailed = await this.emailApprovers(data, approval, ctx, nodeId);
    const paused = this.approvalPauseOutput(approval);
    return paused && emailed !== null ? { ...paused, approverEmailsQueued: emailed } : paused;
  }

  /**
   * "Avisar quem aprova por e-mail": enfileira um e-mail para cada aprovador com usuário. Nunca
   * derruba o nó — a aprovação já existe e o fluxo precisa pausar nela; falha fica registrada nas
   * notificações do fluxo. Devolve quantos foram avisados (null = desligado).
   */
  private async emailApprovers(
    data: ActionCreateApprovalData,
    approval: ApprovalEntity,
    ctx: FlowExecutionContext,
    nodeId: string,
  ): Promise<number | null> {
    if (!isApprovalEmailEnabled(data) || approval.status !== ApprovalStatus.PENDING) return null;
    try {
      const userIds = await this.approvalsService.pendingApproverUserIds(approval.id);
      if (userIds.length === 0) return 0;
      await this.notificationExecutor.execute(
        approvalEmailNotification(data, approval.id, userIds),
        ctx,
        `${nodeId}:email`,
      );
      return userIds.length;
    } catch (error) {
      this.logger.warn(
        { executionId: ctx.flowExecutionId, nodeId, approvalId: approval.id, error: error instanceof Error ? error.message : String(error) },
        'Aviso por e-mail da aprovação falhou',
      );
      return 0;
    }
  }

  private approvalPauseOutput(approval: ApprovalEntity): Record<string, unknown> | undefined {
    return approval.status === ApprovalStatus.PENDING
      ? { paused: true, approvalId: approval.id }
      : undefined;
  }

  /** No teste, sem a fase que o evento traria, devolve undefined em vez de falhar. */
  private requirePhaseId(ctx: FlowExecutionContext): string | undefined {
    const phaseId = ctx.metadata?.phaseId;
    if (typeof phaseId !== 'string' || !phaseId) {
      if (this.isAssumedInTestRun(ctx, 'phase')) return undefined;
      throw new Error(
        'action_create_approval (scope: phase) requer uma fase no contexto — use um gatilho de fase ("Anexo enviado", "Campos de fase salvos") ou um "Mover para fase" antes deste nó.',
      );
    }
    return phaseId;
  }

  /**
   * `phaseId` é sempre explícito no próprio nó — ao contrário de action_create_approval
   * (scope: phase), não dá pra inferir de ctx.metadata.phaseId aqui, porque neste ponto do
   * fluxo (normalmente depois de retomar de uma aprovação anterior) o metadata ainda reflete
   * a fase do gatilho ORIGINAL, não a fase que este nó precisa esperar.
   */
  private executeWaitForPhaseFields(
    data: ActionWaitForPhaseFieldsData,
    ctx: FlowExecutionContext,
  ): { paused: true; waitingPhaseId: string } {
    if (!data.phaseId?.trim()) {
      throw new Error('action_wait_for_phase_fields requer phaseId.');
    }
    const paused = { paused: true as const, waitingPhaseId: data.phaseId };
    return this.isTestRun(ctx)
      ? {
          ...dryRunOutput(
            `O fluxo pausaria aqui até os campos da fase "${(data.phaseLabel ?? '').trim() || data.phaseId}" serem salvos.`,
          ),
          ...paused,
        }
      : paused;
  }

  /**
   * Regra da aprovação criada pelo nó. No modo "aprovador da fase" vale a regra da fase (vinda do
   * gatilho em ctx.metadata.approvalMode/approverOrder); nos outros, a do próprio nó. Ausente =
   * basta um aprovar, como sempre foi.
   */
  private approvalRuleFor(
    data: ActionCreateApprovalData,
    ctx: FlowExecutionContext,
  ): { mode?: 'parallel' | 'sequential'; requireAll?: boolean; assigneeOrder?: string[] } {
    const fromPhase = data.approverSourceMode === 'phase_role';
    const raw = fromPhase
      ? ctx.metadata?.approvalMode
      : (data.approvalRule ?? (data.approvalMode === 'sequential' ? 'sequential' : undefined));
    const rule = raw === 'all' || raw === 'sequential' ? raw : 'any';
    if (rule === 'any') return {};
    const order = fromPhase && Array.isArray(ctx.metadata?.approverOrder)
      ? (ctx.metadata.approverOrder as unknown[]).filter((key): key is string => typeof key === 'string')
      : [];
    return {
      mode: rule === 'sequential' ? 'sequential' : 'parallel',
      requireAll: true,
      ...(rule === 'sequential' && order.length ? { assigneeOrder: order } : {}),
    };
  }

  private async resolveApprovers(
    data: ActionCreateApprovalData,
    ctx: FlowExecutionContext,
  ): Promise<{ assignedUserIds?: string[]; assignedRoleCodes?: string[]; assignedEmails?: string[] }> {
    if (data.approverSourceMode === 'phase_role') {
      // Quem aprova a fase: perfis e/ou usuários (metadata.approverRoleCodes/approverUserIds,
      // resolvidos pelo gatilho). Execuções antigas só trazem approverRoleCode.
      const strings = (raw: unknown): string[] =>
        Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
      const legacyRole = ctx.metadata?.approverRoleCode;
      const roleCodes = strings(ctx.metadata?.approverRoleCodes);
      if (!roleCodes.length && typeof legacyRole === 'string' && legacyRole) roleCodes.push(legacyRole);
      const userIds = strings(ctx.metadata?.approverUserIds);
      if (!roleCodes.length && !userIds.length) {
        if (this.isAssumedInTestRun(ctx, 'phase')) return {};
        throw new Error(
          'action_create_approval (modo aprovador da fase) requer uma fase com quem aprova configurado (perfil ou usuário) — use um gatilho de fase ("Anexo enviado" ou "Campos de fase salvos").',
        );
      }
      return {
        ...(roleCodes.length ? { assignedRoleCodes: roleCodes } : {}),
        ...(userIds.length ? { assignedUserIds: userIds } : {}),
      };
    }

    if (data.approverSourceMode === 'field') {
      const fieldCode = data.approverFieldCode?.trim();
      if (!fieldCode) {
        throw new Error('action_create_approval (modo campo do formulário) requer approverFieldCode.');
      }
      const emails = toEmailList(ctx.fields?.[fieldCode]);
      if (!emails.length) {
        const message = `action_create_approval: o campo "${fieldCode}" do formulário não trouxe e-mail de aprovador.`;
        await this.notifyFlowManagersOfApprovalFailure(message, ctx);
        throw new Error(message);
      }
      // Com aprovador externo liberado, o ApprovalsService decide por e-mail: usuário ativo decide
      // logado, os demais recebem o link pessoal.
      if (data.allowExternalApprovers === true) return { assignedEmails: emails };
      return this.resolveApproverEmails(emails, ctx);
    }

    if (data.approverSourceMode !== 'dynamic') {
      // Lista fixa: pessoas, perfis (basta uma pessoa do perfil) e/ou e-mails.
      if (!data.assignedUserIds?.length && !data.approverRoleCodes?.length && !data.approverEmails?.length) {
        throw new Error('action_create_approval requer assignedUserIds, approverRoleCodes ou approverEmails.');
      }
      return {
        ...(data.assignedUserIds?.length ? { assignedUserIds: data.assignedUserIds } : {}),
        ...(data.approverRoleCodes?.length ? { assignedRoleCodes: data.approverRoleCodes } : {}),
        ...(data.approverEmails?.length ? { assignedEmails: data.approverEmails } : {}),
      };
    }

    if (!data.approversPath?.trim()) {
      throw new Error('action_create_approval (modo dinâmico) requer approversPath.');
    }
    if (ctx.metadata?.payload === undefined && this.isAssumedInTestRun(ctx, 'payload')) return {};
    const payload = (ctx.metadata?.payload ?? {}) as Record<string, unknown>;
    const emails = resolveEmailList(payload, data.approversPath);
    if (!emails.length) {
      const message = `action_create_approval: nenhum e-mail de aprovador resolvido em "${data.approversPath}".`;
      await this.notifyFlowManagersOfApprovalFailure(message, ctx);
      throw new Error(message);
    }
    if (data.allowExternalApprovers === true) return { assignedEmails: emails };
    return this.resolveApproverEmails(emails, ctx);
  }

  /** Todo e-mail precisa ser de um usuário ativo — senão a aprovação ficaria sem quem decidir. */
  private async resolveApproverEmails(
    emails: string[],
    ctx: FlowExecutionContext,
  ): Promise<{ assignedUserIds: string[] }> {
    const resolvedIds: string[] = [];
    const unresolved: string[] = [];
    for (const email of emails) {
      const user = await this.usersService.findActiveByEmail(email);
      if (user) resolvedIds.push(user.id);
      else unresolved.push(email);
    }

    if (unresolved.length > 0) {
      const message = `action_create_approval: e-mail(s) de aprovador não encontrados ou inativos: ${unresolved.join(', ')}`;
      await this.notifyFlowManagersOfApprovalFailure(message, ctx);
      throw new Error(message);
    }
    return { assignedUserIds: [...new Set(resolvedIds)] };
  }

  /**
   * Sem isso, uma solicitação criada via webhook (ex: pedido do Protheus) fica presa
   * silenciosamente quando o(s) aprovador(es) do payload não existem/estão inativos no
   * sistema — ninguém é avisado, e o fluxo só registra falha no log de execuções.
   */
  private async notifyFlowManagersOfApprovalFailure(
    reason: string,
    ctx: FlowExecutionContext,
  ): Promise<void> {
    // No teste a falha aparece no resultado do nó; avisar os gestores seria um efeito real.
    if (this.isTestRun(ctx)) return;
    try {
      const managers = await this.usersService.findAssignable('flows.manage');
      if (!managers.length) return;

      const solicitationRef = ctx.solicitation
        ? `${ctx.solicitation.title} (${ctx.solicitation.id})`
        : 'solicitação sem referência';
      const message = `Falha ao criar aprovação para ${solicitationRef}: ${reason}`;

      await Promise.all(
        managers.map((manager) =>
          this.notificationsRepo.save(
            this.notificationsRepo.create({ userId: manager.id, message }),
          ),
        ),
      );
    } catch (err) {
      this.logger.warn(
        `Falha ao notificar responsáveis sobre erro de aprovação: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async executeCreateSolicitationFromPayload(
    data: ActionCreateSolicitationFromPayloadData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    const payload = (ctx.metadata?.payload ?? {}) as Record<string, unknown>;

    // Template vence dot-path: gatilhos sem payload (movimentação, agendamento) só
    // conseguem montar o título por template.
    let title = data.titleTemplate?.trim()
      ? this.interpolate(data.titleTemplate, ctx).trim()
      : String(resolvePath(payload, data.titlePath ?? '') ?? '').trim();
    if (
      !title &&
      !data.titleTemplate?.trim() &&
      ctx.metadata?.payload === undefined &&
      this.isAssumedInTestRun(ctx, 'payload')
    ) {
      title = `(título do payload em "${data.titlePath ?? ''}")`;
    }
    if (!title) {
      throw new Error(
        data.titleTemplate?.trim()
          ? 'action_create_solicitation_from_payload gerou um título vazio a partir do template.'
          : `action_create_solicitation_from_payload requer um título resolvível em "${data.titlePath ?? ''}".`,
      );
    }

    const description = data.descriptionTemplate?.trim()
      ? this.interpolate(data.descriptionTemplate, ctx).trim() || null
      : data.descriptionPath
        ? String(resolvePath(payload, data.descriptionPath) ?? '').trim() || null
        : null;

    const fieldValues = this.resolveCreatedSolicitationFieldValues(data, ctx);

    if (this.isTestRun(ctx)) {
      // Os nós seguintes agem sobre a solicitação que seria criada aqui.
      ctx.solicitation = undefined;
      ctx.fields = { ...(ctx.fields ?? {}), ...fieldValues };
      this.assumeInTestRun(ctx, 'solicitation');
      return dryRunOutput(`Criaria a solicitação "${title}".`, {
        title,
        description,
        priority: data.priority,
        ...(Object.keys(fieldValues).length > 0 ? { fieldValues } : {}),
      });
    }

    const metadata: Record<string, unknown> = {};
    for (const mapping of data.metadataFieldMappings ?? []) {
      metadata[mapping.target] = resolvePath(payload, mapping.path) ?? null;
    }
    if (Object.keys(fieldValues).length > 0) {
      metadata[SOLICITATION_FORM_FIELD_VALUES_KEY] = fieldValues;
    }

    const idempotencyKey = data.idempotencyKeyTemplate?.trim()
      ? this.interpolate(data.idempotencyKeyTemplate, ctx).trim() || null
      : data.idempotencyKeyPath
        ? String(resolvePath(payload, data.idempotencyKeyPath) ?? '').trim() || null
        : null;

    const { solicitation, reused } = await this.solicitationsService.createFromFlowPayload({
      title,
      description,
      metadata,
      priority: data.priority,
      idempotencyKey,
      formId: data.formId ?? (await this.resolveFlowFormId(ctx.flowId)),
      phaseId: data.phaseId?.trim() ? data.phaseId.trim() : null,
      dueAt: this.resolveCreatedSolicitationDueAt(data),
      slaWarningThresholdPercent: data.slaWarningThresholdPercent,
      flowEventDepth: this.nextFlowEventDepth(ctx),
    });

    ctx.solicitation = solicitation;
    // Reenvio com a mesma chave de idempotência devolve a solicitação já criada: valem as
    // respostas gravadas nela, não as deste evento.
    ctx.fields = { ...(ctx.fields ?? {}), ...readSolicitationFormFieldValues(solicitation.metadata) };

    if (reused && data.stopIfExisting) {
      // O resto do caminho já rodou para esta solicitação: repetir moveria o card de volta e
      // dispararia de novo e-mails e aprovações.
      return stoppedBranchOutput(`A solicitação "${solicitation.title}" já existia — caminho encerrado aqui.`, {
        solicitationId: solicitation.id,
      });
    }
    return reused ? { solicitationId: solicitation.id, reused: true } : { solicitationId: solicitation.id };
  }

  /**
   * Encaminhar para outro processo. O card atual continua sendo o do fluxo: os nós seguintes
   * (ex.: encerrar a origem) agem nele; o card criado no destino sai em `forwardedSolicitationId`.
   */
  private async executeForwardToProcess(
    data: ActionForwardToProcessData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    const solicitation = this.requireSolicitationUnlessAssumed(ctx);
    this.assertFlowEventDepthAllowsMutation(ctx);
    const formId = data.formId?.trim();
    if (!formId) throw new Error('action_forward_to_process requer o processo de destino.');

    const title = data.titleTemplate?.trim() ? this.interpolate(data.titleTemplate, ctx).trim() : '';
    const mappings = (data.fieldMappings ?? []).flatMap((mapping): HandoffMapping[] => {
      const targetFieldCode = mapping?.targetFieldCode?.trim();
      if (!targetFieldCode) return [];
      const sourceFieldCode = mapping.sourceFieldCode?.trim();
      if (sourceFieldCode) return [{ targetFieldCode, sourceFieldCode }];
      if (typeof mapping.value === 'string') {
        return [{ targetFieldCode, text: this.interpolate(mapping.value, ctx) }];
      }
      return [];
    });

    if (this.isTestRun(ctx) || !solicitation) {
      return dryRunOutput(
        `Encaminharia o card para outro processo${title ? ` como "${title}"` : ''}.`,
        {
          formId,
          ...(data.phaseId ? { phaseId: data.phaseId } : {}),
          mappedFields: mappings.length,
          autoMatchByCode: data.autoMatchByCode !== false,
          copyAttachments: data.copyAttachments !== false,
        },
      );
    }

    const result = await this.solicitationsService.createFromHandoff({
      sourceSolicitationId: solicitation.id,
      targetFormId: formId,
      targetPhaseId: data.phaseId?.trim() ? data.phaseId.trim() : null,
      title,
      mappings,
      autoMatchByCode: data.autoMatchByCode !== false,
      copyAttachments: data.copyAttachments !== false,
      flowEventDepth: this.nextFlowEventDepth(ctx),
    });

    if (result.reused) {
      const details = { forwardedSolicitationId: result.solicitation.id, reused: true };
      return data.stopIfExisting === false
        ? details
        : stoppedBranchOutput(
            `O card já tinha sido encaminhado para este processo ("${result.solicitation.title}") — caminho encerrado aqui.`,
            details,
          );
    }
    return {
      forwardedSolicitationId: result.solicitation.id,
      copiedFields: result.copiedFields,
      ...(result.skipped.length > 0 ? { skippedFields: result.skipped } : {}),
      ...(result.missingRequired.length > 0
        ? { missingRequiredFields: result.missingRequired.map((field) => field.label) }
        : {}),
      attachmentsCopied: result.attachmentsCopied,
      ...(result.attachmentsFailed.length > 0 ? { attachmentsFailed: result.attachmentsFailed } : {}),
    };
  }

  /**
   * Respostas do formulário da solicitação criada (`fieldValues` do nó), com as {{variáveis}}
   * resolvidas. Código repetido: vale o último. Valor vazio depois de resolver não é gravado —
   * seria uma resposta em branco que a ficha do ERP e as condições leriam como preenchida.
   */
  private resolveCreatedSolicitationFieldValues(
    data: ActionCreateSolicitationFromPayloadData,
    ctx: FlowExecutionContext,
  ): Record<string, string> {
    const values: Record<string, string> = {};
    for (const entry of data.fieldValues ?? []) {
      const code = entry?.fieldCode?.trim();
      if (!code || typeof entry.value !== 'string') continue;
      const value = this.interpolate(entry.value, ctx).trim();
      if (value) values[code] = value;
    }
    return values;
  }

  /**
   * Prazo da tarefa criada. Meses vão por aritmética de calendário (12 meses cai no
   * mesmo dia do ano seguinte, sem depender de 365 ou 366 dias); dias somam depois.
   * Dia inexistente no mês de destino transborda para o mês seguinte, como no
   * comportamento nativo de Date — 31/01 + 1 mês vira 02/03 ou 03/03.
   */
  private resolveCreatedSolicitationDueAt(
    data: ActionCreateSolicitationFromPayloadData,
  ): Date | null {
    const months = this.parseOptionalPositiveInteger(data.dueInMonths);
    const days = this.parseOptionalPositiveInteger(data.dueInDays);
    if (!months && !days) return null;

    const dueAt = new Date();
    if (months) dueAt.setMonth(dueAt.getMonth() + months);
    if (days) dueAt.setDate(dueAt.getDate() + days);
    return dueAt;
  }

  /**
   * Fallback pro formId do próprio Flow (coluna form_id, nunca tocada pelo autosave do editor —
   * ver useFlowEditor.save() no frontend) quando o nó não define um formId explícito. Sem isso,
   * o escopo de trigger_approval_completed (ver getEffectiveTriggerFormId em FlowsService)
   * depende inteiramente de data.formId no nó, que É reescrito a cada salvamento do canvas e
   * pode ser perdido se o editor não conhecer o campo.
   */
  private async resolveFlowFormId(flowId: string | undefined): Promise<string | null> {
    if (!flowId) return null;
    const flow = await this.flowsRepo.findOne({ where: { id: flowId }, select: { formId: true } });
    return flow?.formId ?? null;
  }

  private async executeAssignResponsible(
    data: ActionAssignResponsibleData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown> | undefined> {
    const solicitation = this.requireSolicitationUnlessAssumed(ctx);
    if (!data.userId?.trim()) {
      throw new Error('action_assign_responsible requer userId.');
    }

    if (this.isTestRun(ctx) || !solicitation) {
      return dryRunOutput('Mudaria o responsável da solicitação.', { userId: data.userId });
    }

    const updated = await this.solicitationsService.updateAssignee(
      solicitation.id,
      { assigneeId: data.userId },
      this.buildAutomationActor(ctx),
    );
    ctx.solicitation = updated;
  }

  private async executeSendWhatsApp(
    data: ActionSendWhatsAppData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    const solicitation = this.requireSolicitationUnlessAssumed(ctx);
    const message = this.interpolate(data.message ?? '', ctx);
    const customPhone =
      data.recipientType === 'custom' && data.customPhone
        ? this.interpolate(data.customPhone, ctx)
        : undefined;
    const approvalId = data.includeApprovalLink && ctx.approval ? ctx.approval.id : undefined;

    if (this.isTestRun(ctx) || !solicitation) {
      return dryRunOutput(
        customPhone ? `Enviaria WhatsApp para ${customPhone}.` : 'Enviaria WhatsApp sobre a solicitação.',
        { recipientType: data.recipientType, customPhone, preview: previewText(message) },
      );
    }

    const whatsappMessage = await this.whatsappConnectorService.sendToSolicitation(
      solicitation.id,
      message,
      {
        recipientType: data.recipientType,
        customPhone,
        approvalId,
        flowExecutionId: ctx.flowExecutionId ?? null,
      },
    );

    return {
      provider: 'whatsapp',
      whatsappMessageId: whatsappMessage.id,
      externalMessageId: whatsappMessage.externalMessageId,
      status: whatsappMessage.status,
      to: whatsappMessage.to,
    };
  }

  private async executeErpOperation(
    data: ActionErpOperationData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    if (!data.connectorId?.trim() || !data.templateId?.trim()) {
      throw new Error('action_erp_operation requer connectorId e templateId.');
    }
    this.requireSolicitationUnlessAssumed(ctx);

    if (this.isTestRun(ctx)) {
      return dryRunOutput('Executaria a operação no ERP.', {
        connectorId: data.connectorId,
        templateId: data.templateId,
      });
    }

    const log = await this.erpConnectorService.executeOperation(data.templateId, ctx);

    if (log.status !== 'success') {
      throw new Error(log.errorMessage ?? `ERP operation ${log.status}`);
    }

    return {
      logId: log.id,
      status: log.status,
      responseStatus: log.responseStatus,
      durationMs: log.durationMs,
    };
  }

  /**
   * Nó "LOPS IA": envia o anexo do contexto (ctx.attachment, fornecido pelo gatilho
   * trigger_attachment_uploaded) para `POST {LOPS_AI_BASE_URL}/agents/{agentSlug}/chat`
   * (multipart: image + message, autenticado por X-API-Key = a chave informada no próprio nó; a
   * URL vem do servidor, salvo um baseUrl próprio do nó) e grava a resposta em
   * ctx.metadata.lastCheckResponse — o MESMO formato que action_http_check usa — para um
   * condition_response_value logo depois decidir sobre ela sem qualquer mudança no motor.
   * Também persiste o veredito em attachment.validationResult/validatedAt, já que o anexo
   * validado é sempre conhecido aqui.
   */
  private async executeAiAgent(
    data: ActionAiAgentData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    if (!ctx.attachment && !this.isAssumedInTestRun(ctx, 'attachment')) {
      throw new Error(
        'action_ai_agent requer um anexo no contexto do fluxo (use o gatilho "Anexo enviado").',
      );
    }
    const agentSlug = (data.agentSlug ?? '').trim();
    if (!agentSlug) {
      throw new Error('action_ai_agent requer agentSlug (escolha o agente na lista do nó "LOPS IA").');
    }
    // A chave é SEMPRE a do nó. A LOPS_AI_API_KEY do servidor só serve para listar os agentes no
    // editor — nunca para executar um agente.
    const apiKey = (data.apiKey ?? '').trim();
    if (!apiKey) {
      throw new Error('action_ai_agent requer a chave de API (informe a chave no nó "LOPS IA").');
    }
    let endpoint: LopsAiEndpoint;
    try {
      endpoint = resolveLopsAiEndpoint(this.configService, data);
    } catch (error) {
      throw new Error(`action_ai_agent: ${(error as Error).message}`);
    }
    const trimmedMessage = data.message?.trim();
    const message = this.interpolate(
      trimmedMessage && trimmedMessage.length > 0 ? trimmedMessage : 'Analise essa imagem.',
      ctx,
    );

    if (this.isTestRun(ctx) || !ctx.attachment) {
      this.assumeInTestRun(ctx, 'response');
      return dryRunOutput(
        `Enviaria ${ctx.attachment ? `"${ctx.attachment.originalName}"` : 'a imagem enviada'} ao agente "${agentSlug}". No teste não há resposta.`,
        { agentSlug, message },
      );
    }

    const buffer = await this.storageService.readFile(ctx.attachment.storagePath);
    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(buffer)], { type: ctx.attachment.mimeType }),
      ctx.attachment.originalName,
    );
    form.append('message', message);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${endpoint.baseUrl}/agents/${encodeURIComponent(agentSlug)}/chat`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`action_ai_agent: falha ao chamar o agente (${(error as Error).message}).`);
    } finally {
      clearTimeout(timeout);
    }

    const rawBody = await response.text();
    let parsedBody: unknown = rawBody;
    if (rawBody.trim()) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // Mantém como string crua se não for JSON válido.
      }
    }
    const resultData =
      parsedBody && typeof parsedBody === 'object' && 'data' in parsedBody
        ? (parsedBody as { data: unknown }).data
        : parsedBody;

    ctx.metadata = {
      ...(ctx.metadata ?? {}),
      lastCheckResponse: { status: response.status, body: resultData },
    };

    if (
      resultData &&
      typeof resultData === 'object' &&
      !Array.isArray(resultData)
    ) {
      ctx.attachment.validationResult = resultData as Record<string, unknown>;
      ctx.attachment.validatedAt = new Date();
      ctx.attachment = await this.attachmentsRepo.save(ctx.attachment);
    }

    if (!response.ok) {
      throw new Error(`action_ai_agent: resposta ${response.status}`);
    }

    return { status: response.status };
  }

  // ── action_run_flow ────────────────────────────────────────────────────────────

  private async executeRunFlow(
    data: ActionRunFlowData,
    ctx: FlowExecutionContext,
  ): Promise<Record<string, unknown>> {
    if (!data.flowId?.trim()) {
      throw new Error('action_run_flow: flowId não configurado');
    }

    const callStack = ctx.callStack ?? [];

    if (callStack.includes(data.flowId)) {
      throw new Error(
        `Recursão detectada: fluxo ${data.flowId} já está na pilha de execução`,
      );
    }

    if (callStack.length >= MAX_SUBFLOW_DEPTH) {
      throw new Error(
        `Profundidade máxima de sub-fluxos atingida (${MAX_SUBFLOW_DEPTH} níveis)`,
      );
    }

    const childFlow = await this.flowsRepo.findOne({
      where: { id: data.flowId, isActive: true },
    });
    if (!childFlow) {
      throw new Error(`Fluxo filho não encontrado ou inativo: ${data.flowId}`);
    }

    if (this.isTestRun(ctx)) {
      // Rodar o filho criaria uma execução real no histórico dele.
      return dryRunOutput(
        `Executaria o fluxo "${childFlow.name}"${data.mode === 'async' ? ' sem esperar o fim' : ' e esperaria o fim'}.`,
        { flowId: childFlow.id, mode: data.mode ?? 'sync' },
      );
    }

    const parentFlowId = ctx.flowId;
    const parentExecutionId = ctx.flowExecutionId;
    const newCallStack = [...callStack, ...(parentFlowId ? [parentFlowId] : [])];

    const childCtx: FlowExecutionContext = data.passContext
      ? {
          ...ctx,
          callStack: newCallStack,
          flowId: data.flowId,
          flowExecutionId: undefined,
          // A entrada é um nó do pai; o filho começa pelo próprio primeiro gatilho.
          entryNodeId: undefined,
          parentFlowId,
          parentExecutionId,
        }
      : {
          callStack: newCallStack,
          flowId: data.flowId,
          parentFlowId,
          parentExecutionId,
          eventName: 'sub_flow_called',
        };

    const childExecution = await this.createChildExecution(childFlow, childCtx);
    childCtx.flowExecutionId = childExecution.id;

    if (data.mode === 'async') {
      // Fire-and-forget: não bloqueia o fluxo pai
      this.runChildFlow(childFlow, childCtx, childExecution.id).catch((err: Error) =>
        this.logger.warn(
          `Sub-fluxo async falhou: ${err.message}`,
          { context: FlowExecutionEngine.name, flowId: data.flowId },
        ),
      );
      return { childExecutionId: childExecution.id, mode: 'async' };
    }

    // Síncrono — aguarda e propaga falha para o nó pai. Um filho que pausou não falhou: fica
    // gravado esperando e é retomado sozinho depois; o pai pausa aqui até ele terminar
    // (ver isPausedSubflowResult).
    const result = await this.runChildFlow(childFlow, childCtx, childExecution.id);
    if (result.status === 'partial_failure' || result.status === 'failed') {
      throw new Error(`Sub-fluxo falhou com status: ${result.status}`);
    }
    if (result.status !== 'success') {
      return {
        paused: true,
        waitingSubflowExecutionId: childExecution.id,
        childStatus: result.status,
        mode: 'sync',
      };
    }
    return { childExecutionId: childExecution.id, childStatus: result.status, mode: 'sync' };
  }

  /**
   * Cria o registro de execução para um fluxo filho (sub-flow).
   * Reutilizável externamente (ex.: FlowsService) para rastrear sub-execuções.
   */
  async createChildExecution(
    flow: FlowEntity,
    ctx: FlowExecutionContext,
  ): Promise<FlowExecutionEntity> {
    return this.executionsRepo.save(
      this.executionsRepo.create({
        flowId: flow.id,
        submissionId: null,
        eventName: ctx.eventName ?? 'sub_flow_called',
        solicitationId: ctx.solicitation?.id ?? null,
        approvalId: ctx.approval?.id ?? null,
        status: 'running',
        startedAt: new Date(),
        parentFlowId: ctx.parentFlowId ?? null,
        parentExecutionId: ctx.parentExecutionId ?? null,
      }),
    );
  }

  /**
   * Executa um fluxo com tracking completo de execução (cria/atualiza FlowExecutionEntity).
   * Separado de execute() para ser reutilizável como sub-fluxo.
   * Retorna { status } sem lançar exceção — erros internos são capturados e registrados.
   */
  async runChildFlow(
    flow: FlowEntity,
    ctx: FlowExecutionContext,
    executionId: string,
  ): Promise<{
    status:
      | 'success'
      | 'partial_failure'
      | 'failed'
      | 'waiting_approval'
      | 'waiting_phase_fields'
      | 'waiting_subflow';
  }> {
    const start = Date.now();
    try {
      const nodeResults = await this.execute(flow, ctx);

      // Mesmo registro que FlowsService.executeFlowWithContext grava numa pausa: é por ele
      // (approvalId/waitingPhaseId + pausedNodeId) que os listeners retomam o filho depois.
      const pausedApproval = nodeResults.find(isPausedApprovalResult);
      if (pausedApproval) {
        await this.executionsRepo.update(executionId, {
          status: 'waiting_approval',
          nodeResults: nodeResults as unknown as Record<string, unknown>[],
          approvalId: pausedApproval.output.approvalId,
          pausedNodeId: pausedApproval.nodeId,
        });
        return { status: 'waiting_approval' };
      }
      const pausedPhaseFields = nodeResults.find(isPausedPhaseFieldsResult);
      if (pausedPhaseFields) {
        await this.executionsRepo.update(executionId, {
          status: 'waiting_phase_fields',
          nodeResults: nodeResults as unknown as Record<string, unknown>[],
          waitingPhaseId: pausedPhaseFields.output.waitingPhaseId,
          pausedNodeId: pausedPhaseFields.nodeId,
        });
        return { status: 'waiting_phase_fields' };
      }
      // O próprio filho chamou um neto `sync` que pausou: o filho espera o neto, e o pai, o filho.
      const pausedSubflow = nodeResults.find(isPausedSubflowResult);
      if (pausedSubflow) {
        await this.executionsRepo.update(executionId, {
          status: 'waiting_subflow',
          nodeResults: nodeResults as unknown as Record<string, unknown>[],
          pausedNodeId: pausedSubflow.nodeId,
        });
        return { status: 'waiting_subflow' };
      }

      const hasFailed = nodeResults.some((r) => r.status === 'failed');
      const status: 'success' | 'partial_failure' = hasFailed ? 'partial_failure' : 'success';
      const firstError = nodeResults.find((r) => r.status === 'failed')?.error ?? null;

      await this.executionsRepo.update(executionId, {
        status,
        completedAt: new Date(),
        nodeResults: nodeResults as unknown as Record<string, unknown>[],
        errorMessage: hasFailed ? firstError : null,
      });
      this.metricsService.recordFlowExecution(flow.id, status, Date.now() - start);
      return { status };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.executionsRepo.update(executionId, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: msg,
      });
      this.metricsService.recordFlowExecution(flow.id, 'failed', Date.now() - start);
      return { status: 'failed' };
    }
  }

  private requireSolicitation(ctx: FlowExecutionContext): SolicitationEntity {
    if (!ctx.solicitation) {
      throw new Error('Ação requer solicitação no contexto do fluxo.');
    }
    return ctx.solicitation;
  }

  // ── Teste manual (FlowsService.runTest) ────────────────────────────────────────
  // Nenhum nó produz efeito: cada um valida a própria configuração como na execução real e,
  // no ponto em que agiria (e-mail, chamada externa, gravação), devolve dryRunOutput.

  private isTestRun(ctx: FlowExecutionContext): boolean {
    return ctx.metadata?.testRun === true;
  }

  private isAssumedInTestRun(ctx: FlowExecutionContext, data: TestRunAssumption): boolean {
    return this.isTestRun(ctx) && ctx.testRunAssumptions?.has(data) === true;
  }

  private assumeInTestRun(ctx: FlowExecutionContext, data: TestRunAssumption): void {
    if (!this.isTestRun(ctx)) return;
    (ctx.testRunAssumptions ??= new Set()).add(data);
  }

  /**
   * requireSolicitation, exceto no teste quando a solicitação viria do evento real ou de um nó
   * simulado antes: aí devolve null, e o nó só descreve o que faria.
   */
  private requireSolicitationUnlessAssumed(ctx: FlowExecutionContext): SolicitationEntity | null {
    if (!ctx.solicitation && this.isAssumedInTestRun(ctx, 'solicitation')) return null;
    return this.requireSolicitation(ctx);
  }

  /**
   * No teste, uma condição que depende do que só a execução real teria decide às cegas: avisa
   * em vez de parecer certa.
   */
  private testRunConditionWarning(
    nodeType: FlowNode['type'],
    ctx: FlowExecutionContext,
    passes: boolean,
  ): Record<string, unknown> | undefined {
    let missing: string | null = null;
    if (
      (nodeType === 'condition_solicitation_status' ||
        nodeType === 'condition_solicitation_priority') &&
      !ctx.solicitation &&
      this.isAssumedInTestRun(ctx, 'solicitation')
    ) {
      missing = 'a solicitação, que vem do evento real';
    } else if (
      nodeType === 'condition_approval_result' &&
      !ctx.approval &&
      this.isAssumedInTestRun(ctx, 'approval')
    ) {
      missing = 'a aprovação, que vem do evento real';
    } else if (
      nodeType === 'condition_response_value' &&
      !ctx.metadata?.lastCheckResponse &&
      this.isAssumedInTestRun(ctx, 'response')
    ) {
      missing = 'a resposta da chamada, que o teste só simulou';
    }
    if (!missing) return undefined;
    return dryRunOutput(`Seguiu o caminho "${passes ? 'Sim' : 'Não'}" sem ${missing}.`, {
      warning: 'Na execução real o caminho pode ser outro.',
    });
  }

  private buildAutomationActor(ctx: FlowExecutionContext): JwtPayload | null {
    if (!ctx.actorId) return null;
    return {
      sub: ctx.actorId,
      email: 'automation@aurora-flow.local',
      fullName: 'Automação Aurora Flow',
      role: 'admin',
      tokenVersion: 0,
    };
  }

  private nextFlowEventDepth(ctx: FlowExecutionContext): number {
    return this.getFlowEventDepth(ctx) + 1;
  }

  private assertFlowEventDepthAllowsMutation(ctx: FlowExecutionContext): void {
    if (this.getFlowEventDepth(ctx) >= MAX_FLOW_EVENT_DEPTH) {
      throw new Error('Limite de encadeamento de eventos do fluxo atingido.');
    }
  }

  private getFlowEventDepth(ctx: FlowExecutionContext): number {
    const depth = Number(ctx.flowEventDepth ?? ctx.metadata?.flowEventDepth ?? 0);
    return Number.isFinite(depth) && depth > 0 ? depth : 0;
  }

  private getPriorityRank(priority: SolicitationPriority | string): number {
    const ranks: Record<string, number> = {
      [SolicitationPriority.LOW]: 0,
      [SolicitationPriority.MEDIUM]: 1,
      [SolicitationPriority.HIGH]: 2,
      [SolicitationPriority.URGENT]: 3,
      critical: 3,
    };
    return ranks[priority] ?? -1;
  }

  private parseOptionalPositiveInteger(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
    return parsed;
  }
}
