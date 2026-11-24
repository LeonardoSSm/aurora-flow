import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class FlowMailerService {
  private readonly logger = new Logger(FlowMailerService.name);
  private readonly transporter: Transporter | null = null;

  constructor() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      const port = Number(SMTP_PORT ?? 587);
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      this.logger.log(`FlowMailer configurado: ${SMTP_HOST}:${port}`);
    } else {
      this.logger.warn('SMTP não configurado — ação send_email irá pular o envio real.');
    }
  }

  /** `false` quando o SMTP não está configurado (então `send` apenas registra e pula o envio). */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Envio com resultado explícito, usado pelo módulo de notificações: ao contrário de `send`,
   * **não** finge sucesso sem SMTP (lança) e devolve o `Message-ID` e os endereços aceitos/recusados
   * pelo servidor — é o que permite distinguir “aceito pelo provedor” de “criei o registro”.
   */
  async sendDetailed(message: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    messageId?: string;
    /** Imagens embutidas, referenciadas no HTML por cid: (ex.: a arte de fundo do aviso) — do disco ou do banco. */
    attachments?: Array<{ filename: string; contentType: string; cid: string } & ({ path: string } | { content: Buffer })>;
  }): Promise<{ messageId: string | null; accepted: string[]; rejected: string[] }> {
    if (!this.transporter) {
      throw new Error('SMTP não configurado.');
    }
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const info = await this.transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: message.messageId,
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    });
    return {
      messageId: typeof info.messageId === 'string' ? info.messageId : null,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    };
  }

  async send(to: string[], subject: string, body: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[FlowMailer] Sem SMTP — pulando envio para: ${to.join(', ')}`);
      return;
    }
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    await this.transporter.sendMail({ from, to, subject, html: body, text: body });
    this.logger.log(`[FlowMailer] Enviado para ${to.join(', ')}: ${subject}`);
  }
}
