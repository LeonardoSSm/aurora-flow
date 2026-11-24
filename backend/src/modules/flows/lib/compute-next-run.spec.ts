import { computeNextRunAt, DEFAULT_SCHEDULE_TIMEZONE } from './compute-next-run';

describe('computeNextRunAt', () => {
  describe('interval mode', () => {
    it('adds intervalValue minutes to from', () => {
      const from = new Date('2026-01-01T10:00:00.000Z');
      const next = computeNextRunAt({ mode: 'interval', intervalValue: 15, intervalUnit: 'minutes' }, from);
      expect(next.toISOString()).toBe('2026-01-01T10:15:00.000Z');
    });

    it('adds intervalValue hours to from', () => {
      const from = new Date('2026-01-01T10:00:00.000Z');
      const next = computeNextRunAt({ mode: 'interval', intervalValue: 2, intervalUnit: 'hours' }, from);
      expect(next.toISOString()).toBe('2026-01-01T12:00:00.000Z');
    });

    it('adds intervalValue days to from', () => {
      const from = new Date('2026-01-01T10:00:00.000Z');
      const next = computeNextRunAt({ mode: 'interval', intervalValue: 1, intervalUnit: 'days' }, from);
      expect(next.toISOString()).toBe('2026-01-02T10:00:00.000Z');
    });

    it('throws when intervalValue is missing', () => {
      expect(() =>
        computeNextRunAt({ mode: 'interval', intervalUnit: 'minutes' }, new Date()),
      ).toThrow(/intervalValue/);
    });

    it('throws when intervalValue is less than 1', () => {
      expect(() =>
        computeNextRunAt({ mode: 'interval', intervalValue: 0, intervalUnit: 'minutes' }, new Date()),
      ).toThrow(/intervalValue/);
    });

    it('throws when intervalValue is not an integer', () => {
      expect(() =>
        computeNextRunAt({ mode: 'interval', intervalValue: 1.5, intervalUnit: 'minutes' }, new Date()),
      ).toThrow(/intervalValue/);
    });

    it('throws when intervalUnit is missing', () => {
      expect(() => computeNextRunAt({ mode: 'interval', intervalValue: 5 }, new Date())).toThrow(
        /intervalUnit/,
      );
    });
  });

  describe('cron mode', () => {
    it('resolves the next occurrence for a standard 5-field expression', () => {
      // "at minute 0 of every hour"
      const from = new Date('2026-01-01T10:15:00.000Z');
      const next = computeNextRunAt(
        { mode: 'cron', cronExpression: '0 * * * *', timezone: 'UTC' },
        from,
      );
      expect(next.toISOString()).toBe('2026-01-01T11:00:00.000Z');
    });

    it('uses America/Sao_Paulo by default when no timezone is set', () => {
      // 08:00 in America/Sao_Paulo (UTC-3) === 11:00 UTC
      const from = new Date('2026-01-01T00:00:00.000Z');
      const next = computeNextRunAt({ mode: 'cron', cronExpression: '0 8 * * *' }, from);
      expect(next.toISOString()).toBe('2026-01-01T11:00:00.000Z');
      expect(DEFAULT_SCHEDULE_TIMEZONE).toBe('America/Sao_Paulo');
    });

    it('throws when cronExpression is missing', () => {
      expect(() => computeNextRunAt({ mode: 'cron' }, new Date())).toThrow(/cronExpression/);
    });

    it('throws on an invalid cron expression', () => {
      expect(() =>
        computeNextRunAt({ mode: 'cron', cronExpression: 'not a cron' }, new Date()),
      ).toThrow();
    });
  });
});
