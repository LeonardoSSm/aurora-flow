import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  WHATSAPP_PROVIDER,
  type IWhatsAppProvider,
  type WhatsAppGroup,
  type WhatsAppSendDto,
  type WhatsAppSendResult,
} from './whatsapp-provider.interface';

@Injectable()
export class WhatsAppClientService {
  private readonly logger = new Logger(WhatsAppClientService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER)
    private readonly provider: IWhatsAppProvider,
  ) {}

  async send(dto: WhatsAppSendDto): Promise<WhatsAppSendResult> {
    try {
      return await this.provider.sendMessage(dto);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`WhatsApp provider failed: ${message}`);
      return {
        messageId: null,
        status: 'failed',
        error: message,
      };
    }
  }

  /**
   * Igual a `send`, mas **propaga** o erro original do provedor (com o status HTTP do axios) em
   * vez de achatá-lo numa string — o módulo de notificações precisa dele para separar falha
   * transitória (retentável) de permanente.
   */
  sendOrThrow(dto: WhatsAppSendDto): Promise<WhatsAppSendResult> {
    return this.provider.sendMessage(dto);
  }

  listGroups(): Promise<WhatsAppGroup[]> {
    return this.provider.listGroups();
  }

  isAvailable(): boolean {
    return this.provider.isConfigured();
  }
}
