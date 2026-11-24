import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchLopsAiAgents, type LopsAiAgent } from '../services/flows-api';

/** Lista os agentes da LOPS IA para escolher no nó "LOPS IA" (cache de 5 min; a lista muda pouco). */
export function useLopsAiAgentsQuery() {
  return useQuery<LopsAiAgent[]>({
    queryKey: queryKeys.flows.lopsAiAgents(),
    queryFn: fetchLopsAiAgents,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
