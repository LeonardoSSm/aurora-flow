import type { ErpTableInputColumn, ErpTableSourceColumn, FieldSettings } from '../forms/types';
import type { ItemListColumnType, ItemListDetail } from '../item-lists/item-lists-api';
import { validateErpTableCell } from './erp-table';
import type {
  ErpTableCellValue,
  ErpTableSourceRow,
  ItemOrderAnswer,
  PublicAnswerValue,
  PublicFormField,
} from './types';

/*
 * Regras do "Pedido de itens" no formulário público. O backend refaz tudo no envio com a lista
 * atual (item-order.settings.ts) — aqui é para a pessoa ver o erro e o total antes de enviar.
 */

const SEARCH_LIMIT = 20;

export function isItemOrderAnswer(value: PublicAnswerValue | undefined): value is ItemOrderAnswer {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as ItemOrderAnswer).kind === 'item_order'
  );
}

export function getItemOrderColumns(settings: FieldSettings): {
  sourceColumns: ErpTableSourceColumn[];
  inputColumns: ErpTableInputColumn[];
} {
  return {
    sourceColumns: Array.isArray(settings.sourceColumns) ? settings.sourceColumns : [],
    inputColumns: Array.isArray(settings.inputColumns) ? settings.inputColumns : [],
  };
}

export function getItemOrderItems(settings: FieldSettings): ErpTableSourceRow[] {
  return Array.isArray(settings.items) ? settings.items : [];
}

const LIST_TYPE_TO_SOURCE: Record<ItemListColumnType, ErpTableSourceColumn['type']> = {
  text: 'text',
  url: 'text',
  select: 'text',
  number: 'number',
  currency: 'currency',
  date: 'date',
  checkbox: 'boolean',
};
const isNumericType = (type: string) => type === 'number' || type === 'currency';

/**
 * Pré-visualização do construtor (sem formulário publicado): monta, a partir da lista carregada,
 * o mesmo que o backend manda ao formulário público (`toPublicItemOrderSettings`) — colunas com o
 * nome atual, só itens ativos, seleção pelo nome da opção e o total.
 */
export function previewItemOrderSettings(
  settings: FieldSettings,
  list: ItemListDetail,
): FieldSettings {
  const listColumns = new Map((list.columns ?? []).map((column) => [column.id, column]));
  const sourceColumns: ErpTableSourceColumn[] = [{ key: 'name', label: 'Item', type: 'text' }];
  for (const key of settings.itemColumns ?? []) {
    if (key === 'code') {
      sourceColumns.push({ key, label: 'Código', type: 'text' });
      continue;
    }
    const column = listColumns.get(key);
    if (column) sourceColumns.push({ key, label: column.name, type: LIST_TYPE_TO_SOURCE[column.type] });
  }
  const cell = (item: ItemListDetail['items'][number], key: string): ErpTableCellValue => {
    if (key === 'name') return item.name;
    if (key === 'code') return item.code;
    const column = listColumns.get(key);
    const raw = item.values?.[key];
    if (!column) return null;
    if (column.type === 'checkbox') return raw === true;
    if (raw === undefined || raw === '') return null;
    if (column.type === 'select') return column.options?.find((option) => option.id === raw)?.label ?? null;
    return raw;
  };
  const inputColumns = settings.inputColumns ?? [];
  const price = sourceColumns.find((column) => column.key === settings.totalPriceColumn);
  const quantity = inputColumns.find((column) => column.id === settings.totalQuantityColumn);
  const total =
    price && quantity && isNumericType(price.type) && isNumericType(quantity.type)
      ? { priceColumn: price.key, quantityColumn: quantity.id, type: price.type as 'number' | 'currency' }
      : null;
  return {
    sourceColumns,
    inputColumns,
    items: list.items
      .filter((item) => item.isActive)
      .map((item) => ({
        key: item.id,
        values: Object.fromEntries(sourceColumns.map((column) => [column.key, cell(item, column.key)])),
      })),
    total,
  };
}

