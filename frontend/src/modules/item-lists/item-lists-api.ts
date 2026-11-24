import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

/** Onde a lista está em uso: formulários (distintos) e campos de fase ligados a ela. */
export type ItemListUsage = { forms: number; phaseFields: number };

export type ItemListSummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount: number;
  usage: ItemListUsage;
  updatedAt: string;
};

export type ItemListColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'url';

export type ItemListColumnColor =
  | 'gray'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink';

export type ItemListColumnOption = { id: string; label: string; color: ItemListColumnColor };

/** Coluna própria da lista (além de código e nome); cada item guarda um valor por coluna. */
export type ItemListColumn = {
  id: string;
  name: string;
  type: ItemListColumnType;
  options?: ItemListColumnOption[];
};

/** Valor de cada coluna, pelo id da coluna: texto, número, data (AAAA-MM-DD), sim ou id da opção. */
export type ItemListValues = Record<string, string | number | boolean>;

export type ItemListItem = {
  id: string;
  code: string | null;
  name: string;
  isActive: boolean;
  order: number;
  /** Ausente em backend anterior às colunas próprias. */
  values?: ItemListValues;
};

export type ItemListDetail = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Ausente em backend anterior às colunas próprias. */
  columns?: ItemListColumn[];
  items: ItemListItem[];
  usage: ItemListUsage;
};

export type SaveItemListInput = {
  name: string;
  description?: string | null;
  columns?: ItemListColumn[];
  items: Array<{
    id?: string;
    code?: string | null;
    name: string;
    isActive?: boolean;
    values?: ItemListValues;
  }>;
};

export const itemListKeys = {
  all: ['item-lists'] as const,
  list: (archived: boolean) => ['item-lists', 'list', archived] as const,
  detail: (id: string | null) => ['item-lists', 'detail', id] as const,
};

export async function fetchItemLists(archived = false): Promise<ItemListSummary[]> {
  const { data } = await api.get<ItemListSummary[]>('/item-lists', {
    params: archived ? { arquivadas: 1 } : undefined,
  });
  return data;
}

export async function fetchItemList(id: string): Promise<ItemListDetail> {
  const { data } = await api.get<ItemListDetail>(`/item-lists/${id}`);
  return data;
}

export async function saveItemList(
  id: string | null,
  input: SaveItemListInput,
): Promise<ItemListDetail> {
  const { data } = id
    ? await api.put<ItemListDetail>(`/item-lists/${id}`, input)
    : await api.post<ItemListDetail>('/item-lists', input);
  return data;
}

export async function setItemListActive(id: string, isActive: boolean): Promise<ItemListDetail> {
  const { data } = await api.patch<ItemListDetail>(`/item-lists/${id}/active`, { isActive });
  return data;
}

export function useItemListsQuery(archived = false) {
  return useQuery({
    queryKey: itemListKeys.list(archived),
    queryFn: () => fetchItemLists(archived),
    staleTime: 30_000,
  });
}
