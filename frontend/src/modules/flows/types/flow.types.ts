export type FlowNodeType =
  | 'trigger_form_submit'
  | 'trigger_webhook_received'
  | 'trigger_solicitation_created'
  | 'trigger_solicitation_moved'
  | 'trigger_approval_completed'
  | 'trigger_sla_warning'
  | 'trigger_sla_breached'
  | 'trigger_scheduled'
  | 'trigger_attachment_uploaded'
  | 'trigger_phase_field_saved'
  | 'trigger_phase_entered'
  | 'condition_field_value'
  | 'condition_always_true'
  | 'condition_solicitation_status'
  | 'condition_solicitation_priority'
  | 'condition_response_value'
  | 'condition_approval_result'
  | 'action_send_email'
  | 'action_webhook'
  | 'action_http_check'
  | 'action_notify_users'
  | 'action_google_sheets'
  | 'action_update_solicitation_status'
  | 'action_move_kanban_card'
  | 'action_create_approval'
  | 'action_create_solicitation_from_payload'
  | 'action_forward_to_process'
  | 'action_assign_responsible'
  | 'action_send_whatsapp'
  | 'action_erp_operation'
  | 'action_ai_agent'
  | 'action_wait_for_phase_fields'
  | 'action_move_phase'
  | 'action_run_flow'
  | 'action_notification';

export type FlowTriggerNodeType = Extract<FlowNodeType, `trigger_${string}`>;

export const FLOW_TRIGGER_NODE_TYPES = [
  'trigger_form_submit',
  'trigger_webhook_received',
  'trigger_solicitation_created',
  'trigger_solicitation_moved',
  'trigger_approval_completed',
  'trigger_sla_warning',
  'trigger_sla_breached',
  'trigger_scheduled',
  'trigger_attachment_uploaded',
  'trigger_phase_field_saved',
  'trigger_phase_entered',
] as const satisfies readonly FlowTriggerNodeType[];

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

export const FLOW_NODE_TYPES = [
  ...FLOW_TRIGGER_NODE_TYPES,
  'condition_field_value',
  'condition_always_true',
  'condition_solicitation_status',
  'condition_solicitation_priority',
  'condition_response_value',
  'condition_approval_result',
  'action_send_email',
  'action_webhook',
  'action_http_check',
  'action_notify_users',
  'action_google_sheets',
  'action_update_solicitation_status',
  'action_move_kanban_card',
  'action_create_approval',
  'action_create_solicitation_from_payload',
  'action_forward_to_process',
  'action_assign_responsible',
  'action_send_whatsapp',
  'action_erp_operation',
  'action_ai_agent',
  'action_wait_for_phase_fields',
  'action_move_phase',
  'action_run_flow',
  'action_notification',
] as const satisfies readonly FlowNodeType[];

export function isFlowTriggerNodeType(type: string | undefined): type is FlowTriggerNodeType {
  return !!type && (FLOW_TRIGGER_NODE_TYPES as readonly string[]).includes(type);
}

// ── Nó "Notificação" (action_notification) ─────────────────────────────

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp';
export type NotificationPriority = 'low' | 'normal' | 'high';

/** Quem recebe — o mesmo formato validado pelo backend (ver ActionNotificationData). */
export type NotificationRecipientSpec =
  | { type: 'users'; userIds: string[] }
  | { type: 'requester' }
  | { type: 'responsible' }
  | { type: 'custom'; value: string }
  | { type: 'field'; fieldCode: string }
  | { type: 'payload_path'; path: string };

