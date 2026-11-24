import {
  computeCalculatedFieldValues,
  getFormulaDecimals,
  getFormulaOptionScores,
} from '../forms/formula';
import type { CalculatedFieldSpec } from '../forms/formula';
import type {
  FieldConditionRule,
  FieldConditions,
  FieldSettings,
  ProductTableColumn,
  VisibilityRule,
  VisibilityCondition,
} from '../forms/types';
import type {
  ErpLookupAnswer,
  ProductTableRow,
  PublicAnswerValue,
  PublicFieldErrorMap,
  PublicForm,
  PublicFormField,
  PublicFormSection,
  PublicSubmitItem,
  UploadedPublicFile,
} from './types';

import { fileLabelRequired, isUploadLabeled, type PendingUpload } from '../../lib/attachment-upload';
import { isErpTableAnswer, toErpTableSubmitValue, validateErpTableAnswer } from './erp-table';
import { isItemOrderAnswer, toItemOrderSubmitValue, validateItemOrderAnswer } from './item-order';
import { userEmailSuggestionError } from './user-email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const decorativeFieldTypes = new Set(['title', 'description', 'divider', 'file_download']);

export function isCalculatedFieldType(fieldType: PublicFormField['fieldType']) {
  return fieldType === 'calculated';
}

/** Cálculo marcado "não mostrar para quem responde": fica fora da tela e da validação. */
export function isHiddenFromRespondent(field: Pick<PublicFormField, 'fieldType' | 'settingsJson'>) {
  return isCalculatedFieldType(field.fieldType) && field.settingsJson?.hideFromRespondent === true;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function isRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || isRepeatedDigits(digits)) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }
  let verifier = (sum * 10) % 11;
  if (verifier === 10) {
    verifier = 0;
  }
  if (verifier !== Number(digits[9])) {
    return false;
  }

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index);
  }
  verifier = (sum * 10) % 11;
  if (verifier === 10) {
    verifier = 0;
  }

  return verifier === Number(digits[10]);
}

export function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || isRepeatedDigits(digits)) {
    return false;
  }

  const calc = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((total, item, index) => total + Number(item) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const base = digits.slice(0, 12);
  const digit1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calc(`${base}${digit1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${base}${digit1}${digit2}`;
}

export function isProductTableRow(item: unknown): item is ProductTableRow {
  return !!item && typeof item === 'object' && 'produto' in item && 'values' in item;
}

const DEFAULT_PRODUCT_TABLE_COLUMNS: ProductTableColumn[] = [
  { id: 'quantidade', label: 'Quantidade', type: 'number', filledBy: 'respondent' },
];

/** Colunas configuradas pelo criador para a tabela de produtos (com um fallback seguro). */
export function getProductTableColumns(settingsJson: FieldSettings): ProductTableColumn[] {
  return settingsJson.productTableColumns && settingsJson.productTableColumns.length > 0
    ? settingsJson.productTableColumns
    : DEFAULT_PRODUCT_TABLE_COLUMNS;
}

/**
 * Injeta na linha os valores fixos que o criador definiu por produto (colunas
 * filledBy: 'creator') — nunca fazem parte do estado local de resposta, só entram
 * aqui, no momento de montar o item a enviar, e só para produtos que o respondente
 * de fato preencheu em alguma coluna.
 */
function mergeCreatorColumnValues(field: PublicFormField, row: ProductTableRow): ProductTableRow {
  const creatorColumns = getProductTableColumns(field.settingsJson).filter(
    (column) => column.filledBy === 'creator',
  );
  if (creatorColumns.length === 0) return row;

  const option = field.options.find((item) => item.displayLabel === row.produto);
  const presets = option ? field.settingsJson.productTableProductValues?.[option.internalValue] : undefined;
  if (!presets) return row;

  const values = { ...row.values };
  for (const column of creatorColumns) {
    const preset = presets[column.id];
    if (preset !== undefined && preset !== null && preset !== '') {
      values[column.label] = preset;
    }
  }
  return { ...row, values };
}

function normalizeProductTableRow(row: ProductTableRow) {
  const produto = typeof row?.produto === 'string' ? row.produto.trim() : '';
  const rawValues = row?.values && typeof row.values === 'object' ? row.values : {};
  const values: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(rawValues)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      values[key] = raw;
    } else if (typeof raw === 'string' && raw.trim().length > 0) {
      values[key] = raw.trim();
    }
  }
  return { produto, values };
}

