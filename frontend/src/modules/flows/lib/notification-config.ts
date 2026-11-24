import type {
  FlowNodeData,
  NotificationChannel,
  NotificationRecipientSpec,
} from '../types/flow.types';

/**
 * Regras do nó "Notificação" no editor — espelham (sem duplicar a lógica de envio) a validação do
 * backend em `notification-node.validation.ts`, para o usuário ver o problema antes de salvar. O
 * backend continua sendo a autoridade: ele revalida ao salvar e ao ativar.
 */

export const NOTIFICATION_CHANNELS: ReadonlyArray<{
  id: NotificationChannel;
  label: string;
  hint: string;
  titleLabel: string;
  titleRequired: boolean;
  /** Limite do corpo já renderizado (mesmos valores do backend). */
  bodyMax: number;
  titleMax: number;
}> = [
  {
    id: 'in_app',
    label: 'Notificação no sistema',
    hint: 'Aparece no sino do topo para o usuário. Entrega comprovada.',
    titleLabel: 'Título',
    titleRequired: false,
    bodyMax: 500,
    titleMax: 150,
  },
  {
    id: 'email',
    label: 'E-mail',
    hint: 'Enviado por SMTP. “Enviado” significa aceito pelo servidor de e-mail.',
    titleLabel: 'Assunto',
    titleRequired: true,
    bodyMax: 20000,
    titleMax: 200,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    hint: 'Enviado pelo provedor de WhatsApp. O telefone vem do solicitante/responsável ou é informado; também aceita um grupo.',
    titleLabel: 'Título (aparece em negrito)',
    titleRequired: false,
    bodyMax: 4000,
    titleMax: 100,
  },
];

export const RECIPIENT_TYPES: ReadonlyArray<{
  type: NotificationRecipientSpec['type'];
  label: string;
}> = [
  { type: 'users', label: 'Usuários do sistema' },
  { type: 'requester', label: 'Solicitante' },
  { type: 'responsible', label: 'Responsável da solicitação' },
  { type: 'custom', label: 'E-mail / telefone / grupo fixo' },
  { type: 'field', label: 'Campo do formulário' },
  { type: 'payload_path', label: 'Caminho no payload (webhook)' },
];

export const MAX_TEMPLATE_LENGTH = 4000;
export const MAX_TITLE_TEMPLATE_LENGTH = 300;
export const MAX_DELAY_MINUTES = 7 * 24 * 60;
export const MAX_RECIPIENTS = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;
const EMAIL_RE = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;

export function channelInfo(channel: unknown) {
  return NOTIFICATION_CHANNELS.find((c) => c.id === channel);
}

