import { CronExpressionParser } from 'cron-parser';
import type { TriggerScheduledData } from '../types/flow.types';

export const DEFAULT_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

const UNIT_TO_MS: Record<NonNullable<TriggerScheduledData['intervalUnit']>, number> = {
  minutes: 60_000,
  hours: 60 * 60_000,
  days: 24 * 60 * 60_000,
};

/**
 * Computes the next fire time for a trigger_scheduled node's config, relative to `from`.
 * Throws on invalid/incomplete config — callers must validate before persisting.
 */
export function computeNextRunAt(data: TriggerScheduledData, from: Date): Date {
  if (data.mode === 'cron') {
    const expression = data.cronExpression?.trim();
    if (!expression) {
      throw new Error('cronExpression é obrigatório no modo cron.');
    }
    const rawTz = data.timezone?.trim();
    const trimmedTz = rawTz === '' ? undefined : rawTz;
    const interval = CronExpressionParser.parse(expression, {
      currentDate: from,
      tz: trimmedTz ?? DEFAULT_SCHEDULE_TIMEZONE,
    });
    return interval.next().toDate();
  }

  const value = data.intervalValue;
  const unit = data.intervalUnit;
  if (!value || !Number.isInteger(value) || value < 1 || !unit) {
    throw new Error('intervalValue (inteiro >= 1) e intervalUnit são obrigatórios no modo interval.');
  }
  return new Date(from.getTime() + value * UNIT_TO_MS[unit]);
}
