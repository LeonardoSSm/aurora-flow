import type {
  ItemListColumn,
  ItemListColumnColor,
  ItemListColumnType,
  ItemListValues,
} from './item-lists-api';

/**
 * Colunas próprias da lista na tela. No rascunho cada célula guarda o que a pessoa digitou (texto)
 * ou marcou (sim/não); só ao salvar vira número, data etc. — ver `cellToValue`.
 */
export type DraftValue = string | boolean;
export type DraftValues = Record<string, DraftValue>;

export const COLUMN_TYPES: Array<{ type: ItemListColumnType; label: string }> = [
  { type: 'text', label: 'Texto' },
  { type: 'number', label: 'Número' },
  { type: 'currency', label: 'Moeda (R$)' },
  { type: 'date', label: 'Data' },
  { type: 'checkbox', label: 'Sim/Não' },
  { type: 'select', label: 'Seleção' },
  { type: 'url', label: 'Link' },
];

export const columnTypeLabel = (type: ItemListColumnType): string =>
  COLUMN_TYPES.find((entry) => entry.type === type)?.label ?? type;

/** Etiqueta colorida das opções da coluna de seleção (claro e escuro). */
export const COLUMN_COLORS: Record<
  ItemListColumnColor,
  { label: string; chip: string; dot: string }
> = {
  gray: {
    label: 'Cinza',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200',
    dot: 'bg-slate-400',
  },
  red: {
    label: 'Vermelho',
    chip: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    dot: 'bg-red-500',
  },
  orange: {
    label: 'Laranja',
    chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    dot: 'bg-orange-500',
  },
  amber: {
    label: 'Amarelo',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    dot: 'bg-amber-400',
  },
  green: {
    label: 'Verde',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  teal: {
    label: 'Turquesa',
    chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
    dot: 'bg-teal-500',
  },
  blue: {
    label: 'Azul',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    dot: 'bg-blue-500',
  },
  purple: {
    label: 'Roxo',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    dot: 'bg-violet-500',
  },
  pink: {
    label: 'Rosa',
    chip: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200',
    dot: 'bg-pink-500',
  },
};

export const COLOR_ORDER = Object.keys(COLUMN_COLORS) as ItemListColumnColor[];

let idSeq = 0;
/** Id curto de coluna/opção: é ele que liga o valor do item à coluna (renomear não perde nada). */
export function columnId(prefix = 'c'): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}${idSeq.toString(36)}`;
}

const lower = (text: string) => text.trim().toLocaleLowerCase('pt-BR');

/** Primeiro problema nas colunas; null quando estão ok. */
export function columnsIssue(columns: readonly ItemListColumn[]): string | null {
  const names = new Set(['código', 'nome', 'ativo']);
  for (const column of columns) {
    if (!column.name.trim()) return 'Toda coluna precisa de nome.';
    if (names.has(lower(column.name)))
      return `Já existe uma coluna chamada "${column.name.trim()}".`;
    names.add(lower(column.name));
    if (column.type !== 'select') continue;
    const labels = new Set<string>();
    for (const option of column.options ?? []) {
      if (!option.label.trim())
        return `Toda opção da coluna "${column.name.trim()}" precisa de nome.`;
      if (labels.has(lower(option.label)))
        return `Duas opções "${option.label.trim()}" na coluna "${column.name.trim()}".`;
      labels.add(lower(option.label));
    }
  }
  return null;
}

/** Colunas como vão para o servidor: nomes aparados e opções só na seleção. */
export function columnsToSave(columns: readonly ItemListColumn[]): ItemListColumn[] {
  return columns.map((column) =>
    column.type === 'select'
      ? {
          id: column.id,
          name: column.name.trim(),
          type: column.type,
          options: (column.options ?? []).map((option) => ({
            ...option,
            label: option.label.trim(),
          })),
        }
      : { id: column.id, name: column.name.trim(), type: column.type },
  );
}

/** 1500.5 → "1.500,5"; na moeda, sempre com centavos: "1.500,50". `parseNumber` lê de volta. */
const formatNumber = (value: number, currency: boolean) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: currency ? 2 : 0,
    maximumFractionDigits: currency ? 2 : 10,
  });

/** Valor salvo → o que a célula mostra para editar. */
export function valueToCell(column: ItemListColumn, value: unknown): DraftValue {
  if (column.type === 'checkbox') return value === true;
  if (typeof value === 'number') return formatNumber(value, column.type === 'currency');
  return typeof value === 'string' ? value : '';
}

/** Só pontos de milhar, como "2.000" ou "1.250.000" (sem vírgula). */
const THOUSANDS_ONLY = /^-?\d{1,3}(\.\d{3})+$/;

/** "1.500,50", "2.000", "1500.5", "R$ 30" → número; null quando não é número. */
export function parseNumber(text: string): number | null {
  let clean = text.replace(/R\$|\s/g, '');
  if (!clean) return null;
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  else if (THOUSANDS_ONLY.test(clean)) clean = clean.replace(/\./g, '');
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DATE_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** "2024-03-01" ou "01/03/2024" → "2024-03-01"; null quando não é data. */
export function parseDate(text: string): string | null {
  const trimmed = text.trim();
  const br = DATE_BR.exec(trimmed);
  const iso = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : trimmed;
  if (!DATE_ISO.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

const INVALID = Symbol('invalid');

/** Célula → valor salvo; undefined = vazio (não grava); INVALID = não dá para salvar. */
function cellToValue(
  column: ItemListColumn,
  cell: DraftValue | undefined,
): string | number | boolean | undefined | typeof INVALID {
  if (column.type === 'checkbox') return cell === true ? true : undefined;
  const text = typeof cell === 'string' ? cell.trim() : '';
  if (!text) return undefined;
  switch (column.type) {
    case 'number':
    case 'currency':
      return parseNumber(text) ?? INVALID;
    case 'date':
      return parseDate(text) ?? INVALID;
    case 'select':
      return column.options?.some((option) => option.id === text) ? text : undefined;
    default:
      return text;
  }
}

/** Primeira célula inválida dos valores de um item; null quando todas servem. */
export function valuesIssue(
  columns: readonly ItemListColumn[],
  values: DraftValues,
  itemName: string,
): string | null {
  const bad = columns.find((column) => cellToValue(column, values[column.id]) === INVALID);
  if (!bad) return null;
  const expected = bad.type === 'date' ? 'uma data' : 'um número';
  return `"${bad.name.trim()}" do item "${itemName.trim()}" precisa ser ${expected}.`;
}

export function valuesToSave(
  columns: readonly ItemListColumn[],
  values: DraftValues,
): ItemListValues {
  const out: ItemListValues = {};
  for (const column of columns) {
    const value = cellToValue(column, values[column.id]);
    if (value !== undefined && value !== INVALID) out[column.id] = value;
  }
  return out;
}

const YES = new Set(['sim', 's', 'x', 'yes', 'y', 'true', '1', 'ok']);

/**
 * Texto colado da planilha → célula: na seleção, casa com o nome da opção (sem diferenciar
 * maiúscula); em sim/não, "sim", "x", "1"… marcam; nas datas aceita DD/MM/AAAA.
 */
export function pastedCell(column: ItemListColumn, text: string): DraftValue {
  const trimmed = text.trim();
  switch (column.type) {
    case 'checkbox':
      return YES.has(lower(trimmed));
    case 'select':
      return column.options?.find((option) => lower(option.label) === lower(trimmed))?.id ?? '';
    case 'date':
      return parseDate(trimmed) ?? trimmed;
    default:
      return trimmed;
  }
}
