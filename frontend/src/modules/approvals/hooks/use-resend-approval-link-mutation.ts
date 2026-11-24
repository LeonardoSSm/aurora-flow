import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { resendApprovalLink } from '../services/approvals-api';

export function useResendApprovalLinkMutation(solicitationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => resendApprovalLink(stepId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.bySolicitation(solicitationId),
      });
    },
  });
}
