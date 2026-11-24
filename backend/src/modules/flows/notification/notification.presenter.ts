import type {
  NotificationAttemptEntity,
  NotificationMessageEntity,
  NotificationRecipientEntity,
} from '../../../database/entities';
import { maskAddress } from '../../notifications/domain/notification-errors';

export interface NotificationAttemptView {
  attemptNumber: number;
  status: string;
  provider: string | null;
  errorCategory: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}

export interface NotificationRecipientView {
  id: string;
  source: string;
  userId: string | null;
  /** Nome e endereço completos só com `flows.manage`; caso contrário, nome omitido e endereço mascarado. */
  displayName: string | null;
  address: string | null;
  status: string;
  attemptCount: number;
  provider: string | null;
  providerMessageId: string | null;
  lastErrorCategory: string | null;
  lastError: string | null;
  nextAttemptAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  attempts?: NotificationAttemptView[];
}

export interface NotificationMessageView {
  id: string;
  channel: string;
  status: string;
  priority: string;
  /** Título e corpo só com `flows.manage`. */
  title: string | null;
  body: string | null;
  scheduledFor: Date | null;
  flowId: string | null;
  flowExecutionId: string | null;
  nodeId: string | null;
  solicitationId: string | null;
  maxAttempts: number;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  missingVariables: string[];
  recipients: NotificationRecipientView[];
}

function toAttemptView(attempt: NotificationAttemptEntity): NotificationAttemptView {
  return {
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    provider: attempt.provider,
    errorCategory: attempt.errorCategory,
    errorMessage: attempt.errorMessage,
    httpStatus: attempt.httpStatus,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    durationMs: attempt.durationMs,
  };
}

function toRecipientView(
  recipient: NotificationRecipientEntity,
  canViewDetails: boolean,
): NotificationRecipientView {
  return {
    id: recipient.id,
    source: recipient.source,
    userId: recipient.userId,
    displayName: canViewDetails ? recipient.displayName : null,
    address: canViewDetails ? recipient.address : maskAddress(recipient.address) || null,
    status: recipient.status,
    attemptCount: recipient.attemptCount,
    provider: recipient.provider,
    providerMessageId: canViewDetails ? recipient.providerMessageId : null,
    lastErrorCategory: recipient.lastErrorCategory,
    lastError: recipient.lastError,
    nextAttemptAt: recipient.nextAttemptAt,
    sentAt: recipient.sentAt,
    deliveredAt: recipient.deliveredAt,
    failedAt: recipient.failedAt,
    cancelledAt: recipient.cancelledAt,
    ...(recipient.attempts ? { attempts: [...recipient.attempts].sort((a, b) => a.attemptNumber - b.attemptNumber).map(toAttemptView) } : {}),
  };
}

/**
 * Projeção de leitura para a API. Nunca devolve a entidade crua: quem só pode ver o fluxo
 * (`flows.view`) recebe estados e erros, com endereços mascarados e **sem** conteúdo; quem pode
 * gerenciar (`flows.manage`) vê conteúdo e endereços completos.
 */
export function toNotificationView(
  message: NotificationMessageEntity,
  options: { canViewDetails: boolean },
): NotificationMessageView {
  const missing = message.metadata?.missingVariables;
  return {
    id: message.id,
    channel: message.channel,
    status: message.status,
    priority: message.priority,
    title: options.canViewDetails ? message.title : null,
    body: options.canViewDetails ? message.body : null,
    scheduledFor: message.scheduledFor,
    flowId: message.flowId,
    flowExecutionId: message.flowExecutionId,
    nodeId: message.nodeId,
    solicitationId: message.solicitationId,
    maxAttempts: message.maxAttempts,
    createdAt: message.createdAt,
    completedAt: message.completedAt,
    cancelledAt: message.cancelledAt,
    missingVariables: Array.isArray(missing) ? missing.filter((m): m is string => typeof m === 'string') : [],
    recipients: [...(message.recipients ?? [])]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((recipient) => toRecipientView(recipient, options.canViewDetails)),
  };
}
