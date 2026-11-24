import { findScoreRange, getScoreRanges, type ScoreRange } from '../../common/formula/score-ranges';

/** Campo calculado da versão enviada, com a ordem de exibição (seção, depois campo). */
export type ScoreEntryField = {
  code: string;
  label: string;
  settingsJson: Record<string, unknown> | null;
  sectionOrder: number;
  order: number;
};

export type ScoreEntryMatch = {
  fieldCode: string;
  fieldLabel: string;
  value: number;
  range: ScoreRange & { phaseId: string };
};

/** Campos calculados que têm pelo menos uma faixa com fase — os únicos que decidem a entrada. */
export function scoreEntryCandidates<T extends ScoreEntryField>(fields: T[]): T[] {
  return fields
    .filter((field) => getScoreRanges(field.settingsJson).some((range) => range.phaseId))
    .sort((a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order);
}

/**
 * Em que fase o card de um formulário enviado nasce, pelas faixas dos campos calculados: vale o
 * primeiro campo (na ordem do formulário) cujo resultado cai numa faixa com fase. Sem nenhum,
 * `null` — o card nasce na 1ª fase, como sempre.
 */
export function pickScoreEntry(
  fields: ScoreEntryField[],
  valueByCode: ReadonlyMap<string, number | null>,
): ScoreEntryMatch | null {
  for (const field of scoreEntryCandidates(fields)) {
    const value = valueByCode.get(field.code) ?? null;
    const range = findScoreRange(getScoreRanges(field.settingsJson), value);
    if (value !== null && range?.phaseId) {
      return {
        fieldCode: field.code,
        fieldLabel: field.label,
        value,
        range: { ...range, phaseId: range.phaseId },
      };
    }
  }
  return null;
}
