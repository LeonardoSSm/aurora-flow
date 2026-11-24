/**
 * Faixas do resultado de um campo calculado (`settingsJson.scoreRanges`): cada faixa vale "a partir
 * de `from`" até a próxima, e diz em que fase do Kanban o card nasce quando o formulário é enviado
 * com o resultado nela. Abaixo da primeira faixa, nada muda (o card nasce na 1ª fase).
 *
 * Espelho de `frontend/src/modules/forms/score-ranges.ts`.
 */
export type ScoreRange = {
  id: string;
  /** Início da faixa (inclusive); vai até a faixa seguinte. */
  from: number;
  /** Nome opcional, mostrado no histórico do card (ex.: "Risco alto"). */
  label?: string;
  /** Fase do Kanban em que o card nasce. */
  phaseId?: string;
};

/** Faixas válidas do campo, em ordem crescente de início. */
export function getScoreRanges(settings: Record<string, unknown> | null | undefined): ScoreRange[] {
  const raw = settings?.scoreRanges;
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

/** Texto curto da faixa para histórico e mensagens: o nome, ou "a partir de 30". */
export function describeScoreRange(range: ScoreRange): string {
  return range.label ?? `a partir de ${range.from.toLocaleString('pt-BR')}`;
}
