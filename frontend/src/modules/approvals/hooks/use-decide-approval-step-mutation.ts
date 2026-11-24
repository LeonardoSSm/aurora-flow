import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { decideApprovalStep } from '../services/approvals-api';
import type { DecideApprovalStepInput } from '../services/approvals-api';

export function useDecideApprovalStepMutation(solicitationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, dto }: { stepId: string; dto: DecideApprovalStepInput }) =>
      decideApprovalStep(stepId, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.myPending() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.bySolicitation(solicitationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.kanbanBoard(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.byId(solicitationId),
      });
      void queryClient.invalidateQueries({ queryKey: ['solicitations', solicitationId] });
    },
  });
}
