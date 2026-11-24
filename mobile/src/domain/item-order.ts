/*
 * "Pedido de itens" — espelho de frontend/src/modules/public-form/item-order.ts e das regras de
 * célula de erp-table.ts. Os itens vêm junto do formulário publicado (`settingsJson.items`); o
 * backend refaz tudo no envio com a lista atual.
 */

export type CellValue = string | number | boolean | null;
export type SourceRow = { key: string; values: Record<string, CellValue> };
export type SourceColumn = { key: string; label: string; type: string };
export type InputColumn = {
  id: string;
  label: string;
  type: 'text' | 'long_text' | 'number' | 'currency' | 'date' | 'select' | 'checkbox';
  required?: boolean;
  min?: number | null;
  max?: number | null;
  decimals?: number | null;
  maxLength?: number | null;
  options?: string[];
  helpText?: string | null;
  defaultValue?: string | number | boolean | null;
};

export type ItemOrderAnswer = {
  kind: 'item_order';
  rows: Array<{ key: string; answers: Record<string, CellValue> }>;
};

type FieldLike = { required: boolean; settingsJson: Record<string, unknown> | null };

const SEARCH_LIMIT = 20;
const MAX_TEXT = 1000;

export function isItemOrderAnswer(value: unknown): value is ItemOrderAnswer {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (value as ItemOrderAnswer).kind === 'item_order';
}

export function getItemOrderColumns(settings: Record<string, unknown> | null): { sourceColumns: SourceColumn[]; inputColumns: InputColumn[] } {
  return {
    sourceColumns: Array.isArray(settings?.sourceColumns) ? (settings.sourceColumns as SourceColumn[]) : [],
    inputColumns: Array.isArray(settings?.inputColumns) ? (settings.inputColumns as InputColumn[]) : [],
  };
}

export function getItemOrderItems(settings: Record<string, unknown> | null): SourceRow[] {
  return Array.isArray(settings?.items) ? (settings.items as SourceRow[]) : [];
}