/** `true` se há `{{` que não pertence a uma variável bem formada. */
export function hasMalformedTokens(text: string): boolean {
  const opens = (text.match(/\{\{/g) ?? []).length;
  const wellFormed = (text.match(TOKEN_RE) ?? []).length;
  return opens !== wellFormed;
}

/** JID de grupo do WhatsApp — mesma regra do backend (notifications/channels/address.util.ts). */
const WHATSAPP_GROUP_JID_RE = /^\d{10,30}(?:-\d{6,15})?@g\.us$/;

export function isWhatsAppGroupJid(raw: string): boolean {
  return WHATSAPP_GROUP_JID_RE.test(raw.trim().toLowerCase());
}

function normalizePhone(raw: string): string | null {
  const text = raw.trim();
  const hasPlus = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (!hasPlus) digits = digits.replace(/^0+/, '');
  if (!digits) return null;
  if (!hasPlus && digits.length <= 11) digits = `55${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function recipientError(
  spec: NotificationRecipientSpec,
  channel: NotificationChannel | undefined,
): string | null {
  switch (spec.type) {
    case 'users':
      if (!Array.isArray(spec.userIds) || spec.userIds.length === 0) return 'Selecione ao menos um usuário.';
      if (!spec.userIds.every((id) => UUID_RE.test(id))) return 'Há usuários inválidos na seleção.';
      return null;
    case 'requester':
    case 'responsible':
      return null;
    case 'custom': {
      const value = String(spec.value ?? '').trim();
      if (!value) return 'Informe o valor.';
      if (hasMalformedTokens(value)) return 'Variável mal formada (use {{nome}}).';
      if (value.includes('{{')) return null; // valor dinâmico: só dá para validar o formato na execução
      const parts = splitList(value);
      if (channel === 'email' && !parts.every((p) => EMAIL_RE.test(p.toLowerCase()))) return 'E-mail inválido.';
      if (channel === 'whatsapp' && !parts.every((p) => isWhatsAppGroupJid(p) || normalizePhone(p))) {
        return 'Telefone ou grupo inválido.';
      }
      return null;
    }
    case 'field':
      return String(spec.fieldCode ?? '').trim() ? null : 'Escolha o campo.';
    case 'payload_path':
      return String(spec.path ?? '').trim() ? null : 'Informe o caminho (ex.: header.emails).';
    default:
      return 'Tipo de destinatário inválido.';
  }
}

export function countStaticRecipients(recipients: NotificationRecipientSpec[]): number {
  let total = 0;
  for (const spec of recipients) {
    if (spec.type === 'users') total += spec.userIds?.length ?? 0;
    else if (spec.type === 'custom') total += String(spec.value ?? '').includes('{{') ? 1 : Math.max(1, splitList(String(spec.value ?? '')).length);
    else total += 1;
  }
  return total;
}

export interface NotificationConfigIssue {
  /** Onde o problema aparece no formulário. */
  field: 'channel' | 'recipients' | 'title' | 'content' | 'delayMinutes' | 'retryPolicy' | 'idempotencyKeyTemplate' | 'general';
  message: string;
}

/** Todos os problemas de configuração do nó (vazio = válido), em linguagem do usuário. */
export function getNotificationConfigIssues(d: FlowNodeData): NotificationConfigIssue[] {
  const issues: NotificationConfigIssue[] = [];
  const channel = channelInfo(d.channel);
  if (!channel) {
    issues.push({ field: 'channel', message: 'Escolha o canal da notificação.' });
  }

  const content = String(d.content ?? '');
  if (!content.trim()) issues.push({ field: 'content', message: 'A mensagem não pode estar vazia.' });
  else if (content.length > MAX_TEMPLATE_LENGTH)
    issues.push({ field: 'content', message: `A mensagem excede ${MAX_TEMPLATE_LENGTH} caracteres.` });
  else if (hasMalformedTokens(content))
    issues.push({ field: 'content', message: 'A mensagem tem uma variável mal formada (use {{nome}}).' });

  const title = String(d.title ?? '');
  if (channel?.titleRequired && !title.trim())
    issues.push({ field: 'title', message: `Informe o ${channel.titleLabel.toLowerCase()}.` });
  if (title.length > MAX_TITLE_TEMPLATE_LENGTH)
    issues.push({ field: 'title', message: `O título excede ${MAX_TITLE_TEMPLATE_LENGTH} caracteres.` });
  else if (hasMalformedTokens(title))
    issues.push({ field: 'title', message: 'O título tem uma variável mal formada (use {{nome}}).' });

  const recipients = Array.isArray(d.recipients) ? d.recipients : [];
  if (recipients.length === 0) {
    issues.push({ field: 'recipients', message: 'Adicione ao menos um destinatário.' });
  } else {
    recipients.forEach((spec, index) => {
      const error = recipientError(spec, d.channel);
      if (error) issues.push({ field: 'recipients', message: `Destinatário ${index + 1}: ${error}` });
    });
    if (countStaticRecipients(recipients) > MAX_RECIPIENTS)
      issues.push({ field: 'recipients', message: `No máximo ${MAX_RECIPIENTS} destinatários por notificação.` });
  }

  if (d.delayMinutes !== undefined) {
    const delay = Number(d.delayMinutes);
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY_MINUTES)
      issues.push({ field: 'delayMinutes', message: `O atraso deve ser de 0 a ${MAX_DELAY_MINUTES} minutos.` });
  }

  const policy = d.retryPolicy;
  if (policy?.maxAttempts !== undefined) {
    const n = Number(policy.maxAttempts);
    if (!Number.isInteger(n) || n < 1 || n > 5)
      issues.push({ field: 'retryPolicy', message: 'As tentativas devem ser de 1 a 5.' });
  }
  if (policy?.backoffSeconds !== undefined) {
    const n = Number(policy.backoffSeconds);
    if (!Number.isInteger(n) || n < 5 || n > 3600)
      issues.push({ field: 'retryPolicy', message: 'O intervalo entre tentativas deve ser de 5 a 3600 segundos.' });
  }

  const key = String(d.idempotencyKeyTemplate ?? '');
  if (key.length > 200) issues.push({ field: 'idempotencyKeyTemplate', message: 'A chave excede 200 caracteres.' });
  else if (key && hasMalformedTokens(key))
    issues.push({ field: 'idempotencyKeyTemplate', message: 'A chave tem uma variável mal formada.' });

  return issues;
}

export function getNotificationConfigError(d: FlowNodeData): string | null {
  return getNotificationConfigIssues(d)[0]?.message ?? null;
}

/** Texto curto do cartão no canvas: “E-mail · 2 destinatários”. */
export function summarizeNotification(d: FlowNodeData): string {
  const channel = channelInfo(d.channel);
  const recipients = Array.isArray(d.recipients) ? d.recipients : [];
  if (!channel || recipients.length === 0) return 'Configurar...';
  const count = countStaticRecipients(recipients);
  const who = `${count} destinatário${count === 1 ? '' : 's'}`;
  const delay = Number(d.delayMinutes ?? 0);
  const when = delay > 0 ? ` · em ${formatDelay(delay)}` : d.deliveryMode === 'background' ? ' · em segundo plano' : '';
  return `${channel.label} · ${who}${when}`;
}

export function formatDelay(minutes: number): string {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} d`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Variáveis embutidas (mesmos nomes do backend: BUILTIN_FLOW_VARIABLES). */
export const NOTIFICATION_BUILTIN_VARIABLES: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'form_name', label: 'Nome do formulário' },
  { name: 'responder_name', label: 'Nome do respondente' },
  { name: 'responder_email', label: 'E-mail do respondente' },
  { name: 'submitted_at', label: 'Data de envio' },
  { name: 'solicitation_number', label: 'Número da solicitação' },
  { name: 'solicitation_title', label: 'Título da solicitação' },
  { name: 'solicitation_status', label: 'Status da solicitação' },
  { name: 'solicitation_priority', label: 'Prioridade da solicitação' },
  { name: 'solicitation_requester_name', label: 'Solicitante' },
  { name: 'solicitation_requester_email', label: 'E-mail do solicitante' },
  { name: 'solicitation_responsible_name', label: 'Responsável' },
  { name: 'tracking_url', label: 'Link de acompanhamento' },
  { name: 'approval_link', label: 'Link de aprovação' },
  { name: 'approval_status', label: 'Resultado da aprovação' },
  { name: 'approval_title', label: 'Título da aprovação' },
  { name: 'approval_description', label: 'Descrição da aprovação' },
];