/** Texto para busca: minúsculo e sem acento ("Pão" encontra "pao"). */
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Itens que batem com a busca (todas as palavras, em qualquer coluna de texto: nome, código…),
 * primeiro os que começam pelo que foi digitado. Busca vazia não mostra nada.
 */
export function searchItemOrderItems(
  items: ErpTableSourceRow[],
  query: string,
  limit = SEARCH_LIMIT,
): ErpTableSourceRow[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ item: ErpTableSourceRow; rank: number; index: number }> = [];
  items.forEach((item, index) => {
    const texts = Object.values(item.values)
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      .map((value) => normalize(String(value)));
    const haystack = texts.join(' ');
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

/** O que um item novo já traz: o valor padrão da coluna ou, em número, o mínimo (ex.: 1). */
export function newItemOrderAnswers(
  columns: ErpTableInputColumn[],
): Record<string, ErpTableCellValue> {
  const answers: Record<string, ErpTableCellValue> = {};
  for (const column of columns) {
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
      answers[column.id] = column.defaultValue;
    } else if (column.type === 'checkbox') {
      answers[column.id] = false;
    } else if (
      (column.type === 'number' || column.type === 'currency') &&
      typeof column.min === 'number' &&
      column.min > 0
    ) {
      answers[column.id] = column.min;
    }
  }
  return answers;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Subtotal de um item (preço × quantidade) e o total; `null` sem total configurado. */
export function computeItemOrderTotals(
  field: PublicFormField,
  answer: ItemOrderAnswer | null,
): { subtotals: Record<string, number | null>; total: number } | null {
  const total = field.settingsJson.total;
  if (!total) return null;
  const itemByKey = new Map(getItemOrderItems(field.settingsJson).map((item) => [item.key, item]));
  const subtotals: Record<string, number | null> = {};
  let sum = 0;
  for (const row of answer?.rows ?? []) {
    const price = itemByKey.get(row.key)?.values[total.priceColumn];
    const quantity = row.answers[total.quantityColumn];
    const subtotal =
      typeof price === 'number' && typeof quantity === 'number' ? round(price * quantity) : null;
    subtotals[row.key] = subtotal;
    if (subtotal !== null) sum += subtotal;
  }
  return { subtotals, total: round(sum) };
}

/** Erros por item e coluna: `{ [chaveDoItem]: { [idDaColuna]: mensagem } }`. */
export function getItemOrderCellErrors(
  field: PublicFormField,
  answer: ItemOrderAnswer,
): Record<string, Record<string, string>> {
  const { inputColumns } = getItemOrderColumns(field.settingsJson);
  const errors: Record<string, Record<string, string>> = {};
  for (const row of answer.rows) {
    for (const column of inputColumns) {
      const message = validateErpTableCell(column, row.answers[column.id]);
      if (message) errors[row.key] = { ...(errors[row.key] ?? {}), [column.id]: message };
    }
  }
  return errors;
}

/** Erro do campo inteiro (embaixo do pedido; bloqueia o envio). */
export function validateItemOrderAnswer(
  field: PublicFormField,
  value: PublicAnswerValue,
): string | null {
  const answer = isItemOrderAnswer(value) ? value : null;
  if (!answer || answer.rows.length === 0) {
    return field.required ? 'Adicione pelo menos um item.' : null;
  }
  const errors = getItemOrderCellErrors(field, answer);
  const count = Object.values(errors).reduce((sum, row) => sum + Object.keys(row).length, 0);
  if (count > 0) {
    return count === 1 ? 'Corrija 1 campo do pedido.' : `Corrija ${count} campos do pedido.`;
  }
  return null;
}

/** O que vai no envio: a chave de cada item e só o que foi preenchido. */
export function toItemOrderSubmitValue(field: PublicFormField, answer: ItemOrderAnswer) {
  const { inputColumns } = getItemOrderColumns(field.settingsJson);
  return {
    rows: answer.rows.map((row) => {
      const answers: Record<string, ErpTableCellValue> = {};
      for (const column of inputColumns) {
        const value = row.answers[column.id];
        if (value === undefined || value === null || value === '') continue;
        answers[column.id] = typeof value === 'string' ? value.trim() : value;
      }
      return { key: row.key, answers };
    }),
  };
}