export function getItemOrderTotalConfig(settings: Record<string, unknown> | null): { priceColumn: string; quantityColumn: string; type: 'number' | 'currency' } | null {
  const total = settings?.total as { priceColumn?: unknown; quantityColumn?: unknown; type?: unknown } | null | undefined;
  if (!total || typeof total.priceColumn !== 'string' || typeof total.quantityColumn !== 'string') return null;
  return { priceColumn: total.priceColumn, quantityColumn: total.quantityColumn, type: total.type === 'currency' ? 'currency' : 'number' };
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Itens que batem com a busca (todas as palavras), primeiro os que começam pelo digitado. */
export function searchItemOrderItems(items: SourceRow[], query: string, limit = SEARCH_LIMIT): SourceRow[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ item: SourceRow; rank: number; index: number }> = [];
  items.forEach((item, index) => {
    const haystack = Object.values(item.values)
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      .map((value) => normalize(String(value)))
      .join(' ');
    if (!words.every((word) => haystack.includes(word))) return;
    const name = normalize(String(item.values.name ?? ''));
    const code = normalize(String(item.values.code ?? ''));
    const first = words[0];
    const rank = code === first ? 0 : name.startsWith(first) || code.startsWith(first) ? 1 : 2;
    scored.push({ item, rank, index });
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function newItemOrderAnswers(columns: InputColumn[]): Record<string, CellValue> {
  const answers: Record<string, CellValue> = {};
  for (const column of columns) {
    if (column.defaultValue !== undefined && column.defaultValue !== null) answers[column.id] = column.defaultValue;
    else if (column.type === 'checkbox') answers[column.id] = false;
    else if ((column.type === 'number' || column.type === 'currency') && typeof column.min === 'number' && column.min > 0) {
      answers[column.id] = column.min;
    }
  }
  return answers;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

export function computeItemOrderTotals(
  field: FieldLike,
  answer: ItemOrderAnswer | null,
): { subtotals: Record<string, number | null>; total: number } | null {
  const total = getItemOrderTotalConfig(field.settingsJson);
  if (!total) return null;
  const itemByKey = new Map(getItemOrderItems(field.settingsJson).map((item) => [item.key, item]));
  const subtotals: Record<string, number | null> = {};
  let sum = 0;
  for (const row of answer?.rows ?? []) {
    const price = itemByKey.get(row.key)?.values[total.priceColumn];
    const quantity = row.answers[total.quantityColumn];
    const subtotal = typeof price === 'number' && typeof quantity === 'number' ? round(price * quantity) : null;
    subtotals[row.key] = subtotal;
    if (subtotal !== null) sum += subtotal;
  }
  return { subtotals, total: round(sum) };
}

export function validateCell(column: InputColumn, raw: CellValue | undefined): string | null {
  if (column.type === 'checkbox') return column.required && raw !== true ? 'Obrigatório.' : null;
  const empty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());
  if (empty) return column.required ? 'Obrigatório.' : null;
  switch (column.type) {
    case 'text':
    case 'long_text': {
      const max = column.maxLength ?? MAX_TEXT;
      return typeof raw === 'string' && raw.trim().length > max ? `Até ${max} caracteres.` : null;
    }
    case 'number':
    case 'currency': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'Número inválido.';
      if (column.min !== null && column.min !== undefined && raw < column.min) return `Mínimo ${column.min}.`;
      if (column.max !== null && column.max !== undefined && raw > column.max) return `Máximo ${column.max}.`;
      const decimals = column.decimals ?? (column.type === 'currency' ? 2 : null);
      if (decimals !== null && Number(raw.toFixed(decimals)) !== raw) return `Até ${decimals} casa(s) decimal(is).`;
      return null;
    }
    case 'date':
      return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? null : 'Data inválida.';
    case 'select':
      return typeof raw === 'string' && (column.options ?? []).includes(raw) ? null : 'Opção inválida.';
    default:
      return null;
  }
}

export function getItemOrderCellErrors(field: FieldLike, answer: ItemOrderAnswer): Record<string, Record<string, string>> {
  const { inputColumns } = getItemOrderColumns(field.settingsJson);
  const errors: Record<string, Record<string, string>> = {};
  for (const row of answer.rows) {
    for (const column of inputColumns) {
      const message = validateCell(column, row.answers[column.id]);
      if (message) errors[row.key] = { ...(errors[row.key] ?? {}), [column.id]: message };
    }
  }
  return errors;
}

export function validateItemOrderAnswer(field: FieldLike, value: unknown): string | null {
  const answer = isItemOrderAnswer(value) ? value : null;
  if (!answer || answer.rows.length === 0) return field.required ? 'Adicione pelo menos um item.' : null;
  const errors = getItemOrderCellErrors(field, answer);
  const count = Object.values(errors).reduce((sum, row) => sum + Object.keys(row).length, 0);
  if (count > 0) return count === 1 ? 'Corrija 1 campo do pedido.' : `Corrija ${count} campos do pedido.`;
  return null;
}

export function toItemOrderSubmitValue(field: FieldLike, answer: ItemOrderAnswer) {
  const { inputColumns } = getItemOrderColumns(field.settingsJson);
  return {
    rows: answer.rows.map((row) => {
      const answers: Record<string, CellValue> = {};
      for (const column of inputColumns) {
        const value = row.answers[column.id];
        if (value === undefined || value === null || value === '') continue;
        answers[column.id] = typeof value === 'string' ? value.trim() : value;
      }
      return { key: row.key, answers };
    }),
  };
}

export type ItemListDetail = {
  id: string;
  name: string;
  columns?: Array<{ id: string; name: string; type: string; options?: Array<{ id: string; label: string }> }>;
  items: Array<{ id: string; code: string | null; name: string; isActive: boolean; values?: Record<string, string | number | boolean> }>;
};

const LIST_TYPE_TO_SOURCE: Record<string, string> = {
  text: 'text',
  url: 'text',
  select: 'text',
  number: 'number',
  currency: 'currency',
  date: 'date',
  checkbox: 'boolean',
};
const isNumericType = (t: string) => t === 'number' || t === 'currency';

/**
 * Campo de fase não vem com os itens (só o formulário publicado vem): monta, a partir da lista, o
 * mesmo que o backend manda ao formulário — espelho de previewItemOrderSettings do web.
 */
export function previewItemOrderSettings(settings: Record<string, unknown>, list: ItemListDetail): Record<string, unknown> {
  const listColumns = new Map((list.columns ?? []).map((column) => [column.id, column]));
  const sourceColumns: SourceColumn[] = [{ key: 'name', label: 'Item', type: 'text' }];
  for (const key of (settings.itemColumns as string[] | undefined) ?? []) {
    if (key === 'code') {
      sourceColumns.push({ key, label: 'Código', type: 'text' });
      continue;
    }
    const column = listColumns.get(key);
    if (column) sourceColumns.push({ key, label: column.name, type: LIST_TYPE_TO_SOURCE[column.type] ?? 'text' });
  }
  const cell = (item: ItemListDetail['items'][number], key: string): CellValue => {
    if (key === 'name') return item.name;
    if (key === 'code') return item.code;
    const column = listColumns.get(key);
    const raw = item.values?.[key];
    if (!column) return null;
    if (column.type === 'checkbox') return raw === true;
    if (raw === undefined || raw === '') return null;
    if (column.type === 'select') return column.options?.find((option) => option.id === raw)?.label ?? null;
    return raw as CellValue;
  };
  const inputColumns = (settings.inputColumns as InputColumn[] | undefined) ?? [];
  const price = sourceColumns.find((column) => column.key === settings.totalPriceColumn);
  const quantity = inputColumns.find((column) => column.id === settings.totalQuantityColumn);
  const total =
    price && quantity && isNumericType(price.type) && isNumericType(quantity.type)
      ? { priceColumn: price.key, quantityColumn: quantity.id, type: price.type }
      : null;
  return {
    ...settings,
    sourceColumns,
    inputColumns,
    items: list.items
      .filter((item) => item.isActive)
      .map((item) => ({ key: item.id, values: Object.fromEntries(sourceColumns.map((column) => [column.key, cell(item, column.key)])) })),
    total,
  };
}

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

export function formatCell(value: CellValue | undefined, type: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return type === 'currency' ? CURRENCY.format(value) : NUMBER.format(value);
  if (type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return value;
}
