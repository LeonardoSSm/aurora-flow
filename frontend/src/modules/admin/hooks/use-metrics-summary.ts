import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchMetricsSummary } from '../services/admin-api';

export function useMetricsSummaryQuery() {
  return useQuery({
    queryKey: queryKeys.admin.metricsSummary(),
    queryFn: fetchMetricsSummary,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
