import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchDashboardStats } from '../../admin/services/admin-api';

export type RecentResponseSummary = {
  id: string;
  formId: string;
  formName: string;
  submittedAt: string | null;
};

/**
 * Reaproveita GET /dashboard/stats (mesma fonte usada pelo Dashboard) — o módulo de
 * respostas só expõe consulta por formulário, sem endpoint agregado entre formulários.
 */
export function useRecentResponsesQuery() {
  const query = useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: () => fetchDashboardStats(),
    staleTime: 30_000,
  });

  const recentResponses: RecentResponseSummary[] = (query.data?.recentSubmissions ?? [])
    .slice(0, 3)
    .map((submission) => ({
      id: submission.id,
      formName: submission.formName,
      formId: submission.formId,
      submittedAt: submission.submittedAt,
    }));

  return { ...query, recentResponses };
}
