import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  coerceAnswerToNumber,
  computeCalculatedFieldValues,
  getFormulaDecimals,
  getFormulaOptionScores,
  getFormulaSource,
} from '../../common/formula/formula.engine';

/**
 * Encaminhar para outro processo: monta as respostas do formulário de destino a partir do que o
 * card de origem tem (respostas do formulário, campos de fase, respostas dadas por fluxo). Funções
 * puras — quem lê o banco e grava é SolicitationsService.createFromHandoff.
 */

/** As quatro colunas de uma resposta (submission_items e kanban_phase_field_values). */
export interface HandoffAnswerValue {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
}

export interface HandoffChoice {
  value: string;
  label: string;
}

/** Resposta do card de origem com o tipo do campo de onde veio. */
export interface HandoffSourceAnswer extends HandoffAnswerValue {
  /** null = valor sem tipo (texto de um template, resposta dada por um fluxo). */
  fieldType: FormFieldType | null;
  options: HandoffChoice[];
}

export interface HandoffTargetField {
  id: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  options: HandoffChoice[];
  settingsJson: Record<string, unknown> | null;
}

/**
 * Um campo do destino e de onde vem o valor: um campo do card de origem (`sourceFieldCode`, o valor
 * vai com o tipo) ou um texto já resolvido (`text`, ex.: um template com {{variáveis}}).
 */
export interface HandoffMapping {
  targetFieldCode: string;
  sourceFieldCode?: string;
  text?: string;
}

export interface HandoffAnswerItem extends HandoffAnswerValue {
  fieldId: string;
  fieldCode: string;
}

export interface HandoffSkippedField {
  fieldCode: string;
  label: string;
  reason: string;
}

export interface HandoffAnswersPlan {
  items: HandoffAnswerItem[];
  /** Campo do destino que tinha de onde vir, mas o valor não coube nele. */
  skipped: HandoffSkippedField[];
  /** Obrigatório no destino e ficou sem resposta (o encaminhamento não trava por isso). */
  missingRequired: Array<{ fieldCode: string; label: string }>;
}

/** Só exibem texto, ou são preenchidos por quem edita o processo: não recebem resposta. */
const NO_ANSWER_TYPES = new Set<FormFieldType>([
  FormFieldType.TITLE,
  FormFieldType.DESCRIPTION,
  FormFieldType.DIVIDER,
  FormFieldType.FILE_DOWNLOAD,
]);

/** O valor é um retrato montado no envio (ou um arquivo): só passa de um campo do mesmo tipo. */
const SAME_TYPE_ONLY = new Set<FormFieldType>([
  FormFieldType.ERP_LOOKUP,
  FormFieldType.ERP_TABLE,
  FormFieldType.ITEM_ORDER,
  FormFieldType.PRODUCT_TABLE,
]);

const NUMBER_TYPES = new Set<FormFieldType>([
  FormFieldType.NUMBER,
  FormFieldType.SCALE,
  FormFieldType.RATING,
]);

const EMPTY: HandoffAnswerValue = {
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  valueJson: null,
};

export function buildHandoffAnswers(input: {
  targetFields: readonly HandoffTargetField[];
  sourceAnswers: ReadonlyMap<string, HandoffSourceAnswer>;
  mappings: readonly HandoffMapping[];
  /** Campo do destino com o mesmo código de um campo da origem recebe o valor sem mapeamento. */
  autoMatchByCode: boolean;
}): HandoffAnswersPlan {
  const mappingByTarget = new Map<string, HandoffMapping>();
  for (const mapping of input.mappings) {
    const code = mapping.targetFieldCode?.trim();
    if (code) mappingByTarget.set(code, mapping);
  }

  const items: HandoffAnswerItem[] = [];
  const skipped: HandoffSkippedField[] = [];

  for (const field of input.targetFields) {
    if (NO_ANSWER_TYPES.has(field.fieldType) || field.fieldType === FormFieldType.CALCULATED) continue;

    const source = resolveSource(field, mappingByTarget.get(field.code), input);
    if (!source || !hasValue(source)) continue;

    if (field.fieldType === FormFieldType.FILE_UPLOAD) {
      // O arquivo vai como anexo do card (copyAttachments); a resposta aponta para o da origem.
      skipped.push({ fieldCode: field.code, label: field.label, reason: 'arquivos vão como anexos do card' });
      continue;
    }

    const converted = convertAnswer(source, field);
    if ('reason' in converted) {
      skipped.push({ fieldCode: field.code, label: field.label, reason: converted.reason });
      continue;
    }
    if (!hasValue({ ...converted, fieldType: field.fieldType, options: [] })) continue;
    items.push({ fieldId: field.id, fieldCode: field.code, ...converted });
  }

  items.push(...computeCalculatedItems(input.targetFields, items));

  const answered = new Set(items.map((item) => item.fieldCode));
  const missingRequired = input.targetFields
    .filter(
      (field) =>
        field.required &&
        !answered.has(field.code) &&
        !NO_ANSWER_TYPES.has(field.fieldType) &&
        field.fieldType !== FormFieldType.CALCULATED &&
        field.fieldType !== FormFieldType.FILE_UPLOAD,
    )
    .map((field) => ({ fieldCode: field.code, label: field.label }));

  return { items, skipped, missingRequired };
}

