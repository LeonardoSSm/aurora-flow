import { vi } from 'vitest';
import { formatRelativeTime, formatSla } from './kanban-formatters';

const NOW = new Date('2026-05-15T12:00:00.000Z').getTime();

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "agora" for timestamps less than 1 minute ago', () => {
    const recent = new Date(NOW - 30_000).toISOString();
    expect(formatRelativeTime(recent)).toBe('agora');
  });

  it('returns minutes for timestamps between 1 and 59 minutes ago', () => {
    const fiveMinAgo = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('há 5min');
  });

  it('returns hours for timestamps between 1 and 23 hours ago', () => {
    const threeHoursAgo = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('há 3h');
  });

  it('returns days for timestamps 24+ hours ago', () => {
    const twoDaysAgo = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('há 2d');
  });
});

describe('formatSla', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when slaDueAt is null', () => {
    expect(formatSla(null)).toBeNull();
  });

  it('returns VENCIDO when slaDueAt is in the past', () => {
    const past = new Date(NOW - 60_000).toISOString();
    const result = formatSla(past);
    expect(result?.text).toBe('VENCIDO');
    expect(result?.overdue).toBe(true);
  });

  it('returns minutes remaining when due within an hour', () => {
    const in30min = new Date(NOW + 30 * 60_000).toISOString();
    const result = formatSla(in30min);
    expect(result?.text).toBe('30min');
    expect(result?.overdue).toBe(false);
  });

  it('returns hours remaining when due within a day', () => {
    const in3h = new Date(NOW + 3 * 60 * 60_000).toISOString();
    const result = formatSla(in3h);
    expect(result?.text).toBe('3h');
    expect(result?.overdue).toBe(false);
  });

  it('returns days remaining when due after more than a day', () => {
    const in2d = new Date(NOW + 2 * 24 * 60 * 60_000).toISOString();
    const result = formatSla(in2d);
    expect(result?.text).toBe('2d');
    expect(result?.overdue).toBe(false);
  });
});
