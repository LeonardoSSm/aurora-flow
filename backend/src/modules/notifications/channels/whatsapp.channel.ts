import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppClientService } from '../../integrations/whatsapp/whatsapp-client.service';
import { CHANNEL_LIMITS } from '../domain/notification.limits';
import {
  NotificationChannelError,
  classifyError,
  maskAddress,
  sanitizeErrorMessage,
} from '../domain/notification-errors';
import { normalizeWhatsAppAddress } from './address.util';
import { allowMockProviders } from './channel-config';
import type {
  ChannelAvailability,
  ChannelRecipient,
  NotificationChannel,
  NotificationDeliveryRequest,
  NotificationDeliveryResult,
  RecipientValidation,
} from './notification-channel';

const DEFAULT_COUNTRY_CODE = '55';

/**
 * WhatsApp sobre `WhatsAppClientService` (Evolution API ou mock), no nível do **provedor** — não
 * usa `WhatsAppConnectorService`, que é amarrado a solicitações e persiste em `whatsapp_messages`
 * (o rastreio aqui é o de `notification_*`).
 *
 * - `sent` = o provedor aceitou (`sent` ou `queued`); recibos de entrega/leitura ficam para depois.
 * - Erros HTTP do provedor são classificados (429 → rate_limited, 5xx/rede → transitório,
 *   4xx → permanente) a partir do erro **original** (`sendOrThrow`).
 * - Provedor “mock” só é aceito fora de produção; `provider` fica gravado como `mock`.
 */
@Injectable()
export class WhatsAppChannel implements NotificationChannel {
  readonly id = 'whatsapp' as const;
  readonly limits = CHANNEL_LIMITS.whatsapp;
  private readonly logger = new Logger(WhatsAppChannel.name);

  constructor(
    private readonly client: WhatsAppClientService,
    private readonly config: ConfigService,
  ) {}

  describe(): ChannelAvailability {
    if (this.client.isAvailable()) {
      return { available: true, provider: this.providerName() };
    }
    return { available: false, provider: 'mock', reason: 'Provedor de WhatsApp não configurado.' };
  }

  validateRecipient(recipient: ChannelRecipient): RecipientValidation {
    const normalized = normalizeWhatsAppAddress(recipient.address, this.countryCode());
    if (!normalized) {
      return { valid: false, reason: 'Destinatário sem telefone ou grupo válido.' };
    }
    return { valid: true, normalizedAddress: normalized };
  }

  async send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResult> {
    const to = normalizeWhatsAppAddress(request.recipient.address, this.countryCode());
    if (!to) {
      throw new NotificationChannelError('Destinatário sem telefone ou grupo válido.', 'invalid_recipient');
    }

    const configured = this.client.isAvailable();
    if (!configured && !allowMockProviders(this.config)) {
      throw new NotificationChannelError(
        'Provedor de WhatsApp não configurado no servidor.',
        'not_configured',
      );
    }
    const provider = configured ? this.providerName() : 'mock';
    if (!configured) {
      this.logger.warn(
        { channel: 'whatsapp', provider, recipient: maskAddress(to) },
        'WhatsApp não configurado — usando provedor simulado',
      );
    }

    const message = request.title ? `*${request.title}*\n${request.body}` : request.body;

    let result;
    try {
      result = await this.client.sendOrThrow({ to, message });
    } catch (error) {
      throw classifyError(error);
    }

    if (result.status === 'failed') {
      throw new NotificationChannelError(
        sanitizeErrorMessage(result.error) || 'Provedor recusou a mensagem.',
        'permanent',
      );
    }
    // `queued` = o provedor aceitou e vai enviar: para o fluxo equivale a “aceita”.
    return { status: 'sent', provider, providerMessageId: result.messageId };
  }

  private providerName(): string {
    return (this.config.get<string>('WHATSAPP_PROVIDER', 'mock') ?? 'mock').trim().toLowerCase() || 'mock';
  }

  private countryCode(): string {
    const configured = this.config.get<string>('NOTIFICATIONS_DEFAULT_COUNTRY_CODE');
    return configured && /^\d{1,3}$/.test(configured.trim()) ? configured.trim() : DEFAULT_COUNTRY_CODE;
  }
}
