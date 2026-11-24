import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { createApproval } from '../services/approvals-api';
import type { CreateApprovalInput } from '../services/approvals-api';

export function useCreateApprovalMutation(solicitationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateApprovalInput) => createApproval(solicitationId, dto),
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
      void queryClient.invalidateQueries({ queryKey: ['solicitations', solicitationId] });
    },
  });
}
