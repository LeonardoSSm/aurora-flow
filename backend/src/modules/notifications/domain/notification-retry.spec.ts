import {
  DEFAULT_RETRY_POLICY,
  MAX_ATTEMPTS_LIMIT,
  MAX_BACKOFF_SECONDS,
  computeNextAttemptAt,
  isRetryableCategory,
  normalizeRetryPolicy,
  shouldRetry,
} from './notification-retry';

describe('notification-retry', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');
  const noJitter = () => 0.5; // jitter = 1 + (0.5*0.4 - 0.2) = 1

  describe('normalizeRetryPolicy', () => {
    it('usa os padrões quando não há política', () => {
      expect(normalizeRetryPolicy()).toEqual(DEFAULT_RETRY_POLICY);
      expect(normalizeRetryPolicy(null)).toEqual(DEFAULT_RETRY_POLICY);
      expect(normalizeRetryPolicy({})).toEqual(DEFAULT_RETRY_POLICY);
    });

    it('limita os valores ao intervalo permitido', () => {
      expect(normalizeRetryPolicy({ maxAttempts: 99, backoffSeconds: 999_999 })).toEqual({
        maxAttempts: MAX_ATTEMPTS_LIMIT,
        backoffSeconds: MAX_BACKOFF_SECONDS,
      });
      expect(normalizeRetryPolicy({ maxAttempts: 0, backoffSeconds: 1 })).toEqual({
        maxAttempts: 1,
        backoffSeconds: 5,
      });
    });

    it('descarta valores não numéricos e trunca decimais', () => {
      expect(
        normalizeRetryPolicy({ maxAttempts: 'abc' as never, backoffSeconds: NaN }),
      ).toEqual(DEFAULT_RETRY_POLICY);
      expect(normalizeRetryPolicy({ maxAttempts: 2.9, backoffSeconds: 40.7 })).toEqual({
        maxAttempts: 2,
        backoffSeconds: 40,
      });
    });
  });

  describe('shouldRetry', () => {
    const policy = { maxAttempts: 3, backoffSeconds: 30 };

    it.each(['transient', 'rate_limited', 'timeout', 'unknown'] as const)(
      'retenta %s enquanto houver tentativas',
      (category) => {
        expect(isRetryableCategory(category)).toBe(true);
        expect(shouldRetry(category, 1, policy)).toBe(true);
        expect(shouldRetry(category, 2, policy)).toBe(true);
        expect(shouldRetry(category, 3, policy)).toBe(false);
      },
    );

    it.each(['permanent', 'invalid_recipient', 'not_configured'] as const)(
      'nunca retenta %s',
      (category) => {
        expect(isRetryableCategory(category)).toBe(false);
        expect(shouldRetry(category, 1, policy)).toBe(false);
      },
    );

    it('com maxAttempts 1 não há retentativa', () => {
      expect(shouldRetry('transient', 1, { maxAttempts: 1, backoffSeconds: 30 })).toBe(false);
    });
  });

  describe('computeNextAttemptAt', () => {
    const policy = { maxAttempts: 5, backoffSeconds: 30 };

    it('cresce exponencialmente a cada tentativa', () => {
      const delays = [1, 2, 3, 4].map(
        (attempt) =>
          computeNextAttemptAt(attempt, policy, now, { random: noJitter }).getTime() - now.getTime(),
      );
      expect(delays).toEqual([30_000, 60_000, 120_000, 240_000]);
    });

    it('aplica jitter de no máximo ±20 %', () => {
      const low = computeNextAttemptAt(1, policy, now, { random: () => 0 }).getTime() - now.getTime();
      const high =
        computeNextAttemptAt(1, policy, now, { random: () => 0.999999 }).getTime() - now.getTime();
      expect(low).toBe(24_000);
      expect(high).toBeGreaterThan(35_900);
      expect(high).toBeLessThanOrEqual(36_000);
    });

    it('respeita Retry-After quando maior que o backoff', () => {
      const next = computeNextAttemptAt(1, policy, now, { random: noJitter, retryAfterMs: 120_000 });
      expect(next.getTime() - now.getTime()).toBe(120_000);
    });

    it('ignora Retry-After menor que o backoff', () => {
      const next = computeNextAttemptAt(1, policy, now, { random: noJitter, retryAfterMs: 1_000 });
      expect(next.getTime() - now.getTime()).toBe(30_000);
    });

    it('nunca passa de 1 hora, nem com Retry-After gigante', () => {
      const next = computeNextAttemptAt(5, { maxAttempts: 5, backoffSeconds: 3600 }, now, {
        random: noJitter,
        retryAfterMs: 10 * 3600_000,
      });
      expect(next.getTime() - now.getTime()).toBe(3600_000);
    });
  });
});
