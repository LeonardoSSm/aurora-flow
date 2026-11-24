import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { saveKanbanPhases, type SaveKanbanPhaseInput } from '../services/kanban-phases-api';

export function useSaveKanbanPhasesMutation(formId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (phases: SaveKanbanPhaseInput[]) => saveKanbanPhases(formId as string, phases),
    onSuccess: () => {
      if (!formId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.kanbanPhases.byForm(formId) });
    },
  });
}
