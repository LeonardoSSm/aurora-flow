import type { FieldSettings, ScoreRange } from './types';

/**
 * Faixas do resultado de um campo calculado (`settingsJson.scoreRanges`).
 *
 * Espelho de `backend/src/common/formula/score-ranges.ts`, que é quem decide de verdade a fase em que
 * o card nasce no envio; aqui é só para o editor mostrar em que faixa um resultado de teste cai.
 */
export function getScoreRanges(settings: FieldSettings): ScoreRange[] {
  const raw: unknown = settings.scoreRanges;
  if (!Array.isArray(raw)) return [];
  const ranges: ScoreRange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, from, label, phaseId } = item as Record<string, unknown>;
    if (typeof from !== 'number' || !Number.isFinite(from)) continue;
    ranges.push({
      id: typeof id === 'string' ? id : String(ranges.length),
      from,
      ...(typeof label === 'string' && label.trim() ? { label: label.trim() } : {}),
      ...(typeof phaseId === 'string' && phaseId ? { phaseId } : {}),
    });
  }
  return ranges.sort((a, b) => a.from - b.from);
}

/** A faixa em que o valor cai (a de maior início que não passa dele), ou `null`. */
export function findScoreRange(ranges: ScoreRange[], value: number | null): ScoreRange | null {
  if (value === null || !Number.isFinite(value)) return null;
  let match: ScoreRange | null = null;
  for (const range of ranges) {
    if (range.from <= value && (!match || range.from >= match.from)) match = range;
  }
  return match;
}

/** Texto curto da faixa: o nome, ou "a partir de 30". */
export function describeScoreRange(range: ScoreRange): string {
  return range.label ?? `a partir de ${range.from.toLocaleString('pt-BR')}`;
}
