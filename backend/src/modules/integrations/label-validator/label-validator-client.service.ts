import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LabelValidationResult } from './label-validator.types';

const DEFAULT_TIMEOUT_MS = 30_000;

type ChatResponse = {
  sessionId?: string;
  data?: LabelValidationResult;
};

@Injectable()
export class LabelValidatorClientService {
  constructor(private readonly configService: ConfigService) {}

  async validateLabel(
    imageBuffer: Buffer,
    fileName: string,
    mimeType: string,
    message: string,
  ): Promise<LabelValidationResult> {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), fileName);
    form.append('message', message);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/agents/validador-de-etiquetas/chat`, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Falha ao chamar o validador de etiquetas: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(`Validador de etiquetas retornou status ${response.status}.`);
    }

    const body = (await response.json()) as ChatResponse;
    if (!body.data) {
      throw new ServiceUnavailableException('Validador de etiquetas não retornou dados.');
    }
    return body.data;
  }

  private get baseUrl(): string {
    const value = this.configService.get<string>('LABEL_VALIDATOR_BASE_URL');
    if (!value?.trim()) {
      throw new ServiceUnavailableException('LABEL_VALIDATOR_BASE_URL não está configurada.');
    }
    return value.trim().replace(/\/$/, '');
  }

  private get apiKey(): string {
    const value = this.configService.get<string>('LABEL_VALIDATOR_API_KEY');
    if (!value?.trim()) {
      throw new ServiceUnavailableException('LABEL_VALIDATOR_API_KEY não está configurado.');
    }
    return value.trim();
  }

  private get timeoutMs(): number {
    const configured = Number(this.configService.get<string>('LABEL_VALIDATOR_TIMEOUT_MS'));
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS;
    return Math.trunc(configured);
  }
}
