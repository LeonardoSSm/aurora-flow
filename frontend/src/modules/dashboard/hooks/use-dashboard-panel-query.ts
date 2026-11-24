import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { api } from '../../../services/api';
import type { DashboardPanel } from '../types';

async function fetchDashboardPanel(): Promise<DashboardPanel> {
  const { data } = await api.get<DashboardPanel>('/dashboard/panel');
  return data;
}

export function useDashboardPanelQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard.panel(),
    queryFn: fetchDashboardPanel,
    staleTime: 30_000,
    // As mudanças chegam pelo tempo real (use-realtime.ts); isto é só rede de segurança.
    refetchInterval: 5 * 60_000,
  });
}
