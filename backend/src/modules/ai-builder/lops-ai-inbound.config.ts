import type { ConfigService } from '@nestjs/config';

/**
 * Configuração da entrada da LOPS IA (rotas /ai). Duas chaves diferentes, de propósito:
 * - LOPS_AI_INBOUND_API_KEY: a LOPS IA manda em X-API-Key para provar que é ela chamando o Tijuca;
 * - LOPS_AI_API_KEY (integrations/lops-ai): o Tijuca manda para a LOPS IA ao listar agentes.
 * Sem LOPS_AI_INBOUND_API_KEY as rotas /ai respondem 503 — a integração fica desligada.
 */
export type LopsAiInboundConfig = {
  apiKey: string;
  /** Sem uso por este tempo, a sessão cai; cada chamada renova. */
  sessionTtlMinutes: number;
  /** Vazio = qualquer IP. */
  allowedIps: string[];
  /** Domínio do Workspace (GOOGLE_WORKSPACE_DOMAIN); vazio = não confere o domínio. */
  workspaceDomain: string;
};

export const MIN_INBOUND_KEY_LENGTH = 32;
const DEFAULT_SESSION_TTL_MINUTES = 480;
const MAX_SESSION_TTL_MINUTES = 24 * 60;

export function readLopsAiInboundConfig(config: ConfigService): LopsAiInboundConfig | null {
  const apiKey = (config.get<string>('LOPS_AI_INBOUND_API_KEY') ?? '').trim();
  if (apiKey.length < MIN_INBOUND_KEY_LENGTH) return null;

  const ttl = Number(config.get<string>('LOPS_AI_SESSION_TTL_MINUTES'));
  const sessionTtlMinutes =
    Number.isFinite(ttl) && ttl > 0 ? Math.min(Math.trunc(ttl), MAX_SESSION_TTL_MINUTES) : DEFAULT_SESSION_TTL_MINUTES;

  const allowedIps = (config.get<string>('LOPS_AI_ALLOWED_IPS') ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  return {
    apiKey,
    sessionTtlMinutes,
    allowedIps,
    workspaceDomain: (config.get<string>('GOOGLE_WORKSPACE_DOMAIN') ?? '').trim().toLowerCase(),
  };
}
