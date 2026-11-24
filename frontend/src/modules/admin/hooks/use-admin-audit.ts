import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  fetchAuditEvents,
  type FetchAuditParams,
  type PaginatedAudit,
} from '../services/admin-api';

const DEFAULT_PARAMS: FetchAuditParams = { page: 1, limit: 25 };

function getAdminAuditErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  if (error.response?.status === 403) {
    return 'Acesso restrito ao perfil administrador.';
  }

  if (error.response?.status === 401) {
    return 'Sessão expirada. Faça login novamente.';
  }

  const payload = error.response?.data as { message?: unknown } | undefined;
  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  return fallback;
}

export function useAdminAudit() {
  const [paginated, setPaginated] = useState<PaginatedAudit>({
    data: [],
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0,
  });
  const [params, setParams] = useState<FetchAuditParams>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (overrideParams?: FetchAuditParams) => {
      const query = overrideParams ?? params;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAuditEvents(query);
        setPaginated(result);
      } catch (error) {
        setError(
          getAdminAuditErrorMessage(error, 'Não foi possível carregar os eventos de auditoria.'),
        );
      } finally {
        setLoading(false);
      }
    },
    [params],
  );

  useEffect(() => {
    load();
  }, [load]);

  const setPage = useCallback(
    (page: number) => {
      const next = { ...params, page };
      setParams(next);
      load(next);
    },
    [params, load],
  );

  const filterByModule = useCallback(
    (module?: string) => {
      const next: FetchAuditParams = { ...params, module: module || undefined, page: 1 };
      setParams(next);
      load(next);
    },
    [params, load],
  );

  const filterByAction = useCallback(
    (action?: string) => {
      const next: FetchAuditParams = { ...params, action: action || undefined, page: 1 };
      setParams(next);
      load(next);
    },
    [params, load],
  );

  return {
    events: paginated.data,
    total: paginated.total,
    page: paginated.page,
    totalPages: paginated.totalPages,
    loading,
    error,
    params,
    setPage,
    filterByModule,
    filterByAction,
    reload: load,
  };
}