export function normalizeAnswerValue(value: PublicAnswerValue) {
  if (Array.isArray(value)) {
    if (value.length > 0 && isProductTableRow(value[0])) {
      // Só entram na resposta os produtos com pelo menos uma coluna preenchida —
      // os demais da lista fixa configurada pelo criador ficam de fora, como uma
      // opção de multi_select não marcada.
      return (value as ProductTableRow[])
        .map(normalizeProductTableRow)
        .filter((row) => row.produto.length > 0 && Object.keys(row.values).length > 0);
    }
    return (value as string[]).filter((item) => item.trim().length > 0);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
}

export function isUploadedFile(value: PublicAnswerValue): value is UploadedPublicFile {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'url' in value;
}

export function isErpLookupAnswer(value: PublicAnswerValue): value is ErpLookupAnswer {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as ErpLookupAnswer).value === 'string' &&
    typeof (value as ErpLookupAnswer).label === 'string'
  );
}

export function isAnswerEmpty(value: PublicAnswerValue) {
  const normalized = normalizeAnswerValue(value);
  if (normalized === null || normalized === undefined) {
    return true;
  }
  if (typeof normalized === 'string') {
    return normalized.length === 0;
  }
  if (Array.isArray(normalized)) {
    return normalized.length === 0;
  }
  if (typeof normalized === 'boolean') {
    return !normalized;
  }
  if (typeof normalized === 'number') {
    return Number.isNaN(normalized);
  }
  if (isUploadedFile(normalized)) {
    return !normalized.url;
  }
  if (isErpLookupAnswer(normalized)) {
    return !normalized.value.trim();
  }
  if (isErpTableAnswer(normalized)) {
    return !normalized.sourceHash || normalized.stale === true;
  }
  if (isItemOrderAnswer(normalized)) {
    return normalized.rows.length === 0;
  }
  return false;
}

export function getAnswerComparableValue(value: PublicAnswerValue): unknown {
  const normalized = normalizeAnswerValue(value);
  if (isUploadedFile(normalized)) {
    return normalized.url;
  }
  if (isErpLookupAnswer(normalized)) {
    return normalized.value;
  }
  if (isErpTableAnswer(normalized)) {
    return normalized.sourceHash;
  }
  if (isItemOrderAnswer(normalized)) {
    return normalized.rows.map((row) => row.key);
  }
  return normalized;
}

export function getCalculatedFieldSpecs(form: PublicForm): CalculatedFieldSpec[] {
  return form.activeVersion.sections
    .flatMap((section) => section.fields)
    .filter((field) => isCalculatedFieldType(field.fieldType))
    .map((field) => ({
      code: field.code,
      formula: field.settingsJson.formula ?? '',
      decimals: getFormulaDecimals(field.settingsJson),
      optionScores: getFormulaOptionScores(field.settingsJson),
    }));
}

/**
 * Respostas efetivas do formulário: o que o respondente preencheu, acrescido do
 * valor de cada campo calculado. Campos de fórmula nunca ficam no estado do
 * formulário — são sempre derivados aqui, para que validação, exibição e envio
 * usem exatamente o mesmo número.
 */
export function resolveAnswers(
  form: PublicForm,
  answersById: Record<string, PublicAnswerValue>,
): {
  answersById: Record<string, PublicAnswerValue>;
  answersByCode: Record<string, PublicAnswerValue>;
} {
  const fields = form.activeVersion.sections.flatMap((section) => section.fields);
  const answersByCode: Record<string, PublicAnswerValue> = {};
  for (const field of fields) {
    answersByCode[field.code] = answersById[field.id] ?? null;
  }

  const specs = getCalculatedFieldSpecs(form);
  if (specs.length === 0) {
    return { answersById, answersByCode };
  }

  const computedByCode = computeCalculatedFieldValues(specs, answersByCode);
  const effectiveById = { ...answersById };
  for (const field of fields) {
    if (!isCalculatedFieldType(field.fieldType)) continue;
    const value = computedByCode[field.code] ?? null;
    answersByCode[field.code] = value;
    effectiveById[field.id] = value;
  }

  return { answersById: effectiveById, answersByCode };
}

