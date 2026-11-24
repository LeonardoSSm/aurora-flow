import {
  NOTIFICATION_RECIPIENT_SUCCESS_STATUSES,
  NOTIFICATION_RECIPIENT_TERMINAL_STATUSES,
  type NotificationMessageStatus,
  type NotificationRecipientStatus,
} from './notification.types';

/**
 * Transições permitidas para um destinatário. É a única fonte da verdade do ciclo de vida —
 * o dispatcher e o serviço sempre passam por `assertRecipientTransition` antes de gravar.
 *
 *   scheduled ─┬─► processing ─┬─► sent ──► delivered
 *   pending ───┤               ├─► delivered
 *              └─► cancelled   ├─► pending   (falha transitória → nova tentativa)
 *                              └─► failed ──► pending (retentativa manual)
 *
 * `processing → cancelled` NÃO existe de propósito: uma tentativa em curso não pode ser
 * abortada (o provedor pode já ter aceitado a mensagem) — o cancelamento só alcança quem
 * ainda não foi reivindicado.
 */
const RECIPIENT_TRANSITIONS: Readonly<
  Record<NotificationRecipientStatus, readonly NotificationRecipientStatus[]>
> = {
  scheduled: ['processing', 'cancelled'],
  pending: ['processing', 'cancelled'],
  processing: ['sent', 'delivered', 'pending', 'failed'],
  sent: ['delivered'],
  delivered: [],
  failed: ['pending'],
  cancelled: [],
};

export class InvalidNotificationTransitionError extends Error {
  constructor(
    readonly from: NotificationRecipientStatus,
    readonly to: NotificationRecipientStatus,
  ) {
    super(`Transição de notificação inválida: ${from} → ${to}.`);
    this.name = 'InvalidNotificationTransitionError';
  }
}

export function canTransitionRecipient(
  from: NotificationRecipientStatus,
  to: NotificationRecipientStatus,
): boolean {
  return RECIPIENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertRecipientTransition(
  from: NotificationRecipientStatus,
  to: NotificationRecipientStatus,
): void {
  if (!canTransitionRecipient(from, to)) {
    throw new InvalidNotificationTransitionError(from, to);
  }
}

/**
 * Estado agregado da notificação a partir dos destinatários.
 *
 * Enquanto houver destinatário em andamento, vale o mais “ativo”
 * (processing > pending > scheduled). Quando todos estão em estado terminal:
 * só falhas → `failed`; só cancelados → `cancelled`; todos entregues → `delivered`;
 * todos aceitos → `sent`; qualquer mistura de sucesso com falha/cancelamento →
 * `partially_sent`.
 */
export function deriveMessageStatus(
  statuses: readonly NotificationRecipientStatus[],
): NotificationMessageStatus {
  if (statuses.length === 0) return 'failed';

  if (statuses.includes('processing')) return 'processing';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('scheduled')) return 'scheduled';

  // Todos terminais daqui em diante.
  const success = statuses.filter((s) => NOTIFICATION_RECIPIENT_SUCCESS_STATUSES.has(s)).length;
  const failed = statuses.filter((s) => s === 'failed').length;
  const cancelled = statuses.filter((s) => s === 'cancelled').length;

  if (success === 0) return failed > 0 ? 'failed' : 'cancelled';
  if (failed > 0 || cancelled > 0) return 'partially_sent';
  return statuses.every((s) => s === 'delivered') ? 'delivered' : 'sent';
}

export function isTerminalRecipientStatus(status: NotificationRecipientStatus): boolean {
  return NOTIFICATION_RECIPIENT_TERMINAL_STATUSES.has(status);
}

export function isTerminalMessageStatus(status: NotificationMessageStatus): boolean {
  return !['scheduled', 'pending', 'processing'].includes(status);
}
