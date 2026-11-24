import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import {
  createArea,
  deactivateArea,
  fetchAreas,
  updateArea,
  type CreateAreaPayload,
  type UpdateAreaPayload,
} from '../services/areas-api';

export function useAreasQuery(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.areas.list({ includeInactive }),
    queryFn: () => fetchAreas(includeInactive),
  });
}

export function useCreateAreaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAreaPayload) => createArea(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all() });
    },
  });
}

export function useUpdateAreaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAreaPayload }) =>
      updateArea(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all() });
    },
  });
}

export function useDeactivateAreaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateArea(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all() });
    },
  });
}
