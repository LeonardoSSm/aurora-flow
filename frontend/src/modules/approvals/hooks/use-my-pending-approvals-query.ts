import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchMyPendingApprovals } from '../services/approvals-api';
import type { ApprovalStepWithContext } from '../../solicitations/types';

export function useMyPendingApprovalsQuery() {
  return useQuery<ApprovalStepWithContext[]>({
    queryKey: queryKeys.approvals.myPending(),
    queryFn: fetchMyPendingApprovals,
    staleTime: 30_000,
  });
}
