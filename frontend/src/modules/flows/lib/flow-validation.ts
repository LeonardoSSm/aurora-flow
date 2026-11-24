import { FLOW_NODE_TYPES, isFlowTriggerNodeType } from '../types/flow.types';
import type { FlowEdge, FlowNode, FlowNodeData } from '../types/flow.types';
import { MAX_EXTERNAL_APPROVERS } from '../../../lib/email-list';
import { getNotificationConfigError } from './notification-config';
import {
  getApproverSourceMode,
  getInvalidApproverEmails,
  isApproverSourceConfigured,
  type ApproverSourceMode,
} from './node-issues';

export type ValidationErrorType =
  | 'no_trigger'
  | 'multiple_triggers'
  | 'unconfigured_node'
  | 'disconnected_node'
  | 'cycle';

export interface ValidationError {
  type: ValidationErrorType;
  nodeId?: string;
  message: string;
}

// Predicados compartilhados com as pendências do modal (getNodeIssues); reexportados para quem
// já os importava daqui.
export { getApproverSourceMode, getInvalidApproverEmails, isApproverSourceConfigured };
export type { ApproverSourceMode };

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
  if (nodes.length === 0) return [];

  const errors: ValidationError[] = [];

  // 1. Gatilhos: pelo menos um. Vários são várias entradas no mesmo fluxo; só o agendado é um
  // por fluxo (o backend guarda uma única próxima execução).
  const triggers = nodes.filter((n) => isFlowTriggerNodeType(n.type));
  if (triggers.length === 0) {
    errors.push({
      type: 'no_trigger',
      message: 'O fluxo precisa de pelo menos um nó de Gatilho.',
    });
  } else if (triggers.filter((n) => n.type === 'trigger_scheduled').length > 1) {
    errors.push({
      type: 'multiple_triggers',
      message: 'O fluxo só pode ter um gatilho agendado. Remova os extras.',
    });
  }

  // 2. Unconfigured required fields
  for (const node of nodes) {
    const d = node.data as FlowNodeData;
    const label = d.label ? String(d.label) : node.type;
    let msg: string | null = null;

    if (!(FLOW_NODE_TYPES as readonly string[]).includes(node.type)) {
      msg = `Nó "${label}": tipo de nó inválido.`;
    } else if (
      node.type === 'trigger_webhook_received' &&
      d.payloadFilters !== undefined &&
      !isPlainObject(d.payloadFilters)
    ) {
      msg = `Nó "${label}": informe filtros de payload em JSON válido.`;
    } else if (node.type === 'trigger_scheduled') {
      const scheduleMode = d.mode === 'cron' ? 'cron' : 'interval';
      const scheduleOk =
        scheduleMode === 'cron'
          ? !!String(d.cronExpression ?? '').trim()
          : !!d.intervalValue && Number(d.intervalValue) >= 1 && !!d.intervalUnit;
      if (!scheduleOk) {
        msg = `Nó "${label}": configure ${
          scheduleMode === 'cron' ? 'a expressão cron' : 'o intervalo (valor e unidade)'
        }.`;
      }
    } else if (node.type === 'condition_field_value' && !d.fieldCode) {
      msg = `Nó "${label}": selecione o campo da condição.`;
    } else if (
      node.type === 'condition_solicitation_status' &&
      (!isAllowed(d.operator, ['equals', 'not_equals']) || !isSolicitationStatus(d.value))
    ) {
      msg = `Nó "${label}": configure operador e status da solicitação.`;
    } else if (
      node.type === 'condition_solicitation_priority' &&
      (!isAllowed(d.operator, ['equals', 'not_equals', 'greater_than', 'less_than']) ||
        !isSolicitationPriority(d.value))
    ) {
      msg = `Nó "${label}": configure operador e prioridade da solicitação.`;
    } else if (
      node.type === 'condition_response_value' &&
      (!String(d.path ?? '').trim() ||
        !isAllowed(d.operator, [
          'equals',
          'not_equals',
          'contains',
          'greater_than',
          'less_than',
          'is_empty',
          'is_not_empty',
        ]))
    ) {
      msg = `Nó "${label}": informe o caminho (dot-path) e o operador.`;
    } else if (
      node.type === 'condition_approval_result' &&
      (!isAllowed(d.operator, ['equals', 'not_equals']) ||
        !isAllowed(d.value, ['approved', 'rejected']))
    ) {
      msg = `Nó "${label}": configure operador e resultado da aprovação.`;
    } else if (
      (node.type === 'trigger_phase_field_saved' ||
        node.type === 'trigger_phase_entered' ||
        node.type === 'trigger_approval_completed') &&
      d.phaseId !== undefined &&
      !String(d.phaseId ?? '').trim()
    ) {
      msg = `Nó "${label}": fase inválida.`;
    } else if (node.type === 'action_send_email' && !d.toEmail) {
      msg = `Nó "${label}": informe o destinatário do e-mail.`;
    } else if (node.type === 'action_webhook' && !d.webhookUrl) {
      msg = `Nó "${label}": informe a URL do webhook.`;
    } else if (node.type === 'action_http_check' && !String(d.url ?? '').trim()) {
      msg = `Nó "${label}": informe a URL a verificar.`;
    } else if (
      node.type === 'action_notify_users' &&
      (!Array.isArray(d.userIds) || (d.userIds as string[]).length === 0)
    ) {
      msg = `Nó "${label}": selecione ao menos um usuário.`;
    } else if (node.type === 'action_google_sheets' && !d.spreadsheetId) {
      msg = `Nó "${label}": informe o ID da planilha.`;
    } else if (
      (node.type === 'action_update_solicitation_status' ||
        node.type === 'action_move_kanban_card') &&
      !isSolicitationStatus(d.status)
    ) {
      msg = `Nó "${label}": selecione o novo status da solicitação.`;
    } else if (node.type === 'action_create_approval') {
      if (!String(d.title ?? '').trim() || !isApproverSourceConfigured(d)) {
        const approverSourceMode = getApproverSourceMode(d);
        msg = `Nó "${label}": informe título e ${
          approverSourceMode === 'fixed'
            ? 'ao menos um aprovador'
            : approverSourceMode === 'field'
              ? 'o campo do formulário com o aprovador'
              : 'o caminho de aprovadores'
        }.`;
      } else if (getInvalidApproverEmails(d).length > 0) {
        msg = `Nó "${label}": e-mail de aprovador inválido (${getInvalidApproverEmails(d).join(', ')}).`;
      } else if (Array.isArray(d.approverEmails) && d.approverEmails.length > MAX_EXTERNAL_APPROVERS) {
        msg = `Nó "${label}": no máximo ${MAX_EXTERNAL_APPROVERS} aprovadores por e-mail.`;
      }
    } else if (
      node.type === 'trigger_attachment_uploaded' &&
      d.fieldCode !== undefined &&
      !String(d.fieldCode ?? '').trim()
    ) {
      msg = `Nó "${label}": código de campo inválido.`;
    } else if (
      node.type === 'action_ai_agent' &&
      (!String(d.agentSlug ?? '').trim() || !String(d.apiKey ?? '').trim())
    ) {
      // A URL vem do servidor; o agente (lista) e a chave de API são configurados por nó.
      msg = `Nó "${label}": escolha o agente da LOPS IA e informe a chave de API.`;
    } else if (
      node.type === 'action_wait_for_phase_fields' &&
      !String(d.phaseId ?? '').trim()
    ) {
      msg = `Nó "${label}": selecione a fase a aguardar.`;
    } else if (
      node.type === 'action_move_phase' &&
      !String(d.phaseId ?? '').trim()
    ) {
      msg = `Nó "${label}": selecione a fase de destino.`;
    } else if (
      node.type === 'action_create_solicitation_from_payload' &&
      !String(d.titleTemplate ?? '').trim() &&
      !String(d.titlePath ?? '').trim()
    ) {
      msg = `Nó "${label}": informe o título da tarefa (texto fixo ou dot-path do payload).`;
    } else if (
      node.type === 'action_create_solicitation_from_payload' &&
      (d.fieldValues ?? []).length > 0 &&
      (!d.formId || (d.fieldValues ?? []).some((entry) => !String(entry.fieldCode ?? '').trim()))
    ) {
      msg = `Nó "${label}": escolha o formulário e o campo de cada resposta.`;
    } else if (node.type === 'action_forward_to_process' && !String(d.formId ?? '').trim()) {
      msg = `Nó "${label}": escolha o processo de destino.`;
    } else if (
      node.type === 'action_forward_to_process' &&
      (d.fieldMappings ?? []).some(
        (mapping) =>
          !String(mapping.targetFieldCode ?? '').trim() ||
          (!String(mapping.sourceFieldCode ?? '').trim() && typeof mapping.value !== 'string'),
      )
    ) {
      msg = `Nó "${label}": escolha o campo do destino e de onde vem o valor em cada linha.`;
    } else if (node.type === 'action_assign_responsible' && !String(d.userId ?? '').trim()) {
      msg = `Nó "${label}": selecione o responsável.`;
    } else if (
      node.type === 'action_send_whatsapp' &&
      (!String(d.message ?? '').trim() ||
        !isAllowed(d.recipientType, ['requester', 'responsible', 'custom']) ||
        (d.recipientType === 'custom' && !String(d.customPhone ?? '').trim()))
    ) {
      msg = `Nó "${label}": informe destinatário e mensagem do WhatsApp.`;
    } else if (
      node.type === 'action_erp_operation' &&
      (!String(d.connectorId ?? '').trim() || !String(d.templateId ?? '').trim())
    ) {
      msg = `Nó "${label}": selecione o conector ERP e a operação.`;
    } else if (node.type === 'action_notification' && getNotificationConfigError(d)) {
      msg = `Nó "${label}": ${getNotificationConfigError(d)}`;
    } else if (node.type === 'action_run_flow' && !String(d.flowId ?? '').trim()) {
      msg = `Nó "${label}": selecione o fluxo filho a ser chamado.`;
    } else if (
      node.type === 'action_run_flow' &&
      !isAllowed(d.mode, ['sync', 'async'])
    ) {
      msg = `Nó "${label}": configure o modo de execução (sync ou async).`;
    }

    if (msg) errors.push({ type: 'unconfigured_node', nodeId: node.id, message: msg });
  }

  // 3. Disconnected nodes (no edges in or out — trigger excluded since it has no incoming)
  for (const node of nodes) {
    if (isFlowTriggerNodeType(node.type)) continue;
    const connected = edges.some((e) => e.source === node.id || e.target === node.id);
    if (!connected) {
      const d = node.data as FlowNodeData;
      const label = d.label ? String(d.label) : node.type;
      errors.push({
        type: 'disconnected_node',
        nodeId: node.id,
        message: `Nó "${label}" está solto — conecte-o ao fluxo.`,
      });
    }
  }

  // 3b. Com mais de uma entrada, cada gatilho precisa apontar para onde o fluxo começa por ele —
  // um gatilho sem saída dispararia uma execução que não faz nada.
  if (triggers.length > 1) {
    for (const trigger of triggers) {
      if (edges.some((e) => e.source === trigger.id)) continue;
      const d = trigger.data as FlowNodeData;
      const label = d.label ? String(d.label) : trigger.type;
      errors.push({
        type: 'disconnected_node',
        nodeId: trigger.id,
        message: `Gatilho "${label}" não está ligado a nenhum nó — ligue-o ao ponto onde o fluxo começa por ele.`,
      });
    }
  }

  // 4. Cycle detection (DFS coloring)
  if (hasCycle(nodes, edges)) {
    errors.push({
      type: 'cycle',
      message: 'O fluxo contém um ciclo (loop infinito) — remova a conexão circular.',
    });
  }

  return errors;
}

const SOLICITATION_STATUSES = new Set([
  'open',
  'waiting',
  'resolved',
  'canceled',
  'new',
  'in_analysis',
  'waiting_approval',
  'in_progress',
  'approved',
  'rejected',
  'waiting_integration',
  'completed',
  'cancelled',
]);

const SOLICITATION_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

function isAllowed(value: unknown, allowed: string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSolicitationStatus(value: unknown): boolean {
  return typeof value === 'string' && SOLICITATION_STATUSES.has(value);
}

function isSolicitationPriority(value: unknown): boolean {
  return typeof value === 'string' && SOLICITATION_PRIORITIES.has(value);
}

export function hasCycle(nodes: FlowNode[], edges: FlowEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.source)?.push(e.target);

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, 0 | 1 | 2>(nodes.map((n) => [n.id, WHITE]));

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      if (color.get(next) === GRAY) return true;
      if (color.get(next) === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE && dfs(n.id)) return true;
  }
  return false;
}
