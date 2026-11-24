import type { ApprovalEntity } from '../../../database/entities/approval.entity';
import type { AttachmentEntity } from '../../../database/entities/attachment.entity';
import type { FormEntity } from '../../../database/entities/form.entity';
import type { SolicitationEntity } from '../../../database/entities/solicitation.entity';
import type { SubmissionEntity } from '../../../database/entities/submission.entity';
import type { SolicitationPriority } from '../../../common/enums/solicitation-priority.enum';
import type { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';
import type {
  NotificationChannelId,
  NotificationPriority,
} from '../../notifications/domain/notification.types';

export const MAX_FLOW_EVENT_DEPTH = 3;

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

export function isFlowTriggerNodeType(type: string): type is FlowTriggerNodeType {
  return (FLOW_TRIGGER_NODE_TYPES as readonly string[]).includes(type);
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

export type FlowNodeData =
  | TriggerFormSubmitData
  | TriggerWebhookReceivedData
  | TriggerSolicitationCreatedData
  | TriggerScheduledData
  | TriggerAttachmentUploadedData
  | TriggerPhaseFieldSavedData
  | TriggerPhaseEnteredData
  | TriggerApprovalCompletedData
  | TriggerSlaData
  | ConditionFieldValueData
  | ConditionSolicitationStatusData
  | ConditionSolicitationPriorityData
  | ConditionResponseValueData
  | ConditionApprovalResultData
  | ActionSendEmailData
  | ActionWebhookData
  | ActionHttpCheckData
  | ActionNotifyUsersData
  | ActionGoogleSheetsData
  | ActionUpdateSolicitationStatusData
  | ActionMoveKanbanCardData
  | ActionCreateApprovalData
  | ActionCreateSolicitationFromPayloadData
  | ActionForwardToProcessData
  | ActionAssignResponsibleData
  | ActionSendWhatsAppData
  | ActionErpOperationData
  | ActionAiAgentData
  | ActionWaitForPhaseFieldsData
  | ActionMovePhaseData
  | ActionRunFlowData
  | ActionNotificationData;

export interface TriggerFormSubmitData {
  label?: string;
  /** Specific form ID to observe; null or absent = observe any form */
  formId?: string | null;
}

export interface TriggerWebhookReceivedData {
  label?: string;
  endpointId?: string;
  /**
   * Só dispara quando cada chave (dot-path no payload) tem o valor indicado — ex.:
   * `{ "tipo": "cancelamento" }`. É o que separa duas entradas de webhook no mesmo endpoint.
   */
  payloadFilters?: Record<string, unknown>;
  /**
   * Lote: dot-path de uma lista no payload (ex.: `pedidos`). Cada item vira uma execução
   * separada, com o item em `ctx.metadata.payload` e em `{{item}}` (ver FlowsWebhookListener).
   * Vazio = o payload inteiro é uma execução só.
   */
  splitItemsPath?: string;
}

/** Máximo de itens de um lote de webhook (splitItemsPath); o que passar disso é descartado. */
export const MAX_WEBHOOK_BATCH_ITEMS = 500;

export interface TriggerSolicitationCreatedData {
  label?: string;
  /** Formulário específico a observar; null/ausente = qualquer formulário */
  formId?: string | null;
  /**
   * Origens aceitas (SolicitationOriginType: form_submission, webhook, manual). Vazio/ausente =
   * qualquer origem. Uma solicitação criada por um fluxo tem origem `webhook` — filtrar por
   * `form_submission` evita que ela entre de novo pelo começo do fluxo que a criou.
   */
  originTypes?: string[];
}

export interface TriggerScheduledData {
  label?: string;
  mode: 'interval' | 'cron';
  /** Obrigatório quando mode === 'interval'; inteiro >= 1 */
  intervalValue?: number;
  intervalUnit?: 'minutes' | 'hours' | 'days';
  /** Obrigatório quando mode === 'cron'; expressão de 5 ou 6 campos */
  cronExpression?: string;
  /** Fuso usado para calcular a próxima execução; default 'America/Sao_Paulo' */
  timezone?: string;
}

export interface TriggerAttachmentUploadedData {
  label?: string;
  /** Formulário específico a observar; null/ausente = qualquer formulário (ver getEffectiveTriggerFormId) */
  formId?: string | null;
  /**
   * Código do campo (file_upload) do formulário para o qual este gatilho reage.
   * Vazio/ausente = qualquer anexo de imagem enviado a uma submissão deste formulário.
   */
  fieldCode?: string;
}

/**
 * Dispara quando os campos de uma fase de Kanban são salvos (SolicitationsService.
 * savePhaseFieldValues) — reutilizável em qualquer fase que precise reagir ao
 * preenchimento, ex.: pedir aprovação automaticamente assim que a quantidade
 * produzida for apontada, sem depender de um botão manual "Solicitar aprovação".
 */
/**
 * trigger_sla_warning / trigger_sla_breached: qual prazo observar. 'solicitation' (padrão,
 * retrocompatível) = o SLA geral da solicitação; 'phase' = o prazo da fase do Kanban (ver
 * kanban-phases/phase-sla.ts), opcionalmente de uma fase só.
 */
export interface TriggerSlaData {
  label?: string;
  slaScope?: 'solicitation' | 'phase';
  /** Com slaScope 'phase': fase específica; vazio = qualquer fase com prazo. */
  phaseId?: string;
}

export interface TriggerPhaseFieldSavedData {
  label?: string;
  /** Formulário específico a observar; null/ausente = qualquer formulário */
  formId?: string | null;
  /**
   * Fase específica cujos campos disparam este gatilho. Vazio/ausente = qualquer
   * fase do formulário. Como o evento já traz a fase exata que foi salva (ao
   * contrário do anexo de submissão, que não sabe de qual campo veio), este
   * filtro é aplicado de verdade em FlowsPhaseFieldsListener.
   */
  phaseId?: string;
}

/**
 * "Entrou na fase": o card mudou de fase (SolicitationsService.movePhase, por pessoa ou por fluxo).
 * Formalizar a entrada na 1ª fase de um card novo não dispara — isso é "Solicitação criada".
 */
export interface TriggerPhaseEnteredData {
  label?: string;
  /** Formulário específico; null/ausente = o do fluxo (ou qualquer um, num fluxo sem formulário). */
  formId?: string | null;
  /** Fase em que o card entrou. Vazio = qualquer fase. */
  phaseId?: string;
  /** Só quando veio desta fase. Vazio = de qualquer fase. */
  fromPhaseId?: string;
}

/** "Aprovação concluída" (aprovada ou reprovada). */
export interface TriggerApprovalCompletedData {
  label?: string;
  formId?: string | null;
  /**
   * Só aprovações desta fase (criadas pelo botão da fase ou por um nó com scope 'phase'). Vazio =
   * qualquer aprovação do formulário, como sempre foi.
   */
  phaseId?: string;
}

export interface ConditionFieldValueData {
  fieldCode: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value?: string;
  label?: string;
}

export interface ConditionSolicitationStatusData {
  operator: 'equals' | 'not_equals';
  value: SolicitationStatus;
  label?: string;
}

export interface ConditionSolicitationPriorityData {
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than';
  value: SolicitationPriority;
  label?: string;
}

export interface ConditionResponseValueData {
  /** Dot-path no body da última resposta capturada por action_http_check (ctx.metadata.lastCheckResponse.body) */
  path: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value?: string;
  label?: string;
}

/**
 * Ramifica o fluxo pelo resultado de uma aprovação criada por action_create_approval
 * logo antes dela (ctx.approval, recarregado do banco ao retomar a execução pausada).
 * Só faz sentido posicionado imediatamente depois de um action_create_approval no
 * mesmo caminho — em qualquer outro ponto, ctx.approval reflete a última aprovação
 * conhecida no contexto, se houver.
 */
export interface ConditionApprovalResultData {
  operator: 'equals' | 'not_equals';
  value: 'approved' | 'rejected';
  label?: string;
}

export interface ActionSendEmailData {
  /** Comma-separated recipients as saved by the frontend editor */
  toEmail?: string;
  /** Direct array form (for API / programmatic use) */
  to?: string[];
  subject: string;
  body: string;
  label?: string;
}

export interface ActionWebhookData {
  /** URL as saved by the frontend editor */
  webhookUrl?: string;
  /** Direct form (for API / programmatic use) */
  url?: string;
  method: 'POST' | 'GET' | 'PUT' | 'PATCH';
  /** Frontend stores headers as KvPair[]; also accept Record for direct use */
  headers?: Array<{ key: string; value: string }> | Record<string, string>;
  bodyTemplate?: string;
  signingSecret?: string;
  maxAttempts?: number;
  timeoutMs?: number;
  label?: string;
}

export interface ActionHttpCheckData {
  /** URL a chamar; aceita interpolação {{...}} */
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Array<{ key: string; value: string }> | Record<string, string>;
  bodyTemplate?: string;
  timeoutMs?: number;
  label?: string;
}

export interface ActionNotifyUsersData {
  userIds: string[];
  message: string;
  label?: string;
}

export interface ActionGoogleSheetsData {
  spreadsheetId: string;
  sheetName?: string;
  label?: string;
}

export interface ActionUpdateSolicitationStatusData {
  status: SolicitationStatus;
  currentStage?: string;
  label?: string;
}

export interface ActionMoveKanbanCardData {
  status: SolicitationStatus;
  currentStage?: string;
  label?: string;
}

export interface ActionCreateApprovalData {
  title: string;
  description?: string;
  /** Usado quando approverSourceMode é 'fixed' (ou ausente) — lista fixa configurada em tempo de design */
  assignedUserIds?: string[];
  /** Modo 'fixed': perfis que aprovam (basta uma pessoa do perfil), sozinhos ou junto de pessoas. */
  approverRoleCodes?: string[];
  /**
   * 'fixed' (padrão, retrocompatível) usa assignedUserIds; 'dynamic' resolve aprovadores do
   * payload em runtime; 'phase_role' roteia para "quem tiver o perfil aprovador da fase atual"
   * — o perfil vem de ctx.metadata.approverRoleCode, resolvido pelo próprio gatilho (não é
   * configurado aqui), então o mesmo nó funciona em qualquer formulário/fase sem reconfiguração.
   * 'field' lê o(s) e-mail(s) do aprovador de um campo do formulário (ctx.fields) — o próprio
   * solicitante indica quem aprova.
   */
  approverSourceMode?: 'fixed' | 'dynamic' | 'phase_role' | 'field';
  /** Dot-path em ctx.metadata.payload que resolve para uma lista/CSV de e-mails, usado quando approverSourceMode === 'dynamic' */
  approversPath?: string;
  /** Código do campo do formulário com o(s) e-mail(s) do aprovador, usado quando approverSourceMode === 'field' */
  approverFieldCode?: string;
  /**
   * E-mails fixos de aprovadores (modo 'fixed'), sozinhos ou junto de assignedUserIds. Quem tem usuário
   * ativo com o e-mail decide dentro do sistema; os demais recebem um link pessoal por e-mail.
   */
  approverEmails?: string[];
  /**
   * Nos modos 'dynamic' e 'field': e-mail sem usuário ativo vira aprovador EXTERNO (decide pelo link
   * enviado por e-mail) em vez de falhar o nó. Padrão: desligado — o e-mail precisa ser de um usuário.
   */
  allowExternalApprovers?: boolean;
  /**
   * 'solicitation' (padrão, retrocompatível) aprova a solicitação inteira e muda seu status.
   * 'phase' cria uma aprovação escopada à fase atual (ctx.metadata.phaseId, resolvido pelo
   * gatilho) — nunca muda solicitation.status, só o histórico da fase.
   */
  scope?: 'solicitation' | 'phase';
  /**
   * "Avisar quem aprova por e-mail": ao criar a aprovação, cada aprovador com usuário (nomeado ou
   * pelo perfil) recebe um e-mail com o link da aprovação. Assunto/texto aceitam {{variáveis}};
   * vazios usam o texto padrão (flows/notification/approval-email.ts). Aprovador externo já recebe o
   * link pessoal e não é avisado de novo.
   */
  emailApprovers?: { enabled?: boolean; subject?: string; body?: string };
  /**
   * Com vários aprovadores: 'any' (padrão) basta um aprovar; 'all' todos aprovam; 'sequential' um
   * depois do outro, na ordem da lista. No modo 'phase_role' vale a regra da fase, não esta.
   */
  approvalRule?: 'any' | 'all' | 'sequential';
  /** LEGADO — o "Modo" antigo do editor (paralelo/sequencial); sem approvalRule, sequencial vale. */
  approvalMode?: 'parallel' | 'sequential';
  label?: string;
}

export interface SolicitationFieldMapping {
  /** Dot-path em ctx.metadata.payload, ex: "header.numeroPedido" */
  path: string;
  /** Nome da chave de destino em solicitation.metadata */
  target: string;
}

export interface ActionCreateSolicitationFromPayloadData {
  /**
   * Dot-path em ctx.metadata.payload usado para montar o título da solicitação.
   * Só resolve em gatilhos que trazem payload (webhook); nos demais use titleTemplate.
   * Um dos dois é obrigatório.
   */
  titlePath?: string;
  /**
   * Título fixo, com as mesmas variáveis {{...}} interpoladas nos outros nós. É o
   * caminho para gatilhos sem payload — movimentação de solicitação e agendamento —,
   * onde o dot-path não teria em que resolver.
   */
  titleTemplate?: string;
  /** Dot-path opcional para a descrição */
  descriptionPath?: string;
  /** Descrição fixa, com interpolação; alternativa a descriptionPath */
  descriptionTemplate?: string;
  /** Mapeamentos adicionais de caminhos do payload para chaves em solicitation.metadata */
  metadataFieldMappings?: SolicitationFieldMapping[];
  /** Dot-path opcional usado como chave de idempotência (evita duplicar solicitação em reenvios do webhook) */
  idempotencyKeyPath?: string;
  /**
   * Chave de idempotência montada por template. Em recorrência (fechou uma tarefa,
   * nasce a próxima) é o que impede duas tarefas iguais caso o evento seja reentregue:
   * ex. `renovacao-{{solicitation_number}}`.
   */
  idempotencyKeyTemplate?: string;
  /**
   * Prazo da tarefa criada, contado a partir da criação. Meses usam aritmética de
   * calendário; dias somam depois. Sem nenhum dos dois, a tarefa herda o SLA padrão
   * do sistema (configuração `sla.default_hours`).
   */
  dueInMonths?: number;
  dueInDays?: number;
  /** Percentual do prazo a partir do qual o SLA alerta (1–99; default do sistema é 80) */
  slaWarningThresholdPercent?: number;
  priority?: SolicitationPriority;
  /**
   * FormId a gravar na solicitação criada. Sem isso, a solicitação nasce sem formulário
   * (formId: null), e gatilhos trigger_approval_completed sem escopo de formulário disparam
   * para QUALQUER aprovação do sistema (formId null é curinga, não filtro — ver
   * FlowsService.findActiveFlowsByTrigger). Defina um formId "de roteamento" aqui para isolar
   * o fluxo de retorno desta integração de aprovações de outros processos.
   */
  formId?: string | null;
  /**
   * Fase em que a solicitação nasce (entrada externa do mapa do processo: o webhook "entra" numa
   * fase). Precisa ser do formulário da solicitação. Sem isso, nasce na 1ª fase. Fora da 1ª, os
   * fluxos "Entrou na fase" dela disparam como numa movimentação.
   */
  phaseId?: string | null;
  /**
   * Respostas do formulário da solicitação criada, como se alguém o tivesse preenchido: código
   * do campo → valor (aceita {{variáveis}}, ex.: `{{item}}`). Ficam em
   * `solicitation.metadata.formFieldValues`, entram em `ctx.fields` (condições e `{{pedido}}`
   * nos nós seguintes) e alimentam a ficha do ERP de um campo "Lista do ERP".
   */
  fieldValues?: SolicitationFormFieldValue[];
  /**
   * A chave de idempotência já tinha solicitação (reenvio do mesmo item): true = o caminho para
   * aqui, sem repetir o que vem depois (mover card, aprovação, e-mail) para algo já tratado.
   * Ausente/false = segue com a solicitação existente (comportamento antigo).
   */
  stopIfExisting?: boolean;
  label?: string;
}

export interface SolicitationFormFieldValue {
  fieldCode: string;
  value: string;
}

/** Chave em solicitation.metadata com as respostas dadas por action_create_solicitation_from_payload. */
export const SOLICITATION_FORM_FIELD_VALUES_KEY = 'formFieldValues';

/**
 * Encaminhar para outro processo: cria no processo de destino um card com as respostas do card
 * atual (ver SolicitationsService.createFromHandoff). Os nós seguintes continuam no card de origem.
 */
export interface ActionForwardToProcessData {
  label?: string;
  /** Formulário (processo) de destino. */
  formId?: string;
  /** Fase em que o card nasce no destino; ausente = 1ª fase. */
  phaseId?: string;
  /** Título do card no destino, com {{variáveis}}; vazio = o título do card atual. */
  titleTemplate?: string;
  /** Campo do destino com o mesmo código de um campo da origem recebe o valor. Ausente = sim. */
  autoMatchByCode?: boolean;
  /** De onde vem cada campo do destino; vale mais que o mesmo código. */
  fieldMappings?: ForwardFieldMapping[];
  /** Copia os anexos do card (arquivos novos no destino). Ausente = sim. */
  copyAttachments?: boolean;
  /** O card já foi para este processo: encerra o caminho em vez de repetir o resto. Ausente = sim. */
  stopIfExisting?: boolean;
}

/** Um campo do destino ← um campo do card atual (`sourceFieldCode`) ou um texto (`value`, com {{variáveis}}). */
export interface ForwardFieldMapping {
  targetFieldCode: string;
  sourceFieldCode?: string;
  value?: string;
}

/** Limite de mapeamentos por nó (o formulário de destino raramente passa disso). */
export const MAX_FORWARD_FIELD_MAPPINGS = 200;

export interface ActionAssignResponsibleData {
  userId: string;
  label?: string;
}

export interface ActionErpOperationData {
  connectorId: string;
  templateId: string;
  label?: string;
}

/**
 * Nó "LOPS IA": chama um agente da LOPS IA (`POST {LOPS_AI_BASE_URL}/agents/{agentSlug}/chat`,
 * multipart: campo `image` + `message`, autenticado via header `X-API-Key`) — reutilizável em
 * qualquer fluxo que tenha um anexo de imagem no contexto (hoje, apenas o gatilho
 * trigger_attachment_uploaded fornece isso). O agente é escolhido numa lista
 * (`GET /integrations/lops-ai/agents`, que usa a LOPS_AI_API_KEY do servidor SÓ para listar); a URL
 * vem do servidor (LOPS_AI_BASE_URL) e a chave usada na execução é a `apiKey` informada no nó —
 * a chave do servidor nunca executa um agente. A resposta (`data` do corpo) é gravada em
 * ctx.metadata.lastCheckResponse — o mesmo formato que action_http_check já usa —
 * para um condition_response_value logo depois decidir com base nela. Quando o
 * contexto tem um anexo, o veredito também é persistido em
 * attachment.validationResult/validatedAt.
 */
export interface ActionAiAgentData {
  agentSlug: string;
  /** Nome amigável do agente, só para exibição no canvas (a execução usa o `agentSlug`). */
  agentName?: string;
  /** Chave enviada em X-API-Key ao executar o agente (obrigatória; nunca cai na chave do servidor). */
  apiKey: string;
  /**
   * Opcional/legado: nós criados antes do seletor de agentes guardam a URL base. Quando presente,
   * tem precedência sobre LOPS_AI_BASE_URL. A tela não pede mais este campo.
   */
  baseUrl?: string;
  /** Mensagem enviada ao agente; aceita interpolação {{campo}}. Padrão: "Analise essa imagem." */
  message?: string;
  /** Padrão: LOPS_AI_TIMEOUT_MS do servidor (30000 se ausente). */
  timeoutMs?: number;
  label?: string;
}

/**
 * Pausa a execução do fluxo até os campos de uma fase específica serem salvos
 * (solicitations.phase_fields_saved) — permite unir, num único fluxo, etapas separadas
 * por ações manuais no meio (ex.: aprovar a foto da fase 1, esperar o apontamento da
 * fase 3, aprovar de novo), do mesmo jeito que action_create_approval já pausa esperando
 * uma decisão humana. `phaseId` é obrigatório e explícito: ao contrário de
 * action_create_approval (scope: phase), aqui não dá pra inferir a fase do contexto —
 * ctx.metadata.phaseId, neste ponto do fluxo, ainda reflete a fase do gatilho original.
 */
export interface ActionWaitForPhaseFieldsData {
  /** Fase cujos campos, ao serem salvos, retomam o fluxo. */
  phaseId: string;
  /** Nome da fase, apenas para exibição no canvas */
  phaseLabel?: string;
  label?: string;
}

/**
 * Move a solicitação para uma fase específica do Kanban (SolicitationsService.movePhase) —
 * reusa o MESMO gate de aprovação já aplicado quando um humano move o card pela UI: só
 * funciona se a fase atual não exigir aprovação, ou já tiver uma aprovação aprovada. Como este
 * nó normalmente roda logo depois de action_create_approval ser decidida (ctx.approval já
 * aprovada), o gate passa naturalmente — é o próprio fluxo fechando o ciclo que hoje é manual
 * (o "MOVER PARA FASE" no card).
 */
export interface ActionMovePhaseData {
  /** Fase de destino. */
  phaseId: string;
  /** Nome da fase, apenas para exibição no canvas */
  phaseLabel?: string;
  label?: string;
}

export interface ActionSendWhatsAppData {
  recipientType: 'requester' | 'responsible' | 'custom';
  customPhone?: string;
  message: string;
  includeApprovalLink?: boolean;
  label?: string;
}

export interface ActionRunFlowData {
  /** UUID do fluxo filho a chamar */
  flowId: string;
  /** Nome do fluxo filho, apenas para exibição no canvas */
  flowName?: string;
  /** sync: aguarda o filho terminar antes de continuar; async: dispara e continua */
  mode: 'sync' | 'async';
  /** Se true, repassa solicitation, campos e variáveis do contexto pai para o filho */
  passContext: boolean;
  label?: string;
}

/**
 * Quem recebe a notificação. Cada item vira zero, um ou vários destinatários na hora da execução;
 * o que não puder ser resolvido (ex.: solicitação sem responsável) vira um destinatário `failed`
 * rastreável — nunca some em silêncio.
 */
export type NotificationRecipientSpec =
  /** Usuários do sistema escolhidos no editor (não duplica o dado deles: guarda só o id). */
  | { type: 'users'; userIds: string[] }
  /** Solicitante da solicitação/submissão do contexto. */
  | { type: 'requester' }
  /** Responsável (assignee) da solicitação do contexto. */
  | { type: 'responsible' }
  /** E-mail(s)/telefone(s) fixos, separados por vírgula; aceita {{variáveis}}. */
  | { type: 'custom'; value: string }
  /** Valor de um campo do formulário (e-mail/telefone, ou lista separada por vírgula). */
  | { type: 'field'; fieldCode: string }
  /** Dot-path em ctx.metadata.payload (lista/CSV de e-mails ou telefones) — mesmo padrão de approversPath. */
  | { type: 'payload_path'; path: string };

/**
 * Nó “Notificação”: uma notificação num canal (`in_app`, `email`, `whatsapp`) para um ou mais
 * destinatários, com conteúdo em **texto puro** e variáveis `{{...}}` (passada única, sem HTML).
 *
 * Como roda: o nó persiste a notificação (caixa de saída, idempotente por execução+nó) e
 *  - **immediate** (padrão): envia na hora e o fluxo espera o resultado da primeira tentativa;
 *  - **background** (ou `delayMinutes` > 0): só enfileira — o worker envia depois e o fluxo segue.
 * Falha **permanente** (destinatário inválido, canal não configurado, 4xx) falha o nó; falha
 * **transitória** (rede, 5xx, 429) é retentada em background e não para o fluxo. Com
 * `continueOnFailure`, o motor segue para os próximos nós mesmo com o nó em `failed` (a falha
 * continua registrada na execução e em `notification_*`).
 *
 * No teste manual do fluxo o nó roda em *dry-run*: valida, resolve e renderiza, mas não envia.
 */
export interface ActionNotificationData {
  label?: string;
  channel: NotificationChannelId;
  recipients: NotificationRecipientSpec[];
  /** Assunto (e-mail) / título (in_app) / linha em negrito (WhatsApp). Obrigatório no e-mail. */
  title?: string;
  /** Corpo; aceita {{variáveis}}. */
  content: string;
  priority?: NotificationPriority;
  /** Atrasa o envio (0–10080 min = 7 dias). > 0 implica background. */
  delayMinutes?: number;
  deliveryMode?: 'immediate' | 'background';
  /** Se true, uma falha do nó não interrompe os nós seguintes. Padrão: false. */
  continueOnFailure?: boolean;
  /**
   * Destinatário que não se resolve (ex.: solicitante sem contato numa solicitação criada por um
   * lote de webhook) é deixado de lado em vez de virar falha; sem nenhum que se resolva, o aviso é
   * pulado e o nó termina com sucesso. Padrão: false (sem contato = falha, como sempre foi).
   */
  skipUnresolvedRecipients?: boolean;
  retryPolicy?: { maxAttempts?: number; backoffSeconds?: number };
  /**
   * Chave de idempotência opcional ({{variáveis}}), por exemplo `aviso-{{solicitation_number}}`:
   * garante um único envio mesmo se o evento de origem for reentregue e gerar outra execução.
   * Sem ela, a chave é execução + nó.
   */
  idempotencyKeyTemplate?: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * O que uma execução real teria e o teste manual do fluxo não tem (ele só monta uma submissão com
 * os valores digitados): dados que o evento traria ou a resposta de uma chamada que o teste só
 * simulou. Ver FlowExecutionEngine.execute.
 */
export type TestRunAssumption =
  | 'solicitation'
  | 'approval'
  | 'attachment'
  | 'phase'
  | 'payload'
  | 'response';

export interface FlowExecutionContext {
  eventName: string;
  flowId?: string;
  flowExecutionId?: string;
  /**
   * Gatilho por onde esta execução entra no fluxo. Um fluxo pode ter vários gatilhos, cada um
   * ligado a um ponto diferente do grafo; ausente = o primeiro gatilho do fluxo.
   */
  entryNodeId?: string;
  // Origem: formulário/submissão
  submission?: SubmissionEntity;
  form?: FormEntity;
  fields?: Record<string, unknown>;
  /** Rótulo das respostas de escolha (código → rótulo), para os textos; `fields` fica com o valor. */
  fieldLabels?: Record<string, string>;
  // Origem: solicitação
  solicitation?: SolicitationEntity;
  // Origem: aprovação
  approval?: ApprovalEntity;
  // Só na retomada (resumeFrom): a aprovação recém-decidida que liberou a execução
  resumedFromApprovalId?: string;
  // Origem: anexo (trigger_attachment_uploaded) — a foto/arquivo que disparou o fluxo
  attachment?: AttachmentEntity;
  // Metadados livres para interpolação
  metadata?: Record<string, unknown>;
  // Dados do ator que disparou o evento
  actorId?: string;
  // Profundidade de eventos disparados por ações de fluxo, para evitar loops
  flowEventDepth?: number;
  // Pilha de IDs de fluxos em execução — previne recursão infinita em action_run_flow
  callStack?: string[];
  // Referências ao fluxo pai quando este contexto foi criado por action_run_flow
  parentFlowId?: string;
  parentExecutionId?: string;
  // Só no teste manual (metadata.testRun): o que a execução real teria e o teste não tem
  testRunAssumptions?: Set<TestRunAssumption>;
}
