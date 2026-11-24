import { keepPreviousData, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { queryKeys } from '../../../lib/query-keys';
import { EMPTY_FILTERS, type FilterState, sanitizeColumns, toRequestFilters } from '../lib/records-lib';
import { fetchRecords, fetchRecordsMeta } from '../services/records-api';
import type { RecordColumn, SortableKey } from '../types';

const PAGE_SIZE = 25;
const columnsStorageKey = (formId: string) => `tf.records.columns.${formId}`;

function readSavedColumns(formId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(columnsStorageKey(formId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : null;
  } catch {
    return null;
  }
}

function writeSavedColumns(formId: string, columns: string[]): void {
  try {
    window.localStorage.setItem(columnsStorageKey(formId), JSON.stringify(columns));
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): a escolha vale só nesta visita.
  }
}

/** Busca digitada só vai ao servidor depois de uma pausa. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useRecords(formId: string) {
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ by: SortableKey; dir: 'asc' | 'desc' }>({ by: 'sys:createdAt', dir: 'desc' });
  const [savedColumns, setSavedColumns] = useState<string[] | null>(() => readSavedColumns(formId));

  const metaQuery = useQuery({
    queryKey: queryKeys.records.meta(formId),
    queryFn: () => fetchRecordsMeta(formId),
    enabled: Boolean(formId),
    staleTime: 60_000,
  });
  const meta = metaQuery.data ?? null;

  const debouncedSearch = useDebounced(filterState.search);
  const requestFilters = useMemo(
    () => toRequestFilters({ ...filterState, search: debouncedSearch }),
    [filterState, debouncedSearch],
  );

  // Filtro novo volta para a primeira página.
  useEffect(() => setPage(1), [requestFilters]);

  const query = { ...requestFilters, page, limit: PAGE_SIZE, sortBy: sort.by, sortDir: sort.dir };
  const recordsQuery = useQuery({
    queryKey: queryKeys.records.list(formId, query),
    queryFn: () => fetchRecords(formId, query),
    enabled: Boolean(formId) && Boolean(meta),
    placeholderData: keepPreviousData,
  });

  const visibleColumnKeys = useMemo(() => (meta ? sanitizeColumns(savedColumns, meta) : []), [meta, savedColumns]);
  const columnByKey = useMemo(
    () => new Map<string, RecordColumn>((meta?.columns ?? []).map((column) => [column.key, column])),
    [meta],
  );
  const visibleColumns = useMemo(
    () => visibleColumnKeys.map((key) => columnByKey.get(key)).filter((column): column is RecordColumn => !!column),
    [visibleColumnKeys, columnByKey],
  );

  const setVisibleColumns = useCallback(
    (keys: string[]) => {
      setSavedColumns(keys);
      writeSavedColumns(formId, keys);
    },
    [formId],
  );

  const toggleSort = useCallback((key: SortableKey) => {
    setSort((current) =>
      current.by === key ? { by: key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { by: key, dir: key === 'sys:title' ? 'asc' : 'desc' },
    );
    setPage(1);
  }, []);

  const forbidden = [metaQuery.error, recordsQuery.error].some(
    (error) => axios.isAxiosError(error) && error.response?.status === 403,
  );
  const notFound = axios.isAxiosError(metaQuery.error) && metaQuery.error.response?.status === 404;

  return {
    meta,
    columnByKey,
    visibleColumns,
    visibleColumnKeys,
    setVisibleColumns,
    filterState,
    setFilterState,
    requestFilters,
    sort,
    toggleSort,
    page,
    setPage,
    records: recordsQuery.data?.data ?? [],
    total: recordsQuery.data?.total ?? 0,
    totalPages: recordsQuery.data?.totalPages ?? 0,
    loadingMeta: metaQuery.isLoading,
    loadingRecords: recordsQuery.isLoading,
    fetching: recordsQuery.isFetching,
    error: forbidden
      ? ('ACCESS_DENIED' as const)
      : notFound
        ? ('NOT_FOUND' as const)
        : metaQuery.isError || recordsQuery.isError
          ? ('FAILED' as const)
          : null,
    recordsError: recordsQuery.error,
    reload: () => {
      void metaQuery.refetch();
      void recordsQuery.refetch();
    },
  };
}
