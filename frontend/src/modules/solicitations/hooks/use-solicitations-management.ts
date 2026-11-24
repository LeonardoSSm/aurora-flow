import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import {
  createSolicitation,
  fetchSolicitationById,
  fetchSolicitationHistory,
  fetchSolicitations,
  type FetchSolicitationsParams,
} from '../services/solicitations-api';
import type {
  PaginatedSolicitations,
  SolicitationPriority,
  SolicitationStatus,
} from '../types';

const DEFAULT_LIMIT = 12;

export const UNAVAILABLE_SOLICITATION_NOTICE =
  'Essa solicitação não está disponível para você: ou ela não existe mais, ou você não tem acesso a ela.';

/** 403/404 no detalhe: a pessoa não pode abrir este card (link de outra pessoa, filtro de cards da fase). */
function isUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 403 || status === 404;
}

const emptyPaginated: PaginatedSolicitations = {
  data: [],
  total: 0,
  page: 1,
  limit: DEFAULT_LIMIT,
  totalPages: 0,
};

export function useSolicitationsManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSolicitationId, setSelectedSolicitationId] = useState<string | null>(
    () => searchParams.get('solicitationId'),
  );
  const [error, setError] = useState<string | null>(null);
  // Card que não abre para esta pessoa: avisa, em vez de deixar o painel vazio, e não volta a
  // selecioná-lo sozinho.
  const [notice, setNotice] = useState<string | null>(null);
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(() => new Set());

  const query = searchParams.get('q') ?? '';
  const statusFilter = (searchParams.get('status') as SolicitationStatus | null) ?? undefined;
  const priorityFilter =
    (searchParams.get('priority') as SolicitationPriority | null) ?? undefined;

  const fetchParams: FetchSolicitationsParams = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIMIT,
      search: query || undefined,
      status: statusFilter,
      priority: priorityFilter,
    }),
    [currentPage, priorityFilter, query, statusFilter],
  );

  const solicitationsQuery = useQuery({
    queryKey: queryKeys.solicitations.list(fetchParams),
    queryFn: () => fetchSolicitations(fetchParams),
    placeholderData: keepPreviousData,
  });

  const paginated = solicitationsQuery.data ?? emptyPaginated;

  // Consume the deep-link param once, so it doesn't fight with normal navigation afterwards.
  useEffect(() => {
    if (!searchParams.get('solicitationId')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('solicitationId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Lista ainda carregando também vem vazia: só limpa a seleção quando a lista chegou vazia de fato,
  // senão o card do link direto (?solicitationId=) se perdia antes de abrir.
  const listLoaded = solicitationsQuery.isSuccess && !solicitationsQuery.isPlaceholderData;
  useEffect(() => {
    if (!selectedSolicitationId) {
      const first = paginated.data.find((item) => !unavailableIds.has(item.id));
      if (first) setSelectedSolicitationId(first.id);
    }
    if (selectedSolicitationId && listLoaded && paginated.data.length === 0) {
      setSelectedSolicitationId(null);
    }
  }, [listLoaded, paginated.data, selectedSolicitationId, unavailableIds]);

  const detailQuery = useQuery({
    queryKey: selectedSolicitationId
      ? queryKeys.solicitations.byId(selectedSolicitationId)
      : queryKeys.solicitations.byId(''),
    queryFn: () => fetchSolicitationById(selectedSolicitationId ?? ''),
    enabled: Boolean(selectedSolicitationId),
    // Sem acesso não muda tentando de novo.
    retry: (failureCount, err) => !isUnavailable(err) && failureCount < 1,
  });

  useEffect(() => {
    if (!selectedSolicitationId || !detailQuery.isError || !isUnavailable(detailQuery.error)) return;
    const id = selectedSolicitationId;
    setUnavailableIds((prev) => new Set(prev).add(id));
    setNotice(UNAVAILABLE_SOLICITATION_NOTICE);
    setSelectedSolicitationId(null);
  }, [detailQuery.error, detailQuery.isError, selectedSolicitationId]);

  const selectSolicitation = useCallback((id: string | null) => {
    setNotice(null);
    setSelectedSolicitationId(id);
  }, []);

  const historyQuery = useQuery({
    queryKey: selectedSolicitationId
      ? queryKeys.solicitations.history(selectedSolicitationId)
      : queryKeys.solicitations.history(''),
    queryFn: () => fetchSolicitationHistory(selectedSolicitationId ?? ''),
    enabled: Boolean(selectedSolicitationId),
  });

  const createMutation = useMutation({ mutationFn: createSolicitation });

  const invalidateSolicitations = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.all() }),
    [],
  );

  const setQuery = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      setSearchParams(next, { replace: false });
      setCurrentPage(1);
    },
    [searchParams, setSearchParams],
  );

  const setStatusFilter = useCallback(
    (value: SolicitationStatus | '') => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('status', value);
      else next.delete('status');
      setSearchParams(next, { replace: false });
      setCurrentPage(1);
    },
    [searchParams, setSearchParams],
  );

  const setPriorityFilter = useCallback(
    (value: SolicitationPriority | '') => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('priority', value);
      else next.delete('priority');
      setSearchParams(next, { replace: false });
      setCurrentPage(1);
    },
    [searchParams, setSearchParams],
  );

  const createManualSolicitation = useCallback(
    async (title: string) => {
      setError(null);
      try {
        const created = await createMutation.mutateAsync({ title });
        setSelectedSolicitationId(created.id);
        void invalidateSolicitations();
      } catch {
        setError('Falha ao criar solicitação.');
      }
    },
    [createMutation, invalidateSolicitations],
  );

  return {
    query,
    statusFilter,
    priorityFilter,
    solicitations: paginated.data,
    totalSolicitations: paginated.total,
    currentPage,
    totalPages: paginated.totalPages,
    selectedSolicitationId,
    selectedSolicitation: detailQuery.data ?? null,
    history: historyQuery.data ?? [],
    loadingList: solicitationsQuery.isFetching,
    loadingDetail: detailQuery.isFetching,
    loadingHistory: historyQuery.isFetching,
    creating: createMutation.isPending,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    setQuery,
    setStatusFilter,
    setPriorityFilter,
    setPage: setCurrentPage,
    setSelectedSolicitationId: selectSolicitation,
    createManualSolicitation,
    reload: () => {
      void invalidateSolicitations();
      if (selectedSolicitationId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.solicitations.byId(selectedSolicitationId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.solicitations.history(selectedSolicitationId),
        });
      }
    },
  };
}
