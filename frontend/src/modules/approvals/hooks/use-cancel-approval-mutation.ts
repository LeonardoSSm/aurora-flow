import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { cancelApproval } from '../services/approvals-api';

export function useCancelApprovalMutation(solicitationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (approvalId: string) => cancelApproval(approvalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.bySolicitation(solicitationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.kanbanBoard(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.byId(solicitationId),
      });
    },
  });
}
