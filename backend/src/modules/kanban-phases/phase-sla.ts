import type { KanbanPhaseEntity } from '../../database/entities/kanban-phase.entity';

/**
 * Prazo (SLA) de uma fase do Kanban: contado a partir da entrada do card na fase, em horas corridas
 * ou em horas úteis. Horário útil = segunda a sexta, 08h–18h no horário de Brasília (UTC−3, sem
 * horário de verão desde 2019). Feriados ainda não contam.
 */

export const DEFAULT_PHASE_SLA_WARNING_PERCENT = 80;
export const BUSINESS_DAY_START_HOUR = 8;
export const BUSINESS_DAY_END_HOUR = 18;
const BRASILIA_OFFSET_MINUTES = -180;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type PhaseSlaState = 'on_track' | 'warning' | 'breached';

export type PhaseSlaConfig = Pick<
  KanbanPhaseEntity,
  'slaHours' | 'slaBusinessHours' | 'slaWarningPercent' | 'isTerminal'
>;

/** Fase com prazo: horas positivas e não é fase final (card concluído não tem prazo correndo). */
export function hasPhaseSla(phase: PhaseSlaConfig | null | undefined): boolean {
  return Boolean(phase && !phase.isTerminal && phase.slaHours && phase.slaHours > 0);
}

export function warningPercentOf(phase: Pick<PhaseSlaConfig, 'slaWarningPercent'>): number {
  const value = phase.slaWarningPercent;
  return typeof value === 'number' && value > 0 && value < 100 ? value : DEFAULT_PHASE_SLA_WARNING_PERCENT;
}

/** "Relógio de Brasília": o mesmo instante com os getters UTC lendo a hora local. */
function toLocal(date: Date): Date {
  return new Date(date.getTime() + BRASILIA_OFFSET_MINUTES * MINUTE);
}

function fromLocal(local: Date): Date {
  return new Date(local.getTime() - BRASILIA_OFFSET_MINUTES * MINUTE);
}

function isWeekday(local: Date): boolean {
  const day = local.getUTCDay();
  return day !== 0 && day !== 6;
}

function startOfLocalDay(local: Date): number {
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/** Janela útil [início, fim) do dia local que contém `local` (ms no relógio local). */
function businessWindow(local: Date): [number, number] {
  const day = startOfLocalDay(local);
  return [day + BUSINESS_DAY_START_HOUR * 60 * MINUTE, day + BUSINESS_DAY_END_HOUR * 60 * MINUTE];
}

/** Soma minutos úteis a partir de `start`; fora do expediente, começa no próximo expediente. */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  let cursor = toLocal(start).getTime();
  let remaining = Math.max(0, minutes) * MINUTE;
  // Limite de segurança: ~30 anos de dias.
  for (let guard = 0; guard < 12_000; guard += 1) {
    const local = new Date(cursor);
    const [open, close] = businessWindow(local);
    if (!isWeekday(local) || cursor >= close) {
      cursor = startOfLocalDay(local) + DAY + BUSINESS_DAY_START_HOUR * 60 * MINUTE;
      continue;
    }
    if (cursor < open) cursor = open;
    const available = close - cursor;
    if (remaining <= available) return fromLocal(new Date(cursor + remaining));
    remaining -= available;
    cursor = close;
  }
  return fromLocal(new Date(cursor));
}

/** Minutos úteis entre dois instantes (0 quando `end` não passa de `start`). */
export function businessMinutesBetween(start: Date, end: Date): number {
  let cursor = toLocal(start).getTime();
  const stop = toLocal(end).getTime();
  let total = 0;
  for (let guard = 0; cursor < stop && guard < 12_000; guard += 1) {
    const local = new Date(cursor);
    const [open, close] = businessWindow(local);
    if (isWeekday(local)) {
      const from = Math.max(cursor, open);
      const to = Math.min(stop, close);
      if (to > from) total += to - from;
    }
    cursor = startOfLocalDay(local) + DAY;
  }
  return Math.round(total / MINUTE);
}

/** Vencimento do prazo da fase para um card que entrou nela em `enteredAt`. */
export function computePhaseDueAt(
  enteredAt: Date,
  phase: Pick<PhaseSlaConfig, 'slaHours' | 'slaBusinessHours'>,
): Date | null {
  if (!phase.slaHours || phase.slaHours <= 0) return null;
  return phase.slaBusinessHours
    ? addBusinessMinutes(enteredAt, phase.slaHours * 60)
    : new Date(enteredAt.getTime() + phase.slaHours * 60 * MINUTE);
}

export type PhaseSlaProgress = {
  state: PhaseSlaState;
  /** Quanto do prazo já foi consumido (0–100+), no mesmo relógio do prazo (corrido ou útil). */
  percentUsed: number;
  /** Minutos corridos até o vencimento; negativo depois de vencer. */
  minutesRemaining: number;
};

export function phaseSlaProgress(
  enteredAt: Date,
  dueAt: Date,
  options: { businessHours: boolean; warningPercent: number; now?: Date },
): PhaseSlaProgress {
  const now = options.now ?? new Date();
  const total = options.businessHours
    ? businessMinutesBetween(enteredAt, dueAt)
    : (dueAt.getTime() - enteredAt.getTime()) / MINUTE;
  const elapsed = options.businessHours
    ? businessMinutesBetween(enteredAt, now)
    : (now.getTime() - enteredAt.getTime()) / MINUTE;
  const percentUsed = total > 0 ? Math.round((elapsed / total) * 1000) / 10 : 100;
  const remainingMs = dueAt.getTime() - now.getTime();
  const minutesRemaining = remainingMs >= 0 ? Math.ceil(remainingMs / MINUTE) : Math.floor(remainingMs / MINUTE);
  const state: PhaseSlaState =
    now.getTime() > dueAt.getTime()
      ? 'breached'
      : percentUsed >= options.warningPercent
        ? 'warning'
        : 'on_track';
  return { state, percentUsed, minutesRemaining };
}
