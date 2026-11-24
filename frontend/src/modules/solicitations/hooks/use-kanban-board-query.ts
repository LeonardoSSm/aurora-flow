import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchKanbanBoard } from '../services/solicitations-api';
import type { KanbanBoard } from '../types';

export function useKanbanBoardQuery(formId?: string) {
  return useQuery<KanbanBoard>({
    queryKey: queryKeys.solicitations.kanbanBoard(formId),
    queryFn: () => fetchKanbanBoard(formId),
    staleTime: 30_000,
  });
}