function resolveSource(
  field: HandoffTargetField,
  mapping: HandoffMapping | undefined,
  input: { sourceAnswers: ReadonlyMap<string, HandoffSourceAnswer>; autoMatchByCode: boolean },
): HandoffSourceAnswer | null {
  if (mapping) {
    const sourceCode = mapping.sourceFieldCode?.trim();
    if (sourceCode) return input.sourceAnswers.get(sourceCode) ?? null;
    if (typeof mapping.text === 'string') {
      const text = mapping.text.trim();
      return text ? { ...EMPTY, valueText: text, fieldType: null, options: [] } : null;
    }
    return null;
  }
  return input.autoMatchByCode ? (input.sourceAnswers.get(field.code) ?? null) : null;
}

function hasValue(answer: HandoffSourceAnswer): boolean {
  if (answer.valueText !== null && answer.valueText.trim() !== '') return true;
  if (answer.valueNumber !== null && Number.isFinite(answer.valueNumber)) return true;
  if (answer.valueBoolean !== null) return true;
  if (Array.isArray(answer.valueJson)) return answer.valueJson.length > 0;
  return answer.valueJson !== null && answer.valueJson !== undefined;
}

/** Converte a resposta da origem para o tipo do campo do destino; `reason` = não coube. */
export function convertAnswer(
  source: HandoffSourceAnswer,
  target: Pick<HandoffTargetField, 'fieldType' | 'options' | 'label'>,
): HandoffAnswerValue | { reason: string } {
  const type = target.fieldType;

  if (type === FormFieldType.SINGLE_SELECT) {
    const picked = sourceChoices(source);
    if (picked.length > 1) return { reason: 'a origem tem várias opções e o campo aceita uma' };
    const option = picked[0] ? matchOption(target.options, picked[0]) : null;
    if (!option) return { reason: `"${picked[0]?.label ?? ''}" não é opção deste campo` };
    return { ...EMPTY, valueText: option.value };
  }

  if (type === FormFieldType.MULTI_SELECT) {
    const picked = sourceChoices(source, true);
    const values: string[] = [];
    const missing: string[] = [];
    for (const choice of picked) {
      const option = matchOption(target.options, choice);
      if (option) {
        if (!values.includes(option.value)) values.push(option.value);
      } else {
        missing.push(choice.label);
      }
    }
    if (values.length === 0) return { reason: `"${missing.join(', ')}" não é opção deste campo` };
    return { ...EMPTY, valueJson: values };
  }

  if (source.fieldType === type) {
    return {
      valueText: source.valueText,
      valueNumber: source.valueNumber,
      valueBoolean: source.valueBoolean,
      valueJson: source.valueJson ?? null,
    };
  }

  if (SAME_TYPE_ONLY.has(type)) {
    return { reason: 'só recebe valor de um campo do mesmo tipo' };
  }

  if (type === FormFieldType.CHECKBOX) {
    const value = source.valueBoolean ?? parseBoolean(displayText(source));
    return value === null ? { reason: 'o valor não é sim/não' } : { ...EMPTY, valueBoolean: value };
  }

  if (NUMBER_TYPES.has(type)) {
    const value = source.valueNumber ?? coerceAnswerToNumber(source.valueText);
    return value === null ? { reason: 'o valor não é um número' } : { ...EMPTY, valueNumber: value };
  }

  if (type === FormFieldType.CURRENCY) {
    // Moeda guarda o texto que a pessoa vê e o número para somar (ver FormSubmissionValidator).
    const number = source.valueNumber ?? coerceAnswerToNumber(source.valueText);
    if (number === null) return { reason: 'o valor não é um número' };
    const text =
      source.valueText?.trim() && source.fieldType !== FormFieldType.NUMBER
        ? source.valueText.trim()
        : number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return { ...EMPTY, valueText: text, valueNumber: number };
  }

  const text = displayText(source);
  if (text === null) return { reason: 'a origem não tem texto para este campo' };
  if (type === FormFieldType.DATE && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return { ...EMPTY, valueText: text.slice(0, 10) };
  }
  return { ...EMPTY, valueText: text };
}