function evaluateRule(rule: FieldConditionRule, answers: Record<string, PublicAnswerValue>) {
  const currentValue = getAnswerComparableValue(answers[rule.fieldCode] ?? null);
  const expectedValue = rule.value;

  switch (rule.operator) {
    case 'equals':
      return currentValue === expectedValue;
    case 'not_equals':
      return currentValue !== expectedValue;
    case 'is_empty':
      return isAnswerEmpty((currentValue as PublicAnswerValue) ?? null);
    case 'is_not_empty':
      return !isAnswerEmpty((currentValue as PublicAnswerValue) ?? null);
    case 'contains':
      if (typeof currentValue === 'string' && typeof expectedValue === 'string') {
        return currentValue.includes(expectedValue);
      }
      if (Array.isArray(currentValue)) {
        return currentValue.includes(expectedValue as string);
      }
      return false;
    default:
      return true;
  }
}

function evaluateVisibilityCondition(
  condition: VisibilityCondition,
  answers: Record<string, PublicAnswerValue>,
): boolean {
  const raw = answers[condition.fieldCode] ?? null;
  const currentValue = getAnswerComparableValue(raw);
  const expected = condition.value;

  switch (condition.operator) {
    case 'equals':
      return String(currentValue ?? '') === String(expected ?? '');
    case 'not_equals':
      return String(currentValue ?? '') !== String(expected ?? '');
    case 'contains':
      if (typeof currentValue === 'string' && typeof expected === 'string') {
        return currentValue.includes(expected);
      }
      if (Array.isArray(currentValue)) {
        return currentValue.includes(expected as string);
      }
      return false;
    case 'greater_than': {
      const num = Number(currentValue);
      return Number.isFinite(num) && num > Number(expected);
    }
    case 'less_than': {
      const num = Number(currentValue);
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

function evaluateVisibilityRule(
  rule: VisibilityRule,
  answers: Record<string, PublicAnswerValue>,
): boolean {
  if (rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => evaluateVisibilityCondition(c, answers));
  const conditionsMet = rule.operator === 'or' ? results.some(Boolean) : results.every(Boolean);
  if (rule.action === 'show') return conditionsMet;
  if (rule.action === 'hide') return !conditionsMet;
  return true;
}

export function isFieldVisible(
  field: Pick<PublicFormField, 'conditionsJson' | 'visibilityRules'>,
  answersByCode: Record<string, PublicAnswerValue>,
) {
  const conditions = field.conditionsJson as FieldConditions;
  const showIf = Array.isArray(conditions.show_if) ? conditions.show_if : [];
  if (showIf.length > 0 && !showIf.every((rule) => evaluateRule(rule, answersByCode))) {
    return false;
  }

  const rules = field.visibilityRules;
  if (rules && rules.length > 0) {
    return rules.every((rule) => evaluateVisibilityRule(rule, answersByCode));
  }

  return true;
}

function isBranchMatch(
  branch: PublicFormSection['branches'][number],
  answersByCode: Record<string, PublicAnswerValue>,
): boolean {
  if (!branch.fieldCode) return false;
  const comparable = getAnswerComparableValue(answersByCode[branch.fieldCode] ?? null);

  if (branch.optionValue !== null) {
    return Array.isArray(comparable)
      ? comparable.includes(branch.optionValue)
      : String(comparable ?? '') === branch.optionValue;
  }
  if (branch.checkboxValue !== null) {
    return Boolean(comparable) === branch.checkboxValue;
  }
  return false;
}

export function resolveNextSectionId(
  section: PublicFormSection,
  answersByCode: Record<string, PublicAnswerValue>,
): string | null {
  for (const branch of section.branches) {
    if (isBranchMatch(branch, answersByCode)) {
      return branch.targetIsSubmit ? null : branch.targetSectionId;
    }
  }
  return section.nextIsSubmit ? null : section.nextSectionId;
}

export function walkSectionPath(
  form: PublicForm,
  answersByCode: Record<string, PublicAnswerValue>,
): PublicFormSection[] {
  const sections = form.activeVersion.sections;
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  const path: PublicFormSection[] = [];
  const guard = new Set<string>();
  let current: PublicFormSection | undefined = sorted[0];

  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.push(current);
    const nextId = resolveNextSectionId(current, answersByCode);
    current = nextId ? sectionById.get(nextId) : undefined;
  }

  return path;
}

export function getVisibleSections(
  form: PublicForm,
  answersByCode: Record<string, PublicAnswerValue>,
) {
  return (
    walkSectionPath(form, answersByCode)
      // Seção só com campos escondidos de quem responde (ex.: RESULTADO da auditoria) não vira
      // página vazia: sai do caminho de quem responde.
      .filter(
        (section) =>
          section.fields.length === 0 || section.fields.some((field) => !isHiddenFromRespondent(field)),
      )
      .map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) => !isHiddenFromRespondent(field) && isFieldVisible(field, answersByCode),
        ),
      }))
      .filter((section) => section.fields.length > 0 || section.title || section.description)
  );
}

