import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchKanbanPhases } from '../services/kanban-phases-api';
import type { KanbanPhase } from '../types';

export function useKanbanPhasesQuery(formId: string | null) {
  return useQuery<KanbanPhase[]>({
    queryKey: queryKeys.kanbanPhases.byForm(formId ?? 'draft'),
    queryFn: () => fetchKanbanPhases(formId as string),
    enabled: !!formId,
    staleTime: 30_000,
  });
}
