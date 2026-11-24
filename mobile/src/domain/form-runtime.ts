import type { FormField, FormSection, PublicForm, SubmitItem } from '../api/types';
import {
  computeCalculatedFieldValues,
  getFormulaDecimals,
  getFormulaOptionScores,
  type CalculatedFieldSpec,
} from '../utils/formula';
import { isItemOrderAnswer, toItemOrderSubmitValue, validateItemOrderAnswer, type ItemOrderAnswer } from './item-order';

/*
 * Motor do formulário de abertura — espelho de frontend/src/modules/public-form/form-runtime.ts
 * (caminho das seções, regras de visibilidade, validação e envio). O backend refaz tudo no envio.
 */

export type ProductTableRow = { produto: string; values: Record<string, string | number | null> };

export type AnswerValue =
  | string
  | number
  | boolean
  | string[]
  | ProductTableRow[]
  | ItemOrderAnswer
  | null;

/** Campos que só desenham (título, texto, divisor, arquivo para baixar): não têm resposta. */
export const DECORATIVE_TYPES = new Set(['title', 'description', 'divider', 'file_download']);

/** Campos que o app ainda não preenche (dependem do ERP ao vivo): quem responde usa o web. */
export const WEB_ONLY_TYPES = new Set(['erp_table', 'erp_lookup']);

type SectionBranch = {
  id?: string;
  fieldCode: string | null;
  optionValue: string | null;
  checkboxValue: boolean | null;
  targetSectionId: string | null;
  targetIsSubmit: boolean;
};

export type RuntimeSection = FormSection & {
  nextSectionId?: string | null;
  nextIsSubmit?: boolean;
  branches?: SectionBranch[];
};

type VisibilityCondition = { fieldCode: string; operator: string; value?: string | number };
type VisibilityRule = { operator: 'and' | 'or'; conditions: VisibilityCondition[]; action: 'show' | 'hide' };
type ConditionRule = { fieldCode: string; operator: string; value?: unknown };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function settingsOf(field: FormField): Record<string, unknown> {
  return field.settingsJson ?? {};
}

export function isHiddenFromRespondent(field: FormField): boolean {
  return field.fieldType === 'calculated' && settingsOf(field).hideFromRespondent === true;
}

// ── Valores ─────────────────────────────────────────────────────────────────

function isProductTableRow(item: unknown): item is ProductTableRow {
  return !!item && typeof item === 'object' && 'produto' in item && 'values' in item;
}

function normalizeProductTableRow(row: ProductTableRow): ProductTableRow {
  const produto = typeof row?.produto === 'string' ? row.produto.trim() : '';
  const values: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(row?.values ?? {})) {
    if (typeof raw === 'number' && Number.isFinite(raw)) values[key] = raw;
    else if (typeof raw === 'string' && raw.trim().length > 0) values[key] = raw.trim();
  }
  return { produto, values };
}