function parseNumberSetting(settings: FieldSettings, key: keyof FieldSettings) {
  const rawValue = settings[key];
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : undefined;
}

export function validateFieldValue(
  field: PublicFormField,
  value: PublicAnswerValue,
): string | null {
  if (field.fieldType === 'erp_table') {
    // Obrigatoriedade, linhas e células têm regras próprias (erp-table.ts).
    return validateErpTableAnswer(field, value);
  }
  if (field.fieldType === 'item_order') {
    // Obrigatório = pelo menos um item; cada célula com as regras da coluna (item-order.ts).
    return validateItemOrderAnswer(field, value);
  }

  const normalized = normalizeAnswerValue(value);

  if (isCalculatedFieldType(field.fieldType)) {
    // O valor vem da fórmula: só resta cobrar os campos que alimentam o cálculo.
    if (field.required && isAnswerEmpty(normalized as PublicAnswerValue)) {
      return 'Preencha os campos usados neste cálculo.';
    }
    return null;
  }

  if (field.required && isAnswerEmpty(normalized as PublicAnswerValue)) {
    return 'Este campo é obrigatório.';
  }

  if (isAnswerEmpty(normalized as PublicAnswerValue)) {
    return null;
  }

  if (field.fieldType === 'email' && !EMAIL_REGEX.test(String(normalized))) {
    return 'E-mail inválido.';
  }
  if (field.fieldType === 'email') {
    const notSuggested = userEmailSuggestionError(field.settingsJson ?? {}, String(normalized));
    if (notSuggested) return notSuggested;
  }
  if (field.fieldType === 'cpf' && !isValidCpf(String(normalized))) {
    return 'CPF inválido.';
  }
  if (field.fieldType === 'cnpj' && !isValidCnpj(String(normalized))) {
    return 'CNPJ inválido.';
  }
  if (field.fieldType === 'cep') {
    const digits = String(normalized).replace(/\D/g, '');
    if (digits.length !== 8) {
      return 'CEP incompleto.';
    }
  }
  if (field.fieldType === 'phone') {
    const digits = String(normalized).replace(/\D/g, '');
    if (digits.length !== 10 && digits.length !== 11) {
      return 'Telefone inválido.';
    }
  }
  if (field.fieldType === 'currency') {
    const raw = String(normalized)
      .replace(/^R\$\s?/, '')
      .replace(/\./g, '')
      .replace(',', '.');
    if (isNaN(Number(raw)) || raw.trim() === '') {
      return 'Valor monetário inválido.';
    }
  }
  if (field.fieldType === 'time') {
    if (!/^\d{2}:\d{2}$/.test(String(normalized))) {
      return 'Hora inválida.';
    }
  }
  if (field.fieldType === 'datetime') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(normalized))) {
      return 'Data e hora inválidas.';
    }
  }

  if (field.fieldType === 'short_text') {
    const minLength = parseNumberSetting(field.settingsJson, 'minLength');
    const maxLength = parseNumberSetting(field.settingsJson, 'maxLength');
    const text = String(normalized);
    if (minLength !== undefined && text.length < minLength) {
      return `Mínimo de ${minLength} caractere(s).`;
    }
    if (maxLength !== undefined && text.length > maxLength) {
      return `Máximo de ${maxLength} caractere(s).`;
    }
  }

  if (field.fieldType === 'long_text') {
    const maxLength = parseNumberSetting(field.settingsJson, 'maxLength');
    const text = String(normalized);
    if (maxLength !== undefined && text.length > maxLength) {
      return `Máximo de ${maxLength} caractere(s).`;
    }
  }

  if (field.fieldType === 'number') {
    const valueNumber = typeof normalized === 'number' ? normalized : Number(normalized);
    if (!Number.isFinite(valueNumber)) {
      return 'Número inválido.';
    }
    const min = parseNumberSetting(field.settingsJson, 'min');
    const max = parseNumberSetting(field.settingsJson, 'max');
    const decimals = parseNumberSetting(field.settingsJson, 'decimals');
    if (min !== undefined && valueNumber < min) {
      return `Valor mínimo: ${min}.`;
    }
    if (max !== undefined && valueNumber > max) {
      return `Valor máximo: ${max}.`;
    }
    if (decimals !== undefined) {
      const decimalPlaces = String(valueNumber).split('.')[1]?.length ?? 0;
      if (decimalPlaces > decimals) {
        return `Máximo de ${decimals} casa(s) decimal(is).`;
      }
    }
  }

  if (field.fieldType === 'scale' || field.fieldType === 'rating') {
    const valueNumber = typeof normalized === 'number' ? normalized : Number(normalized);
    const max = parseNumberSetting(field.settingsJson, 'max') ?? 5;
    if (!Number.isFinite(valueNumber) || valueNumber < 1 || valueNumber > max) {
      return `Escolha um valor entre 1 e ${max}.`;
    }
  }

  if (field.fieldType === 'date') {
    const text = String(normalized);
    if (field.settingsJson.minDate && text < field.settingsJson.minDate) {
      return `Data mínima: ${field.settingsJson.minDate}.`;
    }
    if (field.settingsJson.maxDate && text > field.settingsJson.maxDate) {
      return `Data máxima: ${field.settingsJson.maxDate}.`;
    }
  }

  if (field.fieldType === 'single_select') {
    if (!field.options.some((option) => option.internalValue === normalized)) {
      return 'Opção inválida.';
    }
  }

  if (field.fieldType === 'multi_select') {
    const selected = Array.isArray(normalized) ? (normalized as string[]) : [];
    const allowed = new Set(field.options.map((option) => option.internalValue));
    if (selected.some((option) => !allowed.has(option))) {
      return 'Uma ou mais opções são inválidas.';
    }
  }

  if (field.fieldType === 'file_upload' && isUploadedFile(normalized)) {
    // Sem limite de tamanho por campo (o antigo maxSizeInBytes é ignorado).
    const allowedMimeTypes = field.settingsJson.allowedMimeTypes ?? [];
    if (
      allowedMimeTypes.length > 0 &&
      normalized.mimeType &&
      !allowedMimeTypes.includes(normalized.mimeType)
    ) {
      return 'Tipo de arquivo não permitido.';
    }
  }

  return null;
}

