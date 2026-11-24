import axios from 'axios';
import { keepPreviousData, useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import {
  changeFormStatus,
  createForm,
  deleteForm,
  duplicateForm,
  fetchForms,
  type FetchFormsParams,
  type PaginatedForms,
} from '../services/forms-api';
import { formStatusLabel, type FormStatus } from '../types';

const DEFAULT_LIMIT = 15;

/** 'active' (default) hides archived forms; 'all' shows every status. */
export type StatusFilterValue = 'active' | 'all' | FormStatus;

const FORM_STATUSES = Object.keys(formStatusLabel) as FormStatus[];

function isFormStatus(value: string): value is FormStatus {
  return (FORM_STATUSES as string[]).includes(value);
}

/** Abas de status da lista de processos, na ordem da tela. */
export const STATUS_TABS: StatusFilterValue[] = ['active', 'published', 'draft', 'archived', 'all'];

function statusFetchFilter(filter: StatusFilterValue): Pick<FetchFormsParams, 'status' | 'excludeStatus'> {
  return {
    status: filter !== 'active' && filter !== 'all' ? filter : undefined,
    excludeStatus: filter === 'active' ? 'archived' : undefined,
  };
}

const emptyPaginated: PaginatedForms = {
  data: [],
  total: 0,
  page: 1,
  limit: DEFAULT_LIMIT,
  totalPages: 0,
};

export function useFormsManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingFormId, setUpdatingFormId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = searchParams.get('q') ?? '';
  const rawStatusParam = searchParams.get('status');
  const statusFilter: StatusFilterValue =
    rawStatusParam === 'all'
      ? 'all'
      : rawStatusParam && isFormStatus(rawStatusParam)
        ? rawStatusParam
        : 'active';

  const fetchParams: FetchFormsParams = {
    page: currentPage,
    limit: DEFAULT_LIMIT,
    search: query || undefined,
    ...statusFetchFilter(statusFilter),
  };

  const formsQuery = useQuery({
    queryKey: queryKeys.forms.list(fetchParams),
    queryFn: () => fetchForms(fetchParams),
    placeholderData: keepPreviousData,
  });

  const paginated = formsQuery.data ?? emptyPaginated;

  // Contagem de cada aba de status, com a mesma busca. Não há endpoint de contagem: cada aba
  // pede uma página de 1 item e usa o `total` da resposta.
  const statusCountQueries = useQueries({
    queries: STATUS_TABS.map((tab) => {
      const params: FetchFormsParams = {
        page: 1,
        limit: 1,
        search: query || undefined,
        ...statusFetchFilter(tab),
      };
      return {
        queryKey: queryKeys.forms.list(params),
        queryFn: () => fetchForms(params),
        staleTime: 30_000,
      };
    }),
  });
  const statusCounts: Partial<Record<StatusFilterValue, number>> = {};
  STATUS_TABS.forEach((tab, index) => {
    const total = statusCountQueries[index]?.data?.total;
    if (typeof total === 'number') statusCounts[tab] = total;
  });

  const invalidateForms = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.forms.all() }),
    [],
  );

  const createMutation = useMutation({ mutationFn: createForm });

  const statusMutation = useMutation({
    mutationFn: ({ formId, status }: { formId: string; status: FormStatus }) =>
      changeFormStatus(formId, status),
  });

  const duplicateMutation = useMutation({ mutationFn: duplicateForm });

  const deleteMutation = useMutation({ mutationFn: deleteForm });

  const loadForms = useCallback((page = 1) => {
    setCurrentPage(page);
  }, []);

  const createQuickForm = useCallback(async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: `Novo Formulário ${new Date().toLocaleTimeString('pt-BR')}`,
        description: 'Formulário inicial criado pelo painel.',
        category: 'Operacional',
        area: 'Administração',
        sections: [
          {
            title: 'Informações Básicas',
            fields: [
              {
                code: 'nome_completo',
                label: 'Nome Completo',
                fieldType: 'short_text',
                required: true,
              },
              { code: 'email', label: 'E-mail', fieldType: 'email', required: true },
            ],
          },
        ],
      });
      void invalidateForms();
    } catch {
      setError('Falha ao criar formulário rápido.');
    }
  }, [createMutation, invalidateForms]);

  const updateStatus = useCallback(
    async (formId: string, status: FormStatus) => {
      setError(null);
      setUpdatingFormId(formId);
      try {
        await statusMutation.mutateAsync({ formId, status });
        void invalidateForms();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setError('Você não possui permissão para gerenciar este formulário.');
        } else if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
          setError(err.response.data.message);
        } else {
          setError('Falha ao atualizar status do formulário.');
        }
      } finally {
        setUpdatingFormId(null);
      }
    },
    [statusMutation, invalidateForms],
  );

  const handleDuplicate = useCallback(
    async (formId: string) => {
      setError(null);
      setUpdatingFormId(formId);
      try {
        await duplicateMutation.mutateAsync(formId);
        void invalidateForms();
      } catch {
        setError('Falha ao duplicar formulário.');
      } finally {
        setUpdatingFormId(null);
      }
    },
    [duplicateMutation, invalidateForms],
  );

  const handleDelete = useCallback(
    async (formId: string) => {
      setError(null);
      setUpdatingFormId(formId);
      try {
        await deleteMutation.mutateAsync(formId);
        if (paginated.data.length === 1 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        }
        void invalidateForms();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setError('Você não possui permissão para gerenciar este formulário.');
        } else {
          setError('Falha ao arquivar formulário.');
        }
      } finally {
        setUpdatingFormId(null);
      }
    },
    [deleteMutation, paginated.data.length, currentPage, invalidateForms],
  );

  const goToBuilder = useCallback(
    (formId?: string) => {
      navigate(formId ? `/builder?formId=${formId}` : '/builder?mode=new');
    },
    [navigate],
  );

  const goToPublicView = useCallback((formId: string) => navigate(`/f/${formId}`), [navigate]);
  // Kanban e Respostas saíram do menu lateral: cada processo abre os seus pela tabela.
  const goToKanban = useCallback((formId: string) => navigate(`/kanban/${formId}`), [navigate]);
  const goToRecords = useCallback((formId: string) => navigate(`/registros/${formId}`), [navigate]);

  const setQuery = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value.trim()) {
        next.set('q', value.trim());
      } else {
        next.delete('q');
      }
      setSearchParams(next, { replace: false });
      setCurrentPage(1);
    },
    [searchParams, setSearchParams],
  );

  const setStatusFilter = useCallback(
    (value: StatusFilterValue) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'active') {
        next.delete('status');
      } else {
        next.set('status', value);
      }
      setSearchParams(next, { replace: false });
      setCurrentPage(1);
    },
    [searchParams, setSearchParams],
  );

  return {
    query,
    statusFilter,
    setStatusFilter,
    forms: paginated.data,
    totalForms: paginated.total,
    statusCounts,
    currentPage,
    totalPages: paginated.totalPages,
    loading: formsQuery.isFetching,
    creating: createMutation.isPending,
    updatingFormId,
    error,
    loadForms,
    createQuickForm,
    updateStatus,
    handleDuplicate,
    handleDelete,
    goToBuilder,
    goToPublicView,
    goToKanban,
    goToRecords,
    setQuery,
  };
}
