import type { ItemListDetail } from './item-lists-api';

/**
 * Campo de seleção ligado a uma lista de itens — espelho de
 * `backend/src/modules/item-lists/linked-options.ts` (o servidor reaplica ao salvar; aqui é para a
 * tela já mostrar as opções certas). Cada item ativo vira uma opção (valor = id do item, rótulo =
 * nome); o que sai da lista fica no campo, escondido (`hiddenOptionValues`), para respostas antigas
 * continuarem com o nome.
 */

export type LinkedOption = { value: string; label: string };

export const ITEM_LIST_SETTING = 'itemListId';
export const HIDDEN_OPTIONS_SETTING = 'hiddenOptionValues';

/** Tipos que podem tirar as opções de uma lista (a lista suspensa é seleção com `displayAs`). */
export const LIST_FIELD_TYPES: readonly string[] = ['single_select', 'multi_select'];

export function readItemListId(
  settings: Record<string, unknown> | null | undefined,
): string | null {
  const value = settings?.[ITEM_LIST_SETTING];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readHiddenOptionValues(
  settings: Record<string, unknown> | null | undefined,
): Set<string> {
  const value = settings?.[HIDDEN_OPTIONS_SETTING];
  return new Set(
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [],
  );
}

export function syncLinkedOptions(
  existing: readonly LinkedOption[],
  items: ItemListDetail['items'],
): { options: LinkedOption[]; hidden: string[] } {
  const active = items.filter((item) => item.isActive);
  const activeIds = new Set(active.map((item) => item.id));
  const nameById = new Map(items.map((item) => [item.id, item.name]));
  const options: LinkedOption[] = active.map((item) => ({ value: item.id, label: item.name }));
  const hidden: string[] = [];
  const seen = new Set<string>();
  for (const option of existing) {
    if (activeIds.has(option.value) || seen.has(option.value)) continue;
    seen.add(option.value);
    options.push({ value: option.value, label: nameById.get(option.value) ?? option.label });
    hidden.push(option.value);
  }
  return { options, hidden };
}

export function visibleOptions<T>(
  options: readonly T[],
  settings: Record<string, unknown> | null | undefined,
  valueOf: (option: T) => string,
): T[] {
  const hidden = readHiddenOptionValues(settings);
  return hidden.size ? options.filter((option) => !hidden.has(valueOf(option))) : [...options];
}

/** Configuração ligada à lista (com as escondidas) ou, sem lista, sem nenhuma das duas chaves. */
export function linkSettings<T extends object>(
  settings: T,
  listId: string | null,
  hidden: readonly string[] = [],
): T {
  const next = { ...settings } as Record<string, unknown>;
  delete next[ITEM_LIST_SETTING];
  delete next[HIDDEN_OPTIONS_SETTING];
  if (listId) {
    next[ITEM_LIST_SETTING] = listId;
    if (hidden.length) next[HIDDEN_OPTIONS_SETTING] = [...hidden];
  }
  return next as T;
}

/**
 * Ligar um campo a uma lista. Só as opções que já estavam salvas entram como escondidas (podem
 * ter respostas); as que acabaram de ser criadas nesta edição (ex.: "Opção 1" de campo novo) somem.
 */
export function linkOptions(
  saved: readonly LinkedOption[],
  list: ItemListDetail,
): { options: LinkedOption[]; hidden: string[] } {
  return syncLinkedOptions(saved, list.items);
}
