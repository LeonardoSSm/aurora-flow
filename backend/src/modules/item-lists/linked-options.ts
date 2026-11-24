/**
 * Campo de seleção ligado a uma lista de itens (`settingsJson.itemListId`).
 *
 * As opções continuam gravadas no próprio campo (form_field_options / options_json da fase) — é
 * delas que dependem respostas, exportação, painéis, fluxos e o app. A lista só dita o que elas
 * são: cada item ativo vira uma opção (valor = id do item, rótulo = nome). O que sai da lista
 * (item inativo, apagado, ou uma opção digitada antes de ligar a lista) não é apagado do campo —
 * fica escondido (`hiddenOptionValues`), para respostas antigas continuarem mostrando o nome e as
 * ramificações que apontam para ela não quebrarem. Quem preenche só vê as visíveis.
 */

export type LinkedOption = { value: string; label: string };
export type LinkedListItem = { id: string; name: string; isActive: boolean };

export const ITEM_LIST_SETTING = 'itemListId';
export const HIDDEN_OPTIONS_SETTING = 'hiddenOptionValues';

/** Só seleção tem opções vindas de lista. */
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

/**
 * Opções do campo depois de aplicar a lista: os itens ativos na ordem da lista, depois o que já
 * existia e não está mais ativo (com o nome atual do item, se ele ainda existe) — esses escondidos.
 */
export function syncLinkedOptions(
  existing: readonly LinkedOption[],
  items: readonly LinkedListItem[],
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

/** `settingsJson` com a lista de escondidas atualizada (sem a chave quando não há nenhuma). */
export function withHiddenOptions(
  settings: Record<string, unknown> | null | undefined,
  hidden: readonly string[],
): Record<string, unknown> {
  const next = { ...(settings ?? {}) };
  if (hidden.length) next[HIDDEN_OPTIONS_SETTING] = [...hidden];
  else delete next[HIDDEN_OPTIONS_SETTING];
  return next;
}

/** O que quem preenche vê: as opções menos as escondidas. */
export function visibleOptions<T>(
  options: readonly T[],
  settings: Record<string, unknown> | null | undefined,
  valueOf: (option: T) => string,
): T[] {
  const hidden = readHiddenOptionValues(settings);
  return hidden.size ? options.filter((option) => !hidden.has(valueOf(option))) : [...options];
}
