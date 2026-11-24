import type { ChannelLimits } from '../domain/notification.limits';
import type { NotificationChannelId, NotificationPriority } from '../domain/notification.types';

/** Quem vai receber, já resolvido: o canal escolhe o endereço que lhe serve (usuário, e-mail ou telefone). */
export interface ChannelRecipient {
  userId: string | null;
  displayName: string | null;
  address: string | null;
}

export interface RecipientValidation {
  valid: boolean;
  /** Motivo legível (sem dados pessoais) quando `valid` é falso. */
  reason?: string;
  /** Endereço normalizado (e-mail minúsculo, telefone só com dígitos e DDI). */
  normalizedAddress?: string | null;
}

export interface ChannelAvailability {
  /** `false` = o provedor real não está configurado (o adapter pode operar em modo simulado fora de produção). */
  available: boolean;
  provider: string;
  reason?: string;
}

export interface NotificationDeliveryRequest {
  notificationId: string;
  recipientId: string;
  attemptNumber: number;
  title: string | null;
  body: string;
  /**
   * Versão HTML pronta, montada pelo próprio sistema (nunca de modelo/variáveis digitadas) — só o
   * e-mail usa, e o `body` continua indo como texto puro. Ausente = o canal faz a sua versão.
   */
  html?: string | null;
  /** Caminho interno do app que o aviso abre (só o `in_app` usa). Vem de `metadata.link`. */
  link?: string | null;
  priority: NotificationPriority;
  recipient: ChannelRecipient;
}

export interface NotificationDeliveryResult {
  /** `sent` = o provedor aceitou; `delivered` só quando a entrega é comprovada (ex.: in_app). */
  status: 'sent' | 'delivered';
  provider: string;
  providerMessageId: string | null;
}

/**
 * Contrato de um canal de notificação. O domínio e o motor de fluxos só conhecem esta
 * interface — trocar de provedor (ex.: Evolution API → Meta Cloud API) significa trocar o adapter,
 * nunca o motor.
 *
 * `send` deve **lançar** `NotificationChannelError` (ou qualquer erro, que o dispatcher
 * classifica) quando o provedor não aceitar a mensagem; retornar significa “aceita”.
 */
export interface NotificationChannel {
  readonly id: NotificationChannelId;
  readonly limits: ChannelLimits;
  describe(): ChannelAvailability;
  validateRecipient(recipient: ChannelRecipient): RecipientValidation;
  send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResult>;
  /** Opcional: consulta o provedor sobre o estado de entrega (recibos) — fora do v1. */
  getStatus?(providerMessageId: string): Promise<'sent' | 'delivered' | 'failed' | 'unknown'>;
}

export const NOTIFICATION_CHANNELS_TOKEN = Symbol('NOTIFICATION_CHANNELS');
