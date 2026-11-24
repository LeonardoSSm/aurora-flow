import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { moveStageCard, type KanbanDefaultStage } from '../services/solicitations-api';

/** Board "Sem formulário": move entre as colunas padrão (Novo/Pendente/Concluído). */
export function useMoveKanbanStageMutation(formId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: KanbanDefaultStage }) => moveStageCard(id, stage),
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
