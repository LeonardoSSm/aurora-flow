import type { ConfigService } from '@nestjs/config';

export const LOPS_AI_DEFAULT_TIMEOUT_MS = 30_000;

/** Onde e por quanto tempo chamar a LOPS IA (sem credencial). */
export type LopsAiEndpoint = {
  baseUrl: string;
  timeoutMs: number;
};

/** Conexão completa, com a chave do servidor — usada SOMENTE para listar os agentes. */
export type LopsAiListingConnection = LopsAiEndpoint & { apiKey: string };

/** Valores próprios de um nó (opcionais) que têm precedência sobre a configuração do servidor. */
export type LopsAiEndpointOverrides = {
  baseUrl?: string;
  timeoutMs?: number;
};

/** Primeiro valor não vazio (depois de aparar espaços) — string em branco conta como ausente. */
function firstNonBlank(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

/**
 * URL base e timeout da LOPS IA: LOPS_AI_BASE_URL e LOPS_AI_TIMEOUT_MS do servidor, com os
 * valores do próprio nó (baseUrl/timeoutMs) tendo precedência. Não envolve nenhuma chave: ao
 * executar um nó, a chave usada é SEMPRE a que o usuário colocou no nó — a LOPS_AI_API_KEY do
 * servidor nunca é usada para rodar agentes.
 */
export function resolveLopsAiEndpoint(
  config: ConfigService,
  overrides: LopsAiEndpointOverrides = {},
): LopsAiEndpoint {
  const baseUrl = firstNonBlank(overrides.baseUrl, config.get<string>('LOPS_AI_BASE_URL')).replace(
    /\/+$/,
    '',
  );
  if (!baseUrl) {
    throw new Error('LOPS_AI_BASE_URL não está configurada no servidor.');
  }

  const timeoutMs =
    positiveInt(overrides.timeoutMs) ??
    positiveInt(config.get<string>('LOPS_AI_TIMEOUT_MS')) ??
    LOPS_AI_DEFAULT_TIMEOUT_MS;

  return { baseUrl, timeoutMs };
}

/**
 * Conexão para LISTAR os agentes (GET /models): usa a LOPS_AI_API_KEY do servidor, para o editor
 * de fluxos mostrar a lista sem expor a chave ao navegador. É o único uso dessa chave.
 */
export function resolveLopsAiListingConnection(config: ConfigService): LopsAiListingConnection {
  const endpoint = resolveLopsAiEndpoint(config);
  const apiKey = firstNonBlank(config.get<string>('LOPS_AI_API_KEY'));
  if (!apiKey) {
    throw new Error('LOPS_AI_API_KEY não está configurada no servidor.');
  }
  return { ...endpoint, apiKey };
}
