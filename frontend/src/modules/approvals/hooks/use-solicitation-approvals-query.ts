import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchSolicitationApprovals } from '../services/approvals-api';
import type { Approval } from '../../solicitations/types';

export function useSolicitationApprovalsQuery(solicitationId: string | null) {
  return useQuery<Approval[]>({
    queryKey: queryKeys.approvals.bySolicitation(solicitationId ?? ''),
    queryFn: () => fetchSolicitationApprovals(solicitationId ?? ''),
    enabled: Boolean(solicitationId),
    staleTime: 30_000,
  });
}