export function normalizeAnswerValue(value: AnswerValue): AnswerValue {
  if (Array.isArray(value)) {
    if (value.length > 0 && isProductTableRow(value[0])) {
      return (value as ProductTableRow[])
        .map(normalizeProductTableRow)
        .filter((row) => row.produto.length > 0 && Object.keys(row.values).length > 0);
    }
    return (value as string[]).filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

export function isAnswerEmpty(value: AnswerValue | undefined): boolean {
  const normalized = normalizeAnswerValue(value ?? null);
  if (normalized === null || normalized === undefined) return true;
  if (typeof normalized === 'string') return normalized.length === 0;
  if (Array.isArray(normalized)) return normalized.length === 0;
  if (typeof normalized === 'boolean') return !normalized;
  if (typeof normalized === 'number') return Number.isNaN(normalized);
  if (isItemOrderAnswer(normalized)) return normalized.rows.length === 0;
  return false;
}

function comparable(value: AnswerValue | undefined): unknown {
  const normalized = normalizeAnswerValue(value ?? null);
  if (isItemOrderAnswer(normalized)) return normalized.rows.map((row) => row.key);
  return normalized;
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

function calculatedSpecs(form: PublicForm): CalculatedFieldSpec[] {
  return form.activeVersion.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.fieldType === 'calculated')
    .map((field) => ({
      code: field.code,
      formula: typeof settingsOf(field).formula === 'string' ? (settingsOf(field).formula as string) : '',
      decimals: getFormulaDecimals(settingsOf(field)),
      optionScores: getFormulaOptionScores(settingsOf(field)),
    }));
}

/** Respostas + o valor de cada "Cálculo" (nunca fica no estado: sempre derivado daqui). */
export function resolveAnswers(
  form: PublicForm,
  answersById: Record<string, AnswerValue>,
): { answersById: Record<string, AnswerValue>; answersByCode: Record<string, AnswerValue> } {
  const fields = form.activeVersion.sections.flatMap((section) => section.fields);
  const answersByCode: Record<string, AnswerValue> = {};
  for (const field of fields) answersByCode[field.code] = answersById[field.id] ?? null;
  const specs = calculatedSpecs(form);
  if (specs.length === 0) return { answersById, answersByCode };
  const computed = computeCalculatedFieldValues(specs, answersByCode);
  const effective = { ...answersById };
  for (const field of fields) {
    if (field.fieldType !== 'calculated') continue;
    const value = computed[field.code] ?? null;
    answersByCode[field.code] = value;
    effective[field.id] = value;
  }
  return { answersById: effective, answersByCode };
}

// ── Visibilidade e caminho ──────────────────────────────────────────────────

function evaluateRule(rule: ConditionRule, answers: Record<string, AnswerValue>): boolean {
  const current = comparable(answers[rule.fieldCode]);
  const expected = rule.value;
  switch (rule.operator) {
    case 'equals':
      return current === expected;
    case 'not_equals':
      return current !== expected;
    case 'is_empty':
      return isAnswerEmpty(current as AnswerValue);
    case 'is_not_empty':
      return !isAnswerEmpty(current as AnswerValue);
    case 'contains':
      if (typeof current === 'string' && typeof expected === 'string') return current.includes(expected);
      if (Array.isArray(current)) return current.includes(expected as string);
      return false;
    default:
      return true;
  }
}

function evaluateCondition(condition: VisibilityCondition, answers: Record<string, AnswerValue>): boolean {
  const raw = answers[condition.fieldCode] ?? null;
  const current = comparable(raw);
  const expected = condition.value;
  switch (condition.operator) {
    case 'equals':
      return String(current ?? '') === String(expected ?? '');
    case 'not_equals':
      return String(current ?? '') !== String(expected ?? '');
    case 'contains':
      if (typeof current === 'string' && typeof expected === 'string') return current.includes(expected);
      if (Array.isArray(current)) return current.includes(expected as string);
      return false;
    case 'greater_than': {
      const num = Number(current);
      return Number.isFinite(num) && num > Number(expected);
    }
    case 'less_than': {
      const num = Number(current);
      return Number.isFinite(num) && num < Number(expected);
    }
    case 'is_empty':
      return isAnswerEmpty(raw);
    case 'is_not_empty':
      return !isAnswerEmpty(raw);
    default:
      return true;
  }
}

function evaluateVisibilityRule(rule: VisibilityRule, answers: Record<string, AnswerValue>): boolean {
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((condition) => evaluateCondition(condition, answers));
  const met = rule.operator === 'or' ? results.some(Boolean) : results.every(Boolean);
  if (rule.action === 'show') return met;
  if (rule.action === 'hide') return !met;
  return true;
}

export function isFieldVisible(field: FormField, answersByCode: Record<string, AnswerValue>): boolean {
  const conditions = (field.conditionsJson ?? {}) as { show_if?: ConditionRule[] };
  const showIf = Array.isArray(conditions.show_if) ? conditions.show_if : [];
  if (showIf.length > 0 && !showIf.every((rule) => evaluateRule(rule, answersByCode))) return false;
  const rules = (field as FormField & { visibilityRules?: VisibilityRule[] | null }).visibilityRules;
  if (rules && rules.length > 0) return rules.every((rule) => evaluateVisibilityRule(rule, answersByCode));
  return true;
}

function isBranchMatch(branch: SectionBranch, answersByCode: Record<string, AnswerValue>): boolean {
  if (!branch.fieldCode) return false;
  const current = comparable(answersByCode[branch.fieldCode]);
  if (branch.optionValue !== null) {
    return Array.isArray(current) ? current.includes(branch.optionValue) : String(current ?? '') === branch.optionValue;
  }
  if (branch.checkboxValue !== null) return Boolean(current) === branch.checkboxValue;
  return false;
}

function nextSectionId(section: RuntimeSection, answersByCode: Record<string, AnswerValue>): string | null {
  for (const branch of section.branches ?? []) {
    if (isBranchMatch(branch, answersByCode)) return branch.targetIsSubmit ? null : branch.targetSectionId;
  }
  if (section.nextIsSubmit) return null;
  return section.nextSectionId ?? null;
}

/**
 * Seções do caminho com as respostas atuais (ramificação do formulário). Seção sem destino
 * configurado segue para a próxima na ordem — o padrão de quem nunca mexeu no caminho.
 */
export function walkSectionPath(form: PublicForm, answersByCode: Record<string, AnswerValue>): RuntimeSection[] {
  const sections = [...(form.activeVersion.sections as RuntimeSection[])].sort((a, b) => a.order - b.order);
  const byId = new Map(sections.map((section) => [section.id, section]));
  const hasRouting = sections.some(
    (section) => section.nextSectionId !== undefined || section.nextIsSubmit !== undefined || section.branches !== undefined,
  );
  if (!hasRouting) return sections;
  const path: RuntimeSection[] = [];
  const guard = new Set<string>();
  let current: RuntimeSection | undefined = sections[0];
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.push(current);
    const nextId = nextSectionId(current, answersByCode);
    current = nextId ? byId.get(nextId) : undefined;
  }
  return path;
}

export function visibleSections(form: PublicForm, answersByCode: Record<string, AnswerValue>): RuntimeSection[] {
  return walkSectionPath(form, answersByCode)
    .filter((section) => section.fields.length === 0 || section.fields.some((field) => !isHiddenFromRespondent(field)))
    .map((section) => ({
      ...section,
      fields: [...section.fields]
        .sort((a, b) => a.order - b.order)
        .filter((field) => !isHiddenFromRespondent(field) && isFieldVisible(field, answersByCode)),
    }))
    .filter((section) => section.fields.length > 0 || !!section.title || !!section.description);
}

// ── Validação ───────────────────────────────────────────────────────────────

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(digits[10]);
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((total, item, index) => total + Number(item) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const base = digits.slice(0, 12);
  const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(`${base}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${base}${d1}${d2}`;
}

function numberSetting(settings: Record<string, unknown>, key: string): number | undefined {
  const raw = settings[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/** Mesmas regras do web (obrigatório, e-mail, CPF/CNPJ, CEP, telefone, limites). */
export function validateFieldValue(field: FormField, value: AnswerValue | undefined): string | null {
  const settings = settingsOf(field);
  if (field.fieldType === 'item_order') return validateItemOrderAnswer(field, value ?? null);
  if (WEB_ONLY_TYPES.has(field.fieldType)) {
    return field.required ? 'Este campo só pode ser preenchido pelo portal web.' : null;
  }
  const normalized = normalizeAnswerValue(value ?? null);
  if (field.fieldType === 'calculated') {
    return field.required && isAnswerEmpty(normalized) ? 'Preencha os campos usados neste cálculo.' : null;
  }
  if (field.required && isAnswerEmpty(normalized)) return 'Este campo é obrigatório.';
  if (isAnswerEmpty(normalized)) return null;

  const text = String(normalized);
  switch (field.fieldType) {
    case 'email':
      return EMAIL_REGEX.test(text) ? null : 'E-mail inválido.';
    case 'cpf':
      return isValidCpf(text) ? null : 'CPF inválido.';
    case 'cnpj':
      return isValidCnpj(text) ? null : 'CNPJ inválido.';
    case 'cep':
      return onlyDigits(text).length === 8 ? null : 'CEP incompleto.';
    case 'phone': {
      const n = onlyDigits(text).length;
      return n === 10 || n === 11 ? null : 'Telefone inválido.';
    }
    case 'currency': {
      const raw = text.replace(/^R\$\s?/, '').replace(/\./g, '').replace(',', '.');
      return Number.isNaN(Number(raw)) || raw.trim() === '' ? 'Valor monetário inválido.' : null;
    }
    case 'time':
      return /^\d{2}:\d{2}$/.test(text) ? null : 'Hora inválida.';
    case 'datetime':
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? null : 'Data e hora inválidas.';
    case 'short_text': {
      const min = numberSetting(settings, 'minLength');
      const max = numberSetting(settings, 'maxLength');
      if (min !== undefined && text.length < min) return `Mínimo de ${min} caractere(s).`;
      if (max !== undefined && text.length > max) return `Máximo de ${max} caractere(s).`;
      return null;
    }
    case 'long_text': {
      const max = numberSetting(settings, 'maxLength');
      return max !== undefined && text.length > max ? `Máximo de ${max} caractere(s).` : null;
    }
    case 'number': {
      const num = typeof normalized === 'number' ? normalized : Number(normalized);
      if (!Number.isFinite(num)) return 'Número inválido.';
      const min = numberSetting(settings, 'min');
      const max = numberSetting(settings, 'max');
      const decimals = numberSetting(settings, 'decimals');
      if (min !== undefined && num < min) return `Valor mínimo: ${min}.`;
      if (max !== undefined && num > max) return `Valor máximo: ${max}.`;
      if (decimals !== undefined && (String(num).split('.')[1]?.length ?? 0) > decimals) {
        return `Máximo de ${decimals} casa(s) decimal(is).`;
      }
      return null;
    }
    case 'scale':
    case 'rating': {
      const num = typeof normalized === 'number' ? normalized : Number(normalized);
      const max = numberSetting(settings, 'max') ?? 5;
      return !Number.isFinite(num) || num < 1 || num > max ? `Escolha um valor entre 1 e ${max}.` : null;
    }
    case 'date': {
      const minDate = typeof settings.minDate === 'string' ? settings.minDate : null;
      const maxDate = typeof settings.maxDate === 'string' ? settings.maxDate : null;
      if (minDate && text < minDate) return `Data mínima: ${formatIsoDate(minDate)}.`;
      if (maxDate && text > maxDate) return `Data máxima: ${formatIsoDate(maxDate)}.`;
      return null;
    }
    case 'single_select':
      return field.options.some((option) => option.internalValue === normalized) ? null : 'Opção inválida.';
    case 'multi_select': {
      const allowed = new Set(field.options.map((option) => option.internalValue));
      return (normalized as string[]).some((option) => !allowed.has(option)) ? 'Uma ou mais opções são inválidas.' : null;
    }
    default:
      return null;
  }
}

function formatIsoDate(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

// ── Envio ───────────────────────────────────────────────────────────────────

function productTableColumns(field: FormField): Array<{ id: string; label: string; type: string; filledBy: string }> {
  const columns = settingsOf(field).productTableColumns;
  return Array.isArray(columns) && columns.length > 0
    ? (columns as Array<{ id: string; label: string; type: string; filledBy: string }>)
    : [{ id: 'quantidade', label: 'Quantidade', type: 'number', filledBy: 'respondent' }];
}

export { productTableColumns };

function mergeCreatorColumnValues(field: FormField, row: ProductTableRow): ProductTableRow {
  const creatorColumns = productTableColumns(field).filter((column) => column.filledBy === 'creator');
  if (creatorColumns.length === 0) return row;
  const option = field.options.find((item) => item.displayLabel === row.produto);
  const presetsByValue = settingsOf(field).productTableProductValues as Record<string, Record<string, string | number>> | undefined;
  const presets = option ? presetsByValue?.[option.internalValue] : undefined;
  if (!presets) return row;
  const values = { ...row.values };
  for (const column of creatorColumns) {
    const preset = presets[column.id];
    if (preset !== undefined && preset !== null && preset !== '') values[column.label] = preset;
  }
  return { ...row, values };
}

export function fieldToSubmitItem(field: FormField, rawValue: AnswerValue | undefined): SubmitItem | null {
  const value = normalizeAnswerValue(rawValue ?? null);
  if (value === null || value === undefined) return null;
  const base = { fieldId: field.id, fieldCode: field.code };
  switch (field.fieldType) {
    case 'multi_select':
      return Array.isArray(value) && value.length > 0 ? { ...base, valueJson: value } : null;
    case 'product_table':
      return Array.isArray(value) && value.length > 0
        ? { ...base, valueJson: (value as ProductTableRow[]).map((row) => mergeCreatorColumnValues(field, row)) }
        : null;
    case 'checkbox':
      return typeof value === 'boolean' ? { ...base, valueBoolean: value } : null;
    case 'number':
    case 'scale':
    case 'rating':
    case 'calculated':
      return typeof value === 'number' && Number.isFinite(value) ? { ...base, valueNumber: value } : null;
    case 'file_upload':
      return null; // sobem depois do envio, ligados à resposta
    case 'item_order':
      return isItemOrderAnswer(value) && value.rows.length > 0 ? { ...base, valueJson: toItemOrderSubmitValue(field, value) } : null;
    case 'erp_table':
    case 'erp_lookup':
      return null;
    default:
      if (typeof value === 'string') return value.length === 0 ? null : { ...base, valueText: value };
      return { ...base, valueText: String(value) };
  }
}
