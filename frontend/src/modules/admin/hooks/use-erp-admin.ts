import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkConnectorHealth,
  createErpConnector,
  createErpTemplate,
  deactivateErpConnector,
  deleteErpConnector,
  fetchErpConnectors,
  fetchErpLogs,
  fetchErpTemplates,
  retryErpLog,
  testErpConnector,
  updateErpConnector,
  updateErpTemplate,
} from '../services/erp-api';
import type { CreateErpConnectorDto, CreateErpTemplateDto, FetchErpLogsParams, UpdateErpConnectorDto, UpdateErpTemplateDto } from '../services/erp-api';

const KEY = {
  connectors: () => ['erp', 'connectors'] as const,
  templates: (connectorId: string) => ['erp', 'templates', connectorId] as const,
  logs: (params: FetchErpLogsParams) => ['erp', 'logs', params] as const,
};

// ─── Connectors ───────────────────────────────────────────────────────────────

export function useErpConnectors() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY.connectors(),
    queryFn: fetchErpConnectors,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (dto: CreateErpConnectorDto) => createErpConnector(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.connectors() }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateErpConnectorDto }) =>
      updateErpConnector(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.connectors() }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateErpConnector(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.connectors() }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testErpConnector(id),
  });

  const checkHealthMut = useMutation({
    mutationFn: (id: string) => checkConnectorHealth(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.connectors() }),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) =>
      deleteErpConnector(id, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.connectors() }),
  });

  return {
    connectors: query.data ?? [],
    loading: query.isLoading,
    error: query.isError,
    create: createMut.mutateAsync,
    update: updateMut.mutateAsync,
    deactivate: deactivateMut.mutateAsync,
    delete: deleteMut.mutateAsync,
    test: testMut.mutateAsync,
    checkHealth: checkHealthMut.mutateAsync,
    creating: createMut.isPending,
    updating: updateMut.isPending,
    deactivating: deactivateMut.isPending,
    deleting: deleteMut.isPending,
    deletingId: deleteMut.variables?.id,
    testing: testMut.isPending,
    checkingHealth: checkHealthMut.isPending,
    checkingHealthId: checkHealthMut.variables,
  };
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function useErpTemplates(connectorId: string | null) {
  const qc = useQueryClient();
  const key = KEY.templates(connectorId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchErpTemplates(connectorId as string),
    enabled: !!connectorId,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (dto: CreateErpTemplateDto) => createErpTemplate(connectorId as string, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateErpTemplateDto }) =>
      updateErpTemplate(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    templates: query.data ?? [],
    loading: query.isLoading,
    create: createMut.mutateAsync,
    update: updateMut.mutateAsync,
    creating: createMut.isPending,
    updating: updateMut.isPending,
  };
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export function useErpLogs(params: FetchErpLogsParams) {
  const qc = useQueryClient();
  const key = KEY.logs(params);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchErpLogs(params),
    staleTime: 15_000,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retryErpLog(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.logs({}) }),
  });

  return {
    logsPage: query.data,
    loading: query.isLoading,
    retry: retryMut.mutateAsync,
    retrying: retryMut.isPending,
    retryingId: retryMut.variables,
  };
}