/** Opções escolhidas na origem, com o rótulo (que é o que casa com a opção do destino). */
function sourceChoices(source: HandoffSourceAnswer, splitText = false): HandoffChoice[] {
  const labelOf = (value: string): string =>
    source.options.find((option) => option.value === value)?.label ?? value;
  if (Array.isArray(source.valueJson)) {
    return source.valueJson
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .map((value) => ({ value, label: labelOf(value) }));
  }
  const text = source.fieldType === FormFieldType.SINGLE_SELECT ? source.valueText : displayText(source);
  if (!text?.trim()) return [];
  if (splitText && source.fieldType !== FormFieldType.SINGLE_SELECT && /[,;\n]/.test(text)) {
    return text
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((value) => ({ value, label: value }));
  }
  const value = text.trim();
  return [{ value, label: labelOf(value) }];
}

/** Mesmo valor interno, senão mesmo rótulo (sem diferenciar maiúsculas). */
function matchOption(options: readonly HandoffChoice[], choice: HandoffChoice): HandoffChoice | null {
  const byValue = options.find((option) => option.value === choice.value);
  if (byValue) return byValue;
  const wanted = [choice.label, choice.value].map(normalizeLabel);
  return options.find((option) => wanted.includes(normalizeLabel(option.label))) ?? null;
}

function normalizeLabel(text: string): string {
  return text.trim().toLocaleLowerCase('pt-BR');
}

/** O que a pessoa leria na resposta da origem, como texto; null = não tem texto (tabela, itens). */
function displayText(source: HandoffSourceAnswer): string | null {
  switch (source.fieldType) {
    case FormFieldType.SINGLE_SELECT: {
      const value = source.valueText?.trim();
      if (!value) return null;
      return source.options.find((option) => option.value === value)?.label ?? value;
    }
    case FormFieldType.MULTI_SELECT: {
      const labels = sourceChoices(source).map((choice) => choice.label);
      return labels.length > 0 ? labels.join(', ') : null;
    }
    case FormFieldType.CHECKBOX:
      return source.valueBoolean === null ? null : source.valueBoolean ? 'Sim' : 'Não';
    case FormFieldType.ERP_LOOKUP: {
      if (source.valueText?.trim()) return source.valueText.trim();
      const json = source.valueJson as { label?: unknown; value?: unknown } | null;
      const label = typeof json?.label === 'string' ? json.label : json?.value;
      return typeof label === 'string' && label.trim() ? label.trim() : null;
    }
    case FormFieldType.ERP_TABLE:
    case FormFieldType.ITEM_ORDER:
    case FormFieldType.PRODUCT_TABLE:
    case FormFieldType.FILE_UPLOAD:
      return null;
    default:
      break;
  }
  if (source.valueText !== null && source.valueText.trim() !== '') return source.valueText.trim();
  if (source.valueNumber !== null && Number.isFinite(source.valueNumber)) {
    return source.valueNumber.toLocaleString('pt-BR', { maximumFractionDigits: 10 });
  }
  if (source.valueBoolean !== null) return source.valueBoolean ? 'Sim' : 'Não';
  return null;
}

function parseBoolean(text: string | null): boolean | null {
  const normalized = text?.trim().toLocaleLowerCase('pt-BR');
  if (!normalized) return null;
  if (['sim', 's', 'true', '1', 'yes', 'verdadeiro', 'x'].includes(normalized)) return true;
  if (['não', 'nao', 'n', 'false', '0', 'no', 'falso'].includes(normalized)) return false;
  return null;
}

/** Cálculos do destino, refeitos com as respostas copiadas (como no envio do formulário). */
function computeCalculatedItems(
  targetFields: readonly HandoffTargetField[],
  items: readonly HandoffAnswerItem[],
): HandoffAnswerItem[] {
  const calculated = targetFields.filter((field) => field.fieldType === FormFieldType.CALCULATED);
  if (calculated.length === 0) return [];

  const raw: Record<string, unknown> = {};
  for (const item of items) {
    raw[item.fieldCode] = item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? item.valueText;
  }
  const computed = computeCalculatedFieldValues(
    calculated.map((field) => ({
      code: field.code,
      formula: getFormulaSource(field.settingsJson),
      decimals: getFormulaDecimals(field.settingsJson),
      optionScores: getFormulaOptionScores(field.settingsJson),
    })),
    raw,
  );

  return calculated.flatMap((field) => {
    const value = computed[field.code];
    return value === null || value === undefined
      ? []
      : [{ fieldId: field.id, fieldCode: field.code, ...EMPTY, valueNumber: value }];
  });
}
