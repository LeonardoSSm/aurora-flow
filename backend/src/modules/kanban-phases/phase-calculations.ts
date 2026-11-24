import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  coerceAnswerToNumber,
  computeCalculatedFieldValues,
  getFormulaDecimals,
  getFormulaSource,
  tryCompileFormula,
} from '../../common/formula/formula.engine';
import type { SubmissionItemEntity } from '../../database/entities';
import { buildFlowFieldValues, buildPhaseFieldValues } from '../flows/lib/flow-field-values';

/** Cálculo de fase é dinheiro: R$ com duas casas — menos o "Total de horas", que sai no relógio. */
export const PHASE_CALCULATED_SETTINGS = { formulaDecimals: 2, formulaPrefix: 'R$ ' } as const;

/** "Total de horas" de fase: cálculo em horas (8h30), não em R$. */
export function isPhaseHoursSettings(settings: Record<string, unknown> | null | undefined): boolean {
  return settings?.formulaFormat === 'hours';
}

/** Casas com que o cálculo de fase grava: R$ com 2; horas com todas (para horas × valor fechar). */
function phaseCalculatedDecimals(settings: Record<string, unknown> | null | undefined): number {
  return isPhaseHoursSettings(settings)
    ? getFormulaDecimals(settings)
    : PHASE_CALCULATED_SETTINGS.formulaDecimals;
}

type AnswerItem = Pick<
  SubmissionItemEntity,
  'fieldCode' | 'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson'
>;

export type PhaseValueColumns = {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

/**
 * Valor de campo de fase como vai para o banco. "Valor (R$)" guarda o texto que a pessoa viu
 * ("R$ 1.500,00") e também o número — sem ele o valor não soma no total da coluna nem entra num
 * cálculo; "Número" digitado como texto vira número. Os outros tipos ficam como vieram.
 */
export function normalizePhaseValue(
  fieldType: FormFieldType | string,
  input: Partial<PhaseValueColumns>,
): PhaseValueColumns {
  const value: PhaseValueColumns = {
    valueText: input.valueText ?? null,
    valueNumber: input.valueNumber ?? null,
    valueBoolean: input.valueBoolean ?? null,
    valueJson: input.valueJson ?? null,
  };
  if (fieldType === FormFieldType.CURRENCY) {
    const text = typeof value.valueText === 'string' ? value.valueText.trim() : '';
    return {
      ...value,
      valueText: text || null,
      valueNumber: coerceAnswerToNumber(text || value.valueNumber),
    };
  }
  if (fieldType === FormFieldType.NUMBER && value.valueNumber === null && value.valueText) {
    return { ...value, valueText: null, valueNumber: coerceAnswerToNumber(value.valueText) };
  }
  return value;
}

/**
 * Valores por código que uma fórmula de fase enxerga — a mesma precedência dos fluxos
 * (FlowsService.withSolicitationFieldValues): a resposta do formulário ganha num código repetido,
 * depois o valor dado por um fluxo, por último o campo de fase.
 */
export function phaseFormulaScope(
  formItems: readonly AnswerItem[],
  flowGivenValues: Record<string, unknown>,
  phaseValues: readonly AnswerItem[],
): Record<string, unknown> {
  return {
    ...buildPhaseFieldValues(phaseValues),
    ...flowGivenValues,
    ...buildFlowFieldValues(formItems),
  };
}

/**
 * Recalcula os campos "Cálculo" das fases. O valor nunca vem do navegador: sai daqui, com os
 * valores salvos, então um card adulterado não forja um total. Um cálculo pode usar outro.
 */
export function computePhaseCalculations(
  fields: ReadonlyArray<{ code: string; settingsJson: Record<string, unknown> | null }>,
  scope: Record<string, unknown>,
): Record<string, number | null> {
  if (fields.length === 0) return {};
  const ownCodes = new Set(fields.map((field) => field.code));
  // O valor velho de um cálculo não pode entrar como "resposta" no lugar do recálculo.
  const rawValues = Object.fromEntries(
    Object.entries(scope).filter(([code]) => !ownCodes.has(code)),
  );
  return computeCalculatedFieldValues(
    fields.map((field) => ({
      code: field.code,
      formula: getFormulaSource(field.settingsJson),
      decimals: phaseCalculatedDecimals(field.settingsJson),
    })),
    rawValues,
  );
}

/**
 * Configuração gravada de um "Cálculo" de fase: fórmula conferida e formato fixo — R$, ou horas
 * (8h30) no "Total de horas".
 */
export function normalizePhaseCalculatedSettings(
  label: string,
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const formula = getFormulaSource(settings).trim();
  if (!formula) {
    throw new Error(`O cálculo "${label}" está sem fórmula.`);
  }
  const compiled = tryCompileFormula(formula);
  if (!compiled.ok) {
    throw new Error(`A fórmula do cálculo "${label}" tem erro: ${compiled.error}`);
  }
  const rest: Record<string, unknown> = { ...(settings ?? {}) };
  delete rest.formulaFormat;
  if (!isPhaseHoursSettings(settings)) return { ...rest, formula, ...PHASE_CALCULATED_SETTINGS };
  // Em horas o resultado sai no relógio: prefixo, sufixo e casas não se aplicam.
  delete rest.formulaPrefix;
  delete rest.formulaSuffix;
  delete rest.formulaDecimals;
  return { ...rest, formula, formulaFormat: 'hours' };
}
