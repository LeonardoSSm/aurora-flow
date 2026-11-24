import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchServiceMapStatus } from '../services/service-map-api';

/** Polling no mesmo ritmo dos health checks do docker-compose (15 s). */
export function useServiceStatusQuery() {
  return useQuery({
    queryKey: queryKeys.admin.serviceMapStatus(),
    queryFn: fetchServiceMapStatus,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
