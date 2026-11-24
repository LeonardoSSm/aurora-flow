import { RETRYABLE_ERROR_CATEGORIES, type NotificationErrorCategory } from './notification.types';

export interface NotificationRetryPolicy {
  /** Total de tentativas (a primeira incluída). */
  maxAttempts: number;
  /** Base do backoff exponencial, em segundos. */
  backoffSeconds: number;
}

export const DEFAULT_RETRY_POLICY: NotificationRetryPolicy = { maxAttempts: 3, backoffSeconds: 30 };

export const MIN_ATTEMPTS = 1;
export const MAX_ATTEMPTS_LIMIT = 5;
export const MIN_BACKOFF_SECONDS = 5;
export const MAX_BACKOFF_SECONDS = 3600;

/** Teto do intervalo entre tentativas, qualquer que seja o backoff ou o `Retry-After`. */
const MAX_DELAY_MS = MAX_BACKOFF_SECONDS * 1000;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/** Aplica padrões e limites — nunca confia no que veio salvo no nó. */
export function normalizeRetryPolicy(
  input?: Partial<NotificationRetryPolicy> | null,
): NotificationRetryPolicy {
  return {
    maxAttempts: clampInt(
      input?.maxAttempts,
      MIN_ATTEMPTS,
      MAX_ATTEMPTS_LIMIT,
      DEFAULT_RETRY_POLICY.maxAttempts,
    ),
    backoffSeconds: clampInt(
      input?.backoffSeconds,
      MIN_BACKOFF_SECONDS,
      MAX_BACKOFF_SECONDS,
      DEFAULT_RETRY_POLICY.backoffSeconds,
    ),
  };
}

export function isRetryableCategory(category: NotificationErrorCategory): boolean {
  return RETRYABLE_ERROR_CATEGORIES.has(category);
}

/**
 * Decide se uma tentativa que acabou de falhar deve ser repetida.
 * `attemptNumber` é o número da tentativa que falhou (1-based).
 */
export function shouldRetry(
  category: NotificationErrorCategory,
  attemptNumber: number,
  policy: NotificationRetryPolicy,
): boolean {
  return isRetryableCategory(category) && attemptNumber < policy.maxAttempts;
}

export interface NextAttemptOptions {
  /** `Retry-After` do provedor, em ms — vence o backoff se for maior. */
  retryAfterMs?: number;
  /** Injetável para teste; deve devolver um valor em [0, 1). */
  random?: () => number;
}

/**
 * Backoff exponencial com jitter de ±20 %:
 * `backoffSeconds * 2^(attemptNumber - 1)`, limitado a 1 h.
 */
export function computeNextAttemptAt(
  attemptNumber: number,
  policy: NotificationRetryPolicy,
  now: Date,
  options: NextAttemptOptions = {},
): Date {
  const random = options.random ?? Math.random;
  const exponent = Math.max(0, attemptNumber - 1);
  const base = Math.min(policy.backoffSeconds * 1000 * 2 ** exponent, MAX_DELAY_MS);
  const jitter = 1 + (random() * 0.4 - 0.2);
  let delay = Math.round(base * jitter);
  if (options.retryAfterMs !== undefined && Number.isFinite(options.retryAfterMs)) {
    delay = Math.max(delay, options.retryAfterMs);
  }
  delay = Math.min(Math.max(delay, 0), MAX_DELAY_MS);
  return new Date(now.getTime() + delay);
}
