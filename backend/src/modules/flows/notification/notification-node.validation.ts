import { normalizeEmailAddress, normalizeWhatsAppAddress } from '../../notifications/channels/address.util';
import {
  DEFAULT_MAX_RECIPIENTS_PER_NOTIFICATION,
  MAX_DELAY_MINUTES,
  MAX_IDEMPOTENCY_TEMPLATE_LENGTH,
  MAX_TEMPLATE_LENGTH,
  MAX_TITLE_TEMPLATE_LENGTH,
} from '../../notifications/domain/notification.limits';
import { hasMalformedTokens } from '../../notifications/domain/notification-template';
import {
  MAX_ATTEMPTS_LIMIT,
  MAX_BACKOFF_SECONDS,
  MIN_ATTEMPTS,
  MIN_BACKOFF_SECONDS,
} from '../../notifications/domain/notification-retry';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  type NotificationChannelId,
} from '../../notifications/domain/notification.types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECIPIENT_TYPES = ['users', 'requester', 'responsible', 'custom', 'field', 'payload_path'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

/** `true` se o texto é um valor fixo (sem {{variável}}) — só então dá para validar o formato. */
function isStaticText(value: string): boolean {
  return !value.includes('{{');
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Validação **estática** da configuração do nó `action_notification` — função pura, usada na
 * gravação do fluxo (`FlowsService.validateNodeData`) e reaproveitada pelo executor em runtime.
 * Devolve todas as mensagens de erro (vazio = configuração válida).
 */
export function getNotificationNodeErrors(
  data: Record<string, unknown> | null | undefined,
  options: { maxRecipients?: number } = {},
): string[] {
  const errors: string[] = [];
  const d = data ?? {};
  const maxRecipients = options.maxRecipients ?? DEFAULT_MAX_RECIPIENTS_PER_NOTIFICATION;

  const channel = d.channel as NotificationChannelId | undefined;
  const channelOk = typeof channel === 'string' && (NOTIFICATION_CHANNELS as readonly string[]).includes(channel);
  if (!channelOk) {
    errors.push(`requer channel válido (${NOTIFICATION_CHANNELS.join(', ')}).`);
  }

  // ── Conteúdo ────────────────────────────────────────────────────────────────────
  if (!isNonEmptyString(d.content)) {
    errors.push('requer content.');
  } else {
    if (d.content.length > MAX_TEMPLATE_LENGTH) {
      errors.push(`content excede ${MAX_TEMPLATE_LENGTH} caracteres.`);
    }
    if (hasMalformedTokens(d.content)) {
      errors.push('content tem variável mal formada (use {{nome}}).');
    }
  }
  if (d.title !== undefined && d.title !== null) {
    if (typeof d.title !== 'string') {
      errors.push('title deve ser texto.');
    } else {
      if (d.title.length > MAX_TITLE_TEMPLATE_LENGTH) {
        errors.push(`title excede ${MAX_TITLE_TEMPLATE_LENGTH} caracteres.`);
      }
      if (hasMalformedTokens(d.title)) errors.push('title tem variável mal formada (use {{nome}}).');
    }
  }
  if (channel === 'email' && !isNonEmptyString(d.title)) {
    errors.push('requer title (assunto do e-mail).');
  }

  // ── Destinatários ───────────────────────────────────────────────────────────────
  if (!Array.isArray(d.recipients) || d.recipients.length === 0) {
    errors.push('requer ao menos um destinatário em recipients.');
  } else {
    let staticCount = 0;
    d.recipients.forEach((raw, index) => {
      const where = `recipients[${index}]`;
      const spec = raw as Record<string, unknown> | null;
      if (!spec || typeof spec !== 'object' || !RECIPIENT_TYPES.includes(String(spec.type))) {
        errors.push(`${where} tem type inválido (${RECIPIENT_TYPES.join(', ')}).`);
        return;
      }
      switch (spec.type) {
        case 'users': {
          const ids = spec.userIds;
          if (!Array.isArray(ids) || ids.length === 0) {
            errors.push(`${where} requer userIds não vazio.`);
          } else if (!ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
            errors.push(`${where} tem userIds inválidos.`);
          } else {
            staticCount += ids.length;
          }
          break;
        }
        case 'requester':
        case 'responsible':
          staticCount += 1;
          break;
        case 'custom': {
          if (!isNonEmptyString(spec.value)) {
            errors.push(`${where} requer value.`);
            break;
          }
          if (hasMalformedTokens(spec.value)) {
            errors.push(`${where} tem variável mal formada.`);
            break;
          }
          if (isStaticText(spec.value)) {
            const parts = splitList(spec.value);
            staticCount += parts.length;
            if (channel === 'email' && !parts.every((p) => normalizeEmailAddress(p))) {
              errors.push(`${where} tem e-mail inválido.`);
            }
            if (channel === 'whatsapp' && !parts.every((p) => normalizeWhatsAppAddress(p))) {
              errors.push(`${where} tem telefone ou grupo inválido.`);
            }
          } else {
            staticCount += 1;
          }
          break;
        }
        case 'field':
          if (!isNonEmptyString(spec.fieldCode) || spec.fieldCode.length > 120) {
            errors.push(`${where} requer fieldCode.`);
          }
          staticCount += 1;
          break;
        case 'payload_path':
          if (!isNonEmptyString(spec.path) || spec.path.length > 200) {
            errors.push(`${where} requer path.`);
          }
          staticCount += 1;
          break;
      }
    });
    if (staticCount > maxRecipients) {
      errors.push(`excede o limite de ${maxRecipients} destinatários por notificação.`);
    }
  }

  // ── Opções ──────────────────────────────────────────────────────────────────────
  if (d.priority !== undefined && !(NOTIFICATION_PRIORITIES as readonly string[]).includes(String(d.priority))) {
    errors.push(`priority inválida (${NOTIFICATION_PRIORITIES.join(', ')}).`);
  }
  if (d.delayMinutes !== undefined && !isIntegerInRange(d.delayMinutes, 0, MAX_DELAY_MINUTES)) {
    errors.push(`delayMinutes deve ser inteiro entre 0 e ${MAX_DELAY_MINUTES}.`);
  }
  if (d.deliveryMode !== undefined && d.deliveryMode !== 'immediate' && d.deliveryMode !== 'background') {
    errors.push("deliveryMode deve ser 'immediate' ou 'background'.");
  }
  if (d.continueOnFailure !== undefined && typeof d.continueOnFailure !== 'boolean') {
    errors.push('continueOnFailure deve ser booleano.');
  }
  if (d.skipUnresolvedRecipients !== undefined && typeof d.skipUnresolvedRecipients !== 'boolean') {
    errors.push('skipUnresolvedRecipients deve ser booleano.');
  }
  if (d.retryPolicy !== undefined) {
    const policy = d.retryPolicy as Record<string, unknown> | null;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      errors.push('retryPolicy inválida.');
    } else {
      if (policy.maxAttempts !== undefined && !isIntegerInRange(policy.maxAttempts, MIN_ATTEMPTS, MAX_ATTEMPTS_LIMIT)) {
        errors.push(`retryPolicy.maxAttempts deve ser inteiro entre ${MIN_ATTEMPTS} e ${MAX_ATTEMPTS_LIMIT}.`);
      }
      if (
        policy.backoffSeconds !== undefined &&
        !isIntegerInRange(policy.backoffSeconds, MIN_BACKOFF_SECONDS, MAX_BACKOFF_SECONDS)
      ) {
        errors.push(
          `retryPolicy.backoffSeconds deve ser inteiro entre ${MIN_BACKOFF_SECONDS} e ${MAX_BACKOFF_SECONDS}.`,
        );
      }
    }
  }
  if (d.idempotencyKeyTemplate !== undefined && d.idempotencyKeyTemplate !== null && d.idempotencyKeyTemplate !== '') {
    if (typeof d.idempotencyKeyTemplate !== 'string') {
      errors.push('idempotencyKeyTemplate deve ser texto.');
    } else {
      if (d.idempotencyKeyTemplate.length > MAX_IDEMPOTENCY_TEMPLATE_LENGTH) {
        errors.push(`idempotencyKeyTemplate excede ${MAX_IDEMPOTENCY_TEMPLATE_LENGTH} caracteres.`);
      }
      if (hasMalformedTokens(d.idempotencyKeyTemplate)) {
        errors.push('idempotencyKeyTemplate tem variável mal formada.');
      }
    }
  }

  return errors;
}
