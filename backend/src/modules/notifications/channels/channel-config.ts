import type { ConfigService } from '@nestjs/config';

/**
 * Provedores simulados (SMTP ausente → só registra; WhatsApp “mock”) existem para
 * desenvolvimento. Em produção um provedor não configurado **falha** (`not_configured`) em vez de
 * marcar a notificação como enviada — a menos que `NOTIFICATIONS_ALLOW_MOCK_PROVIDERS=true`.
 */
export function allowMockProviders(config: ConfigService): boolean {
  const explicit = config.get<string>('NOTIFICATIONS_ALLOW_MOCK_PROVIDERS');
  if (explicit !== undefined && explicit !== '') return explicit.trim().toLowerCase() === 'true';
  return config.get<string>('NODE_ENV', 'development') !== 'production';
}
