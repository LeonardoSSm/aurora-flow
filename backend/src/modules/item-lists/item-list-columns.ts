import { BadRequestException } from '@nestjs/common';

/**
 * Colunas próprias de uma lista de itens (como os campos personalizados de uma lista do ClickUp):
 * a lista define as colunas e cada item guarda um valor por coluna em `values_json`, indexado pelo
 * id da coluna. Renomear a coluna não perde os valores; remover a coluna descarta os valores dela.
 */
export const ITEM_LIST_COLUMN_TYPES = [
  'text',
  'number',
  'currency',
  'date',
  'checkbox',
  'select',
  'url',
] as const;
export type ItemListColumnType = (typeof ITEM_LIST_COLUMN_TYPES)[number];

export const ITEM_LIST_COLUMN_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;
export type ItemListColumnColor = (typeof ITEM_LIST_COLUMN_COLORS)[number];

export type ItemListColumnOption = { id: string; label: string; color: ItemListColumnColor };

export type ItemListColumn = {
  id: string;
  name: string;
  type: ItemListColumnType;
  /** Só na coluna de seleção: as opções (etiquetas coloridas). */
  options?: ItemListColumnOption[];
};

export type ItemListValue = string | number | boolean;
export type ItemListValues = Record<string, ItemListValue>;

export const MAX_COLUMNS = 30;
export const MAX_COLUMN_OPTIONS = 50;
const MAX_TEXT = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const lower = (text: string): string => text.trim().toLocaleLowerCase('pt-BR');

/** Confere e normaliza as colunas vindas da tela (nomes aparados, opções só na seleção). */
export function normalizeColumns(columns: readonly ItemListColumn[]): ItemListColumn[] {
  if (columns.length > MAX_COLUMNS)
    throw new BadRequestException(`A lista pode ter no máximo ${MAX_COLUMNS} colunas.`);
  const ids = new Set<string>();
  const names = new Set<string>(['código', 'nome', 'ativo']);
  return columns.map((column) => {
    const name = column.name.trim();
    if (!name) throw new BadRequestException('Toda coluna precisa de nome.');
    if (names.has(lower(name)))
      throw new BadRequestException(`Já existe uma coluna chamada "${name}".`);
    if (ids.has(column.id)) throw new BadRequestException('Duas colunas com o mesmo id.');
    names.add(lower(name));
    ids.add(column.id);
    if (column.type !== 'select') return { id: column.id, name, type: column.type };

    const options = column.options ?? [];
    if (options.length > MAX_COLUMN_OPTIONS)
      throw new BadRequestException(
        `A coluna "${name}" pode ter no máximo ${MAX_COLUMN_OPTIONS} opções.`,
      );
    const optionIds = new Set<string>();
    const labels = new Set<string>();
    return {
      id: column.id,
      name,
      type: column.type,
      options: options.map((option) => {
        const label = option.label.trim();
        if (!label)
          throw new BadRequestException(`Toda opção da coluna "${name}" precisa de nome.`);
        if (labels.has(lower(label)) || optionIds.has(option.id))
          throw new BadRequestException(`Duas opções "${label}" na coluna "${name}".`);
        labels.add(lower(label));
        optionIds.add(option.id);
        return { id: option.id, label, color: option.color };
      }),
    };
  });
}

/** Valor que não serve para o tipo da coluna. */
const INVALID = Symbol('invalid');

function readValue(
  column: ItemListColumn,
  raw: unknown,
): ItemListValue | undefined | typeof INVALID {
  if (raw === null || raw === undefined || raw === '') return undefined;
  switch (column.type) {
    case 'text':
    case 'url': {
      if (typeof raw !== 'string') return INVALID;
      const text = raw.trim();
      return text ? text.slice(0, MAX_TEXT) : undefined;
    }
    case 'number':
    case 'currency': {
      const value = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw;
      return typeof value === 'number' && Number.isFinite(value) ? value : INVALID;
    }
    case 'date':
      return typeof raw === 'string' &&
        DATE_RE.test(raw) &&
        !Number.isNaN(Date.parse(`${raw}T00:00:00Z`))
        ? raw
        : INVALID;
    case 'checkbox':
      if (typeof raw !== 'boolean') return INVALID;
      return raw ? true : undefined;
    case 'select':
      return typeof raw === 'string' && column.options?.some((option) => option.id === raw)
        ? raw
        : INVALID;
  }
}

/**
 * Valores de um item conferidos contra as colunas: sobram só os das colunas que existem, no tipo
 * certo; vazios (e "não" na coluna sim/não) não são gravados. Valor inválido é recusado.
 */
export function sanitizeValues(
  columns: readonly ItemListColumn[],
  values: Record<string, unknown> | null | undefined,
  itemName: string,
): ItemListValues {
  const out: ItemListValues = {};
  if (!values) return out;
  for (const column of columns) {
    const value = readValue(column, values[column.id]);
    if (value === INVALID)
      throw new BadRequestException(
        `Valor inválido na coluna "${column.name}" do item "${itemName}".`,
      );
    if (value !== undefined) out[column.id] = value;
  }
  return out;
}
