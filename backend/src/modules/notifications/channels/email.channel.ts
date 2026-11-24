import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowMailerService } from '../../flows/mailer/flow-mailer.service';
import { CHANNEL_LIMITS } from '../domain/notification.limits';
import {
  NotificationChannelError,
  classifyError,
  maskAddress,
} from '../domain/notification-errors';
import { escapeHtml, toSingleLine } from '../domain/notification-template';
import {
  type EmailInlineAttachment,
  emailImageIdOfCid,
  inlineImagesFor,
  referencedCids,
} from '../email-assets/email-inline-images';
import { EmailImagesService } from '../email-images/email-images.service';
import { normalizeEmailAddress } from './address.util';
import { allowMockProviders } from './channel-config';
import type {
  ChannelAvailability,
  ChannelRecipient,
  NotificationChannel,
  NotificationDeliveryRequest,
  NotificationDeliveryResult,
  RecipientValidation,
} from './notification-channel';

const DEFAULT_SUBJECT = 'Notificação';
const FALLBACK_MESSAGE_ID_DOMAIN = 'formhub.local';

/**
 * E-mail via SMTP (nodemailer, reaproveitando `FlowMailerService`).
 *
 * - O conteúdo é **texto puro**: o HTML enviado é o texto escapado dentro de um `<div>` — nada do
 *   modelo ou das variáveis vira marcação (sem injeção de HTML/links).
 * - `sent` = o servidor SMTP aceitou o destinatário. Não há recibo de entrega no v1.
 * - Sem SMTP: em desenvolvimento só registra (`provider: 'log'`); em produção **falha**
 *   (`not_configured`) — nunca marca como enviado.
 * - O `Message-ID` é estável por destinatário, o que ajuda servidores/clientes a descartar
 *   duplicatas em caso de reenvio após falha ambígua.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly id = 'email' as const;
  readonly limits = CHANNEL_LIMITS.email;
  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    private readonly mailer: FlowMailerService,
    private readonly config: ConfigService,
    private readonly emailImages: EmailImagesService,
  ) {}

  /**
   * Imagens que o HTML pronto do sistema referencia por cid: as que vêm com o sistema e as enviadas
   * pela tela (banco). Imagem que não existe mais fica de fora — o e-mail sai com o fundo de cor.
   */
  private async inlineAttachments(html: string): Promise<EmailInlineAttachment[]> {
    const uploaded = await Promise.all(
      referencedCids(html).map(async (cid): Promise<EmailInlineAttachment | null> => {
        const id = emailImageIdOfCid(cid);
        const image = id ? await this.emailImages.getContent(id) : null;
        if (!image) return null;
        const ext = image.mimeType === 'image/png' ? 'png' : 'jpg';
        return { cid, filename: `imagem.${ext}`, contentType: image.mimeType, content: image.content };
      }),
    );
    return [...inlineImagesFor(html), ...uploaded.filter((image): image is EmailInlineAttachment => image !== null)];
  }

  describe(): ChannelAvailability {
    return this.mailer.isConfigured()
      ? { available: true, provider: 'smtp' }
      : { available: false, provider: 'log', reason: 'SMTP não configurado.' };
  }

  validateRecipient(recipient: ChannelRecipient): RecipientValidation {
    const normalized = normalizeEmailAddress(recipient.address);
    if (!normalized) {
      return { valid: false, reason: 'Destinatário sem e-mail válido.' };
    }
    return { valid: true, normalizedAddress: normalized };
  }

  async send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResult> {
    const to = normalizeEmailAddress(request.recipient.address);
    if (!to) {
      throw new NotificationChannelError('Destinatário sem e-mail válido.', 'invalid_recipient');
    }

    if (!this.mailer.isConfigured()) {
      if (!allowMockProviders(this.config)) {
        throw new NotificationChannelError('SMTP não configurado no servidor.', 'not_configured');
      }
      this.logger.warn(
        { channel: 'email', provider: 'log', recipient: maskAddress(to) },
        'SMTP não configurado — notificação apenas registrada (modo simulado)',
      );
      return { status: 'sent', provider: 'log', providerMessageId: null };
    }

    const subject = toSingleLine(request.title ?? '') || DEFAULT_SUBJECT;
    // HTML pronto do sistema (ex.: aviso de pontuação) quando houver; senão, o texto escapado.
    const html =
      request.html ??
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;white-space:pre-wrap">${escapeHtml(request.body)}</div>`;

    // Só o HTML pronto do sistema referencia imagens (cid:); o texto escapado nunca tem.
    const attachments = request.html ? await this.inlineAttachments(request.html) : [];

    let result;
    try {
      result = await this.mailer.sendDetailed({
        to: [to],
        subject: subject.slice(0, this.limits.titleMax),
        text: request.body,
        html,
        messageId: this.buildMessageId(request.recipientId),
        attachments,
      });
    } catch (error) {
      throw classifyError(error);
    }

    if (result.rejected.length > 0 && result.accepted.length === 0) {
      throw new NotificationChannelError(
        'Endereço de e-mail recusado pelo servidor SMTP.',
        'invalid_recipient',
      );
    }
    return { status: 'sent', provider: 'smtp', providerMessageId: result.messageId };
  }

  private buildMessageId(recipientId: string): string {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '';
    const domain = /@([A-Za-z0-9.-]+)>?\s*$/.exec(from)?.[1] ?? FALLBACK_MESSAGE_ID_DOMAIN;
    return `<notification-${recipientId}@${domain}>`;
  }
}
