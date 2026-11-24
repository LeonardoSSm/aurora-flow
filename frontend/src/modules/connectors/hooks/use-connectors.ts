import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import {
  createConnector,
  deleteConnector,
  fetchConnectors,
  testConnector,
  updateConnector,
  type CreateConnectorInput,
  type UpdateConnectorInput,
} from '../services/connectors-api';

export function useConnectors(formId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.connectors.byForm(formId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchConnectors(formId ?? ''),
    enabled: !!formId,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (input: CreateConnectorInput) => createConnector(formId ?? '', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConnectorInput }) =>
      updateConnector(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteConnector(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testConnector(id),
  });

  return {
    connectors: query.data ?? [],
    loading: query.isLoading,
    error: query.isError,
    create: createMut.mutateAsync,
    update: updateMut.mutateAsync,
    remove: deleteMut.mutateAsync,
    test: testMut.mutateAsync,
    creating: createMut.isPending,
    updating: updateMut.isPending,
    deleting: deleteMut.isPending,
    testing: testMut.isPending,
  };
}
