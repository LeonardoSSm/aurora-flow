import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type {
  IWhatsAppProvider,
  WhatsAppGroup,
  WhatsAppSendDto,
  WhatsAppSendResult,
} from './whatsapp-provider.interface';

type EvolutionSendResponse = {
  key?: {
    id?: string;
  };
  messageId?: string;
  id?: string;
  status?: string;
  [key: string]: unknown;
};

type EvolutionGroup = {
  id?: unknown;
  subject?: unknown;
  size?: unknown;
};

const DEFAULT_WHATSAPP_TIMEOUT_MS = 10_000;
const GROUP_JID_SUFFIX = '@g.us';

@Injectable()
export class EvolutionApiProvider implements IWhatsAppProvider {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return (
      this.providerName !== 'mock' &&
      Boolean(this.baseUrl) &&
      Boolean(this.apiKey) &&
      Boolean(this.instance)
    );
  }

  async sendMessage(dto: WhatsAppSendDto): Promise<WhatsAppSendResult> {
    const response = await axios.post<EvolutionSendResponse>(
      `${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`,
      {
        number: dto.to,
        text: dto.message,
      },
      {
        headers: {
          apikey: this.apiKey,
        },
        timeout: this.timeoutMs,
      },
    );

    return {
      messageId: this.extractMessageId(response.data),
      status: this.mapStatus(response.data),
      rawResponse: response.data,
    };
  }

  /** `GET /group/fetchAllGroups/{instance}` sem participantes (só o necessário para escolher o grupo). */
  async listGroups(): Promise<WhatsAppGroup[]> {
    const response = await axios.get<EvolutionGroup[]>(
      `${this.baseUrl}/group/fetchAllGroups/${encodeURIComponent(this.instance)}`,
      {
        params: { getParticipants: 'false' },
        headers: { apikey: this.apiKey },
        timeout: this.timeoutMs,
      },
    );
    const groups = Array.isArray(response.data) ? response.data : [];
    return groups
      .filter(
        (group): group is EvolutionGroup & { id: string } =>
          typeof group?.id === 'string' && group.id.endsWith(GROUP_JID_SUFFIX),
      )
      .map((group) => ({
        id: group.id,
        subject: typeof group.subject === 'string' && group.subject.trim() ? group.subject.trim() : group.id,
        size: typeof group.size === 'number' && Number.isFinite(group.size) ? group.size : null,
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
  }

  private extractMessageId(data: EvolutionSendResponse): string | null {
    return data.key?.id ?? data.messageId ?? data.id ?? null;
  }

  private mapStatus(data: EvolutionSendResponse): WhatsAppSendResult['status'] {
    const status = String(data.status ?? '').toLowerCase();
    if (status.includes('queue')) return 'queued';
    if (status.includes('fail') || status.includes('error')) return 'failed';
    return 'sent';
  }

  private get providerName(): string {
    return this.configService.get<string>('WHATSAPP_PROVIDER', 'mock').trim().toLowerCase();
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('WHATSAPP_EVOLUTION_BASE_URL')?.trim().replace(/\/$/, '') ?? ''
    );
  }

  private get apiKey(): string {
    return this.configService.get<string>('WHATSAPP_EVOLUTION_API_KEY')?.trim() ?? '';
  }

  private get instance(): string {
    return this.configService.get<string>('WHATSAPP_EVOLUTION_INSTANCE')?.trim() ?? '';
  }

  private get timeoutMs(): number {
    const configured = Number(this.configService.get<string>('WHATSAPP_TIMEOUT_MS'));
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_WHATSAPP_TIMEOUT_MS;
    return Math.trunc(configured);
  }
}