export const FILE_FIELD_LABEL_ERROR = 'Dê um nome novo ou uma descrição a cada arquivo.';

/**
 * Campo de arquivo com "exigir nome ou descrição" (o padrão): todo arquivo escolhido precisa ter sido
 * renomeado ou descrito. Os arquivos sobem depois do envio, então a conferência é aqui, antes.
 */
export function validatePendingFileLabels(
  sections: ReadonlyArray<{ fields: PublicFormField[] }>,
  pendingFiles: Record<string, PendingUpload[] | undefined>,
): PublicFieldErrorMap {
  const errors: PublicFieldErrorMap = {};
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.fieldType !== 'file_upload' || !fileLabelRequired(field.settingsJson)) continue;
      if ((pendingFiles[field.id] ?? []).some((upload) => !isUploadLabeled(upload))) {
        errors[field.id] = FILE_FIELD_LABEL_ERROR;
      }
    }
  }
  return errors;
}

export function validatePublicAnswers(
  form: PublicForm,
  answersById: Record<string, PublicAnswerValue>,
  answersByCode: Record<string, PublicAnswerValue>,
) {
  const errors: PublicFieldErrorMap = {};
  const visibleSections = getVisibleSections(form, answersByCode);

  for (const section of visibleSections) {
    for (const field of section.fields) {
      if (decorativeFieldTypes.has(field.fieldType)) {
        continue;
      }
      // File uploads arrive as a separate POST after submission — never block the form.
      if (field.fieldType === 'file_upload') {
        continue;
      }

      const error = validateFieldValue(field, answersById[field.id] ?? null);
      if (error) {
        errors[field.id] = error;
      }
    }
  }

  return errors;
}

