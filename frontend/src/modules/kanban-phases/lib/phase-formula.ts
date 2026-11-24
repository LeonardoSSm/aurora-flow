import { computeCalculatedFieldValues, getFormulaDecimals } from '../../forms/formula';
import type { FieldSettings } from '../../forms/types';
import type { PhaseFieldValue } from '../../solicitations/services/solicitations-api';
import type { KanbanPhase } from '../types';

/** Cálculo de fase é dinheiro: R$ com duas casas (o backend grava assim) — menos o "Total de horas". */
export const PHASE_CALCULATED_SETTINGS = { formulaDecimals: 2, formulaPrefix: 'R$ ' } as const;

/** "Total de horas" de fase: o resultado sai no relógio (8h30), não em R$. */
export function isPhaseHoursSettings(settings: FieldSettings | null | undefined): boolean {
  return settings?.formulaFormat === 'hours';
}

/**
 * Formato fixo do cálculo de fase por cima do que foi editado: R$ com 2 casas, ou horas no
 * "Total de horas" (sem prefixo; casas não se aplicam). Igual ao que o backend grava.
 */
export function withPhaseCalculatedFormat(settings: FieldSettings): FieldSettings {
  const { formulaFormat, ...rest } = settings;
  if (formulaFormat !== 'hours') return { ...rest, ...PHASE_CALCULATED_SETTINGS };
  // Em horas o resultado sai no relógio: prefixo, sufixo e casas não se aplicam.
  const { formulaPrefix: _prefix, formulaSuffix: _suffix, formulaDecimals: _decimals, ...hours } = rest;
  return { ...hours, formulaFormat: 'hours' };
}

/** Casas com que o cálculo de fase grava: R$ com 2; horas com todas (para horas × valor fechar). */
export function phaseCalculatedDecimals(settings: FieldSettings | null | undefined): number {
  return isPhaseHoursSettings(settings) ? getFormulaDecimals(settings ?? {}) : PHASE_CALCULATED_SETTINGS.formulaDecimals;
}

type AnswerLike = {
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

function rawOf(item: AnswerLike): unknown {
  return item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null;
}

/**
 * Prévia dos campos "Cálculo" enquanto o card é preenchido — o valor gravado sai do backend ao
 * salvar. Mesma precedência de lá: a resposta do formulário ganha num código repetido, depois o
 * que está sendo digitado na fase, por último o que já estava salvo nas fases.
 */
export function previewPhaseCalculations({
  phases,
  savedValues,
  editingValues,
  formAnswers,
}: {
  phases: KanbanPhase[];
  savedValues: PhaseFieldValue[];
  /** Valor em edição por id do campo de fase. */
  editingValues: Record<string, unknown>;
  formAnswers: AnswerLike[];
}): Record<string, number | null> {
  const fields = phases.flatMap((phase) => phase.fields);
  const calculated = fields.filter((field) => field.fieldType === 'calculated');
  if (calculated.length === 0) return {};
  const calculatedCodes = new Set(calculated.map((field) => field.code));

  const scope: Record<string, unknown> = {};
  for (const item of savedValues) scope[item.fieldCode] = rawOf(item);
  for (const field of fields) {
    if (field.id in editingValues) scope[field.code] = editingValues[field.id];
  }
  for (const item of formAnswers) scope[item.fieldCode] = rawOf(item);
  for (const code of calculatedCodes) delete scope[code];

  const byCode = computeCalculatedFieldValues(
    calculated.map((field) => ({
      code: field.code,
      formula: typeof field.settingsJson?.formula === 'string' ? field.settingsJson.formula : '',
      decimals: phaseCalculatedDecimals(field.settingsJson),
    })),
    scope,
  );
  return Object.fromEntries(calculated.map((field) => [field.id, byCode[field.code] ?? null]));
}
