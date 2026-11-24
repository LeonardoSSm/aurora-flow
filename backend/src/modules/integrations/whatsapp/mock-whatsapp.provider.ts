import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  IWhatsAppProvider,
  WhatsAppGroup,
  WhatsAppSendDto,
  WhatsAppSendResult,
} from './whatsapp-provider.interface';

@Injectable()
export class MockWhatsAppProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  isConfigured(): boolean {
    return false;
  }

  /** Sem provedor não há grupos: a tela pede o JID digitado. */
  async listGroups(): Promise<WhatsAppGroup[]> {
    return [];
  }

  async sendMessage(dto: WhatsAppSendDto): Promise<WhatsAppSendResult> {
    this.logger.log(`Mock WhatsApp send to ${dto.to}: ${dto.message}`);
    return {
      messageId: `mock-${randomUUID()}`,
      status: 'sent',
      rawResponse: { provider: 'mock' },
    };
  }
}
