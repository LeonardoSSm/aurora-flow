import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchKanbanSummary } from '../services/solicitations-api';
import type { KanbanFormSummary } from '../types';

export function useKanbanSummaryQuery() {
  return useQuery<KanbanFormSummary[]>({
    queryKey: queryKeys.solicitations.kanbanSummary(),
    queryFn: fetchKanbanSummary,
    staleTime: 30_000,
  });
}
