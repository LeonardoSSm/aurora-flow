import type { NotificationErrorCategory } from './notification.types';

/**
 * Erro lançado pelos adapters de canal. O `message` já é seguro para persistir/logar (sem
 * dados do destinatário nem segredos) — quem o cria é responsável por isso; o dispatcher ainda
 * passa tudo por `sanitizeErrorMessage` antes de gravar.
 */
export class NotificationChannelError extends Error {
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;

  constructor(
    message: string,
    readonly category: NotificationErrorCategory,
    options: { retryAfterMs?: number; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = 'NotificationChannelError';
    this.retryAfterMs = options.retryAfterMs;
    this.httpStatus = options.httpStatus;
  }
}

/** Mapeia o status HTTP de um provedor para uma categoria de erro. */
export function classifyHttpStatus(status: number): NotificationErrorCategory {
  if (status === 429) return 'rate_limited';
  if (status === 408) return 'timeout';
  if (status === 401 || status === 403) return 'not_configured';
  if (status >= 500) return 'transient';
  if (status >= 400) return 'permanent';
  return 'unknown';
}

const NETWORK_TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EPIPE',
  'ESOCKET',
  'ECONNECTION',
]);
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ECONNABORTED', 'ESOCKETTIMEDOUT']);

interface AxiosLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number; headers?: Record<string, unknown> };
}

interface SmtpLikeError {
  code?: string;
  responseCode?: number;
  message?: string;
}

function parseRetryAfterMs(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.round(asNumber * 1000);
  const asDate = Date.parse(String(value));
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

/**
 * Converte qualquer exceção de um provedor (axios, nodemailer, timeout, bug) em
 * `NotificationChannelError` categorizado. Detecta por *duck typing* — o módulo de domínio
 * não depende de axios nem de nodemailer.
 */
export function classifyError(error: unknown): NotificationChannelError {
  if (error instanceof NotificationChannelError) return error;

  const err = (error ?? {}) as AxiosLikeError & SmtpLikeError;
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'erro desconhecido');

  if (err.isAxiosError) {
    const status = err.response?.status;
    if (typeof status === 'number') {
      return new NotificationChannelError(
        `Provedor respondeu HTTP ${status}.`,
        classifyHttpStatus(status),
        {
          httpStatus: status,
          retryAfterMs: parseRetryAfterMs(err.response?.headers?.['retry-after']),
        },
      );
    }
    if (err.code && TIMEOUT_CODES.has(err.code)) {
      return new NotificationChannelError('Tempo esgotado ao chamar o provedor.', 'timeout');
    }
    if (err.code && NETWORK_TRANSIENT_CODES.has(err.code)) {
      return new NotificationChannelError(`Falha de rede com o provedor (${err.code}).`, 'transient');
    }
    return new NotificationChannelError('Falha ao chamar o provedor.', 'transient');
  }

  // nodemailer: `code` (EAUTH, EENVELOPE, ETIMEDOUT…) e/ou `responseCode` SMTP.
  if (err.code === 'EAUTH') {
    return new NotificationChannelError('Credenciais SMTP rejeitadas.', 'not_configured');
  }
  if (err.code === 'EENVELOPE') {
    return new NotificationChannelError('Endereço de e-mail recusado.', 'invalid_recipient');
  }
  if (typeof err.responseCode === 'number') {
    if ([550, 551, 553].includes(err.responseCode)) {
      return new NotificationChannelError('Caixa postal inexistente ou recusada.', 'invalid_recipient', {
        httpStatus: err.responseCode,
      });
    }
    return new NotificationChannelError(
      `Servidor SMTP respondeu ${err.responseCode}.`,
      err.responseCode >= 500 ? 'permanent' : 'transient',
      { httpStatus: err.responseCode },
    );
  }
  if (err.code && TIMEOUT_CODES.has(err.code)) {
    return new NotificationChannelError('Tempo esgotado ao enviar.', 'timeout');
  }
  if (err.code && NETWORK_TRANSIENT_CODES.has(err.code)) {
    return new NotificationChannelError(`Falha de rede (${err.code}).`, 'transient');
  }
  if (error instanceof Error && (error.name === 'AbortError' || /timeout|timed out/i.test(rawMessage))) {
    return new NotificationChannelError('Tempo esgotado ao enviar.', 'timeout');
  }

  return new NotificationChannelError(rawMessage, 'unknown');
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const AUTH_HEADER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_KV_RE = /\b(api[_-]?key|apikey|token|secret|password|passwd|authorization)\b\s*[:=]\s*\S+/gi;
const LONG_DIGITS_RE = /\+?\d[\d\s().-]{6,}\d/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

/**
 * Mensagem de erro segura para persistir e logar: remove e-mails, telefones, URLs, cabeçalhos
 * de autenticação, pares chave=valor de segredos e tokens longos, e limita o tamanho.
 */
export function sanitizeErrorMessage(message: string | null | undefined, maxLength = 300): string {
  const cleaned = String(message ?? '')
    .replace(AUTH_HEADER_RE, '$1 [redacted]')
    .replace(SECRET_KV_RE, '$1=[redacted]')
    .replace(EMAIL_RE, '[email]')
    .replace(URL_RE, '[url]')
    .replace(LONG_DIGITS_RE, '[number]')
    .replace(LONG_TOKEN_RE, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/** Máscara de endereço para logs e para quem só pode ver o resumo: `jo***@dominio.com`, `***1234`. */
export function maskAddress(address: string | null | undefined): string {
  const value = (address ?? '').trim();
  if (!value) return '';
  const at = value.indexOf('@');
  if (at > 0) return `${value.slice(0, Math.min(2, at))}***${value.slice(at)}`;
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `***${digits.slice(-4)}` : '***';
}
