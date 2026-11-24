import type { FlowNodeType } from './types/flow.types';

/**
 * Nós que o Aurora Flow expõe e executa. Tudo o que não estiver aqui é legado de
 * formulários/processos: a API recusa na persistência e o motor recusa na execução.
 */
export const ENABLED_FLOW_NODE_TYPES = [
  'trigger_webhook_received',
  'trigger_scheduled',
  'condition_always_true',
  'condition_field_value',
  'condition_response_value',
  'action_send_email',
  'action_webhook',
  'action_http_check',
  'action_notify_users',
  'action_google_sheets',
  'action_send_whatsapp',
  'action_erp_operation',
  'action_run_flow',
  'action_notification',
] as const satisfies readonly FlowNodeType[];

export type EnabledFlowNodeType = (typeof ENABLED_FLOW_NODE_TYPES)[number];

const ENABLED = new Set<string>(ENABLED_FLOW_NODE_TYPES);

export function isEnabledFlowNodeType(type: string): boolean {
  return ENABLED.has(type);
}

export function disabledFlowNodeMessage(type: string): string {
  return `O nó "${type}" foi descontinuado no Aurora Flow (domínio de formulários/processos) e não pode ser salvo nem executado.`;
}
