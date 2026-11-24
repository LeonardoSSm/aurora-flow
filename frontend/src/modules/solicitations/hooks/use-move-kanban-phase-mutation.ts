import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { movePhaseCard } from '../services/solicitations-api';

export function useMoveKanbanPhaseMutation(formId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, phaseId }: { id: string; phaseId: string }) => movePhaseCard(id, phaseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.kanbanBoard(formId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.kanbanSummary(),
      });
    },
  });
}
