/**
 * Vocabulário do módulo de notificações — compartilhado por entidades, serviços, canais e pelo nó
 * `action_notification` do motor de fluxos. Sem dependências de framework.
 */

/**
 * Canais com infraestrutura real hoje: caixa de entrada interna (`notifications`), SMTP e
 * WhatsApp (Evolution API). Push (Expo) e SMS ficam fora do v1 — ver Docs/modulo_notificacoes.md.
 */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'whatsapp'] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_PRIORITIES = ['low', 'normal', 'high'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** Menor número = atendido primeiro pelo worker. */
export const NOTIFICATION_PRIORITY_RANK: Record<NotificationPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/**
 * Estado de cada destinatário (a unidade real de entrega).
 *
 * - `scheduled`  → primeira tentativa marcada para o futuro (atraso configurado no nó)
 * - `pending`    → pronto para tentar (inclui “aguardando retentativa”, com attempt_count > 0)
 * - `processing` → reivindicado por um worker/despacho
 * - `sent`       → o provedor **aceitou** a mensagem (não prova entrega ao destino final)
 * - `delivered`  → entrega comprovada (hoje só `in_app`: a linha existe na caixa do usuário)
 * - `failed`     → falha permanente ou tentativas esgotadas
 * - `cancelled`  → cancelado antes de ser enviado
 */
export const NOTIFICATION_RECIPIENT_STATUSES = [
  'scheduled',
  'pending',
  'processing',
  'sent',
  'delivered',
  'failed',
  'cancelled',
] as const;
export type NotificationRecipientStatus = (typeof NOTIFICATION_RECIPIENT_STATUSES)[number];

/** Estado agregado da notificação, derivado dos destinatários (ver `deriveMessageStatus`). */
export const NOTIFICATION_MESSAGE_STATUSES = [
  'scheduled',
  'pending',
  'processing',
  'sent',
  'delivered',
  'partially_sent',
  'failed',
  'cancelled',
] as const;
export type NotificationMessageStatus = (typeof NOTIFICATION_MESSAGE_STATUSES)[number];

export const NOTIFICATION_ATTEMPT_STATUSES = ['started', 'success', 'failed', 'abandoned'] as const;
export type NotificationAttemptStatus = (typeof NOTIFICATION_ATTEMPT_STATUSES)[number];

/** De onde veio o destinatário (rastreabilidade — não duplica o dado do usuário). */
export const NOTIFICATION_RECIPIENT_SOURCES = [
  'user',
  'requester',
  'responsible',
  'custom',
  'field',
  'payload_path',
] as const;
export type NotificationRecipientSource = (typeof NOTIFICATION_RECIPIENT_SOURCES)[number];

/**
 * Categorias de erro (sanitizadas, sem conteúdo do provedor). Decidem a retentativa:
 * `transient`, `rate_limited`, `timeout` e `unknown` são retentadas; as demais não.
 */
export const NOTIFICATION_ERROR_CATEGORIES = [
  'transient',
  'rate_limited',
  'timeout',
  'permanent',
  'invalid_recipient',
  'not_configured',
  'unknown',
] as const;
export type NotificationErrorCategory = (typeof NOTIFICATION_ERROR_CATEGORIES)[number];

export const RETRYABLE_ERROR_CATEGORIES: ReadonlySet<NotificationErrorCategory> = new Set([
  'transient',
  'rate_limited',
  'timeout',
  'unknown',
]);

export const NOTIFICATION_RECIPIENT_TERMINAL_STATUSES: ReadonlySet<NotificationRecipientStatus> =
  new Set(['sent', 'delivered', 'failed', 'cancelled']);

/** Estados de sucesso de entrega (o provedor aceitou ou a entrega foi comprovada). */
export const NOTIFICATION_RECIPIENT_SUCCESS_STATUSES: ReadonlySet<NotificationRecipientStatus> =
  new Set(['sent', 'delivered']);
