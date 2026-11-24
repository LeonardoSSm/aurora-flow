import type { NotificationChannelId } from './notification.types';

/** Teto de destinatários por execução de nó — barreira contra envio em massa por engano. */
export const DEFAULT_MAX_RECIPIENTS_PER_NOTIFICATION = 50;

/** Teto de destinatários criados por fluxo na última hora (configurável por env). */
export const DEFAULT_MAX_RECIPIENTS_PER_FLOW_PER_HOUR = 1000;

/** Atraso máximo de envio configurável no nó: 7 dias. */
export const MAX_DELAY_MINUTES = 7 * 24 * 60;

/** Tamanho máximo do modelo (template) salvo no nó, antes da renderização. */
export const MAX_TEMPLATE_LENGTH = 4000;

/** Tamanho máximo do modelo do título/assunto salvo no nó (a saída é truncada pelo limite do canal). */
export const MAX_TITLE_TEMPLATE_LENGTH = 300;

export const MAX_IDEMPOTENCY_TEMPLATE_LENGTH = 200;

export interface ChannelLimits {
  /** Título/assunto (e-mail: assunto; in_app: título; WhatsApp: prefixo em negrito). */
  titleMax: number;
  /** Corpo da mensagem já renderizada. */
  bodyMax: number;
}

/**
 * `in_app` herda o `varchar(500)` da tabela `notifications` já existente; `whatsapp` o limite
 * de 4096 caracteres de uma mensagem de texto; `email` é folgado, mas finito.
 */
export const CHANNEL_LIMITS: Record<NotificationChannelId, ChannelLimits> = {
  in_app: { titleMax: 150, bodyMax: 500 },
  email: { titleMax: 200, bodyMax: 20_000 },
  whatsapp: { titleMax: 100, bodyMax: 4000 },
};