export function fieldToSubmitItem(
  field: PublicFormField,
  rawValue: PublicAnswerValue,
): PublicSubmitItem | null {
  const value = normalizeAnswerValue(rawValue);
  if (value === null || value === undefined) {
    return null;
  }

  const base: PublicSubmitItem = {
    fieldId: field.id,
    fieldCode: field.code,
  };

  if (field.fieldType === 'multi_select') {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }
    return { ...base, valueJson: value };
  }

  if (field.fieldType === 'product_table') {
    // normalizeAnswerValue() already dropped rows sem nenhuma coluna preenchida.
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }
    const rows = (value as ProductTableRow[]).map((row) => mergeCreatorColumnValues(field, row));
    return { ...base, valueJson: rows };
  }

  if (field.fieldType === 'checkbox') {
    if (typeof value !== 'boolean') {
      return null;
    }
    return { ...base, valueBoolean: value };
  }

  if (['number', 'scale', 'rating', 'calculated'].includes(field.fieldType)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return { ...base, valueNumber: value };
  }

  if (field.fieldType === 'file_upload') {
    // File uploads are posted separately after submission; skip here.
    return null;
  }

  if (field.fieldType === 'erp_lookup') {
    // Só o código: o backend confere no ERP e grava o nome que o ERP devolver.
    if (!isErpLookupAnswer(value) || !value.value.trim()) {
      return null;
    }
    return { ...base, valueJson: { value: value.value } };
  }

  if (field.fieldType === 'erp_table') {
    // Hash + chaves + colunas preenchíveis. As colunas do ERP e as dependências não vão: o
    // backend consulta de novo e lê o pedido do próprio campo da resposta (§7.3).
    if (!isErpTableAnswer(value) || !value.sourceHash || value.stale || value.outdated) {
      return null;
    }
    return { ...base, valueJson: toErpTableSubmitValue(field, value) };
  }

  if (field.fieldType === 'item_order') {
    // Só as chaves dos itens e o preenchido: colunas da lista e total saem do backend.
    if (!isItemOrderAnswer(value) || value.rows.length === 0) {
      return null;
    }
    return { ...base, valueJson: toItemOrderSubmitValue(field, value) };
  }

  if (typeof value === 'string') {
    if (value.length === 0) {
      return null;
    }
    return { ...base, valueText: value };
  }

  return { ...base, valueText: String(value) };
}

export function mapVisibleFields(
  form: PublicForm,
  answersByCode: Record<string, PublicAnswerValue>,
) {
  return getVisibleSections(form, answersByCode).flatMap((section) =>
    section.fields.filter((field) => !decorativeFieldTypes.has(field.fieldType)),
  );
}

export function getFieldPlaceholder(fieldType: PublicFormField['fieldType']) {
  if (fieldType === 'cpf') return '000.000.000-00';
  if (fieldType === 'cnpj') return '00.000.000/0000-00';
  if (fieldType === 'phone') return '(11) 99999-9999';
  if (fieldType === 'cep') return '00000-000';
  if (fieldType === 'currency') return '0,00';
  if (fieldType === 'email') return 'email@dominio.com';
  if (fieldType === 'date') return 'DD/MM/AAAA';
  if (fieldType === 'time') return 'HH:MM';
  if (fieldType === 'datetime') return 'DD/MM/AAAA HH:MM';
  return 'Sua resposta';
}

export function getRatingMax(settingsJson: FieldSettings) {
  return typeof settingsJson.max === 'number' && settingsJson.max > 0 ? settingsJson.max : 5;
}
