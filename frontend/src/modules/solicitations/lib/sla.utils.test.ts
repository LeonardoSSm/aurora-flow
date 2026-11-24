import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSlaLabel, getSlaColor, getTimeRemaining, computePercentUsed } from './sla.utils';

const NOW = new Date('2026-05-16T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── getSlaLabel ───────────────────────────────────────────────────────────

describe('getSlaLabel', () => {
  it('retorna "Vencido" quando slaStatus é breached', () => {
    expect(getSlaLabel({ slaStatus: 'breached', slaDueAt: '2026-05-16T10:00:00.000Z' })).toBe('Vencido');
  });

  it('retorna string com percentual quando slaStatus é warning', () => {
    const label = getSlaLabel({ slaStatus: 'warning', slaDueAt: '2026-05-16T14:00:00.000Z' });
    expect(label).toMatch(/Atenção:.*%/);
    expect(label).toContain('usado');
  });

  it('retorna "No prazo" quando slaStatus é on_track', () => {
    expect(getSlaLabel({ slaStatus: 'on_track', slaDueAt: '2026-05-16T22:00:00.000Z' })).toBe('No prazo');
  });

  it('retorna string vazia quando slaStatus é null', () => {
    expect(getSlaLabel({ slaStatus: null, slaDueAt: '2026-05-16T22:00:00.000Z' })).toBe('');
  });

  it('retorna string vazia quando slaDueAt é null', () => {
    expect(getSlaLabel({ slaStatus: 'on_track', slaDueAt: null })).toBe('');
  });

  it('retorna string vazia quando slaStatus é paused', () => {
    expect(getSlaLabel({ slaStatus: 'paused', slaDueAt: '2026-05-16T22:00:00.000Z' })).toBe('');
  });
});

// ── getSlaColor ───────────────────────────────────────────────────────────

describe('getSlaColor', () => {
  it('retorna "red" para breached', () => {
    expect(getSlaColor({ slaStatus: 'breached', slaDueAt: '2026-05-16T10:00:00.000Z' })).toBe('red');
  });

  it('retorna "amber" para warning', () => {
    expect(getSlaColor({ slaStatus: 'warning', slaDueAt: '2026-05-16T14:00:00.000Z' })).toBe('amber');
  });

  it('retorna "green" para on_track', () => {
    expect(getSlaColor({ slaStatus: 'on_track', slaDueAt: '2026-05-16T22:00:00.000Z' })).toBe('green');
  });

  it('retorna "gray" para paused', () => {
    expect(getSlaColor({ slaStatus: 'paused', slaDueAt: '2026-05-16T22:00:00.000Z' })).toBe('gray');
  });

  it('retorna "gray" quando slaStatus é null', () => {
    expect(getSlaColor({ slaStatus: null, slaDueAt: '2026-05-16T22:00:00.000Z' })).toBe('gray');
  });

  it('retorna "gray" quando slaDueAt é null', () => {
    expect(getSlaColor({ slaStatus: 'on_track', slaDueAt: null })).toBe('gray');
  });
});

// ── getTimeRemaining ──────────────────────────────────────────────────────

describe('getTimeRemaining', () => {
  it('retorna string vazia quando slaDueAt é null', () => {
    expect(getTimeRemaining(null)).toBe('');
  });

  it('formata corretamente tempo restante com horas e minutos', () => {
    const dueAt = new Date(NOW.getTime() + 2 * 3_600_000 + 30 * 60_000).toISOString();
    expect(getTimeRemaining(dueAt)).toBe('2h 30min restantes');
  });

  it('formata corretamente tempo vencido', () => {
    const dueAt = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    expect(getTimeRemaining(dueAt)).toBe('Vencido há 1h');
  });

  it('formata apenas dias quando restam mais de 24h', () => {
    const dueAt = new Date(NOW.getTime() + 2 * 86_400_000).toISOString();
    expect(getTimeRemaining(dueAt)).toBe('2d restantes');
  });

  it('formata dias e horas quando aplicável', () => {
    const dueAt = new Date(NOW.getTime() + 1 * 86_400_000 + 3 * 3_600_000).toISOString();
    expect(getTimeRemaining(dueAt)).toBe('1d 3h restantes');
  });

  it('formata apenas minutos quando menos de 1h', () => {
    const dueAt = new Date(NOW.getTime() + 45 * 60_000).toISOString();
    expect(getTimeRemaining(dueAt)).toBe('45min restantes');
  });
});

// ── computePercentUsed ────────────────────────────────────────────────────

describe('computePercentUsed', () => {
  it('retorna 0 quando slaDueAt é null', () => {
    expect(computePercentUsed(null, null)).toBe(0);
  });

  it('retorna 50 quando decorrida metade do prazo', () => {
    const start = new Date(NOW.getTime() - 5 * 3_600_000).toISOString();
    const due = new Date(NOW.getTime() + 5 * 3_600_000).toISOString();
    expect(computePercentUsed(start, due)).toBe(50);
  });

  it('limita a 100 quando vencido', () => {
    const start = new Date(NOW.getTime() - 10 * 3_600_000).toISOString();
    const due = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    expect(computePercentUsed(start, due)).toBe(100);
  });
});