export interface FlowNodeData {
  label?: string;
  fieldCode?: string;
  operator?:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value?: string;
  formId?: string;
  fromStatus?: string;
  toStatus?: string;
  result?: 'approved' | 'rejected' | 'any';
  endpointId?: string;
  payloadFilters?: Record<string, unknown> | string;
  /** trigger_webhook_received — lote: dot-path de uma lista no payload; cada item vira uma execução */
  splitItemsPath?: string;
  /** trigger_solicitation_created — origens aceitas (vazio = qualquer) */
  originTypes?: string[];
  status?: string;
  currentStage?: string;
  assignedUserIds?: string[];
  userId?: string;
  toEmail?: string;
  subject?: string;
  body?: string;
  webhookUrl?: string;
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  userIds?: string[];
  message?: string;
  spreadsheetId?: string;
  sheetName?: string;
  recipientType?: 'requester' | 'responsible' | 'custom';
  customPhone?: string;
  includeApprovalLink?: boolean;
  /** LEGADO — "Modo" antigo do nó de aprovação; vale como 'sequential' quando não há approvalRule. */
  approvalMode?: 'parallel' | 'sequential';
  /** Nó de aprovação: basta um ('any'), todos ('all') ou todos em ordem ('sequential'). */
  approvalRule?: 'any' | 'all' | 'sequential';
  // action_create_approval — aprovadores dinâmicos, por perfil da fase ou de um campo do formulário
  approverSourceMode?: 'fixed' | 'dynamic' | 'phase_role' | 'field';
  approversPath?: string;
  approverFieldCode?: string;
  // action_create_approval — e-mails fixos de aprovadores (usuário ativo decide logado; os demais, por link)
  approverEmails?: string[];
  // action_create_approval — modos 'field'/'dynamic': e-mail sem usuário vira aprovador externo (link)
  allowExternalApprovers?: boolean;
  // action_create_approval — escopo da aprovação: solicitação inteira (padrão) ou só a fase atual
  scope?: 'solicitation' | 'phase';
  // action_create_solicitation_from_payload
  titlePath?: string;
  titleTemplate?: string;
  descriptionPath?: string;
  descriptionTemplate?: string;
  metadataFieldMappings?: Array<{ path: string; target: string }>;
  idempotencyKeyPath?: string;
  idempotencyKeyTemplate?: string;
  /** Respostas do formulário da solicitação criada: código do campo → valor (aceita {{variáveis}}) */
  fieldValues?: Array<{ fieldCode: string; value: string }>;
  /** action_create_solicitation_from_payload — a solicitação já existia (mesma chave): encerra o caminho */
  stopIfExisting?: boolean;
  // action_forward_to_process (formId, phaseId, titleTemplate e stopIfExisting são os mesmos campos)
  /** Campo do destino com o mesmo código de um campo do card atual recebe o valor. Ausente = sim. */
  autoMatchByCode?: boolean;
  /** Campo do destino ← campo do card atual (sourceFieldCode) ou texto com {{variáveis}} (value). */
  fieldMappings?: Array<{ targetFieldCode: string; sourceFieldCode?: string; value?: string }>;
  /** Copia os anexos do card para o destino. Ausente = sim. */
  copyAttachments?: boolean;
  /** 'template' = texto fixo (gatilhos sem payload); 'payload' = dot-path do webhook */
  titleSourceMode?: 'template' | 'payload';
  dueInMonths?: number;
  dueInDays?: number;
  slaWarningThresholdPercent?: number;
  priority?: string;
  connectorId?: string;
  connectorName?: string;
  templateId?: string;
  templateName?: string;
  templateMethod?: string;
  // action_run_flow
  flowId?: string;
  flowName?: string;
  // 'sync'/'async' usado por action_run_flow; 'interval'/'cron' usado por trigger_scheduled
  mode?: 'sync' | 'async' | 'interval' | 'cron';
  passContext?: boolean;
  // trigger_scheduled
  intervalValue?: number;
  intervalUnit?: 'minutes' | 'hours' | 'days';
  cronExpression?: string;
  timezone?: string;
  // action_http_check
  url?: string;
  bodyTemplate?: string;
  timeoutMs?: number;
  // condition_response_value
  path?: string;
  // action_ai_agent (nó "LOPS IA") — agente escolhido na lista + chave de API do nó; a URL vem do servidor
  agentSlug?: string;
  /** Nome amigável do agente escolhido, só para exibição no canvas. */
  agentName?: string;
  /** Chave enviada em X-API-Key ao executar o agente (a chave do servidor só lista os agentes). */
  apiKey?: string;
  /** Opcional/legado: URL base própria do nó (nós antigos); a tela não pede mais. */
  baseUrl?: string;
  // trigger_phase_field_saved — fase específica que dispara o gatilho (vazio = qualquer fase)
  // trigger_phase_entered — fase em que o card entrou (vazio = qualquer fase)
  // trigger_approval_completed — só aprovações desta fase (vazio = qualquer aprovação)
  // action_wait_for_phase_fields — fase que, ao ser salva, retoma o fluxo (obrigatória)
  phaseId?: string;
  /** Nome da fase, só para exibição no canvas de action_wait_for_phase_fields */
  phaseLabel?: string;
  /** trigger_phase_entered — só quando o card veio desta fase (vazio = de qualquer fase) */
  fromPhaseId?: string;
  /** action_create_approval (modo lista fixa) — perfis que aprovam; basta uma pessoa do perfil */
  approverRoleCodes?: string[];
  // action_notification — canal, destinatários, conteúdo (texto puro com {{variáveis}}) e opções de envio
  channel?: NotificationChannel;
  recipients?: NotificationRecipientSpec[];
  title?: string;
  content?: string;
  delayMinutes?: number;
  deliveryMode?: 'immediate' | 'background';
  continueOnFailure?: boolean;
  /** Destinatário sem contato fica de fora; sem nenhum, o aviso é pulado sem falha. */
  skipUnresolvedRecipients?: boolean;
  retryPolicy?: { maxAttempts?: number; backoffSeconds?: number };
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
}

export interface FlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface Flow {
  id: string;
  formId: string | null;
  form?: { id: string; name: string } | null;
  name: string;
  isActive: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: FlowViewport | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowExecution {
  id: string;
  flowId: string;
  submissionId: string | null;
  status: 'running' | 'success' | 'failed' | 'partial_failure';
  startedAt: string | null;
  completedAt: string | null;
  nodeResults: NodeExecutionResult[];
  errorMessage: string | null;
  createdAt: string;
  parentFlowId?: string | null;
  parentExecutionId?: string | null;
}

export interface FlowExecutionPage {
  data: FlowExecution[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NodeTestResult {
  nodeId: string;
  status: 'success' | 'failed' | 'skipped';
  /** No teste, nós com efeito devolvem `{ dryRun: true, summary, warning? }` em vez de agir. */
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface FlowPage {
  data: Flow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FlowsQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  excludeId?: string;
}

export interface RunFlowTestDto {
  fieldValues?: Record<string, unknown>;
  /** Gatilho por onde o teste entra, num fluxo com vários; ausente = o primeiro. */
  entryNodeId?: string;
}

/** Origem de uma solicitação (SolicitationOriginType no backend), para o filtro do gatilho. */
export const SOLICITATION_ORIGIN_LABELS: Record<string, string> = {
  form_submission: 'Envio de formulário',
  webhook: 'Webhook ou fluxo',
  process_handoff: 'Encaminhada de outro processo',
  manual: 'Criada à mão',
};

export interface CreateFlowDto {
  name: string;
  formId?: string | null;
  isActive?: boolean;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  viewport?: FlowViewport | null;
}

export interface UpdateFlowDto {
  name?: string;
  formId?: string | null;
  isActive?: boolean;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  viewport?: FlowViewport | null;
}
