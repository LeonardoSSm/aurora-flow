import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../../../lib/query-keys';
import { fetchAllFlows } from '../../../flows/services/flows-api';
import { fetchWebhookEndpoints } from '../../../integrations/services/webhooks-api';
import { fetchMetricsSummary, fetchSettings } from '../../services/admin-api';
import { fetchErpConnectors } from '../../services/erp-api';
import { fetchPermissionCatalog, fetchRoles } from '../../services/roles-api';


/** Fontes de dados ao vivo da documentacao tecnica. Cada uma mapeia para um endpoint existente. */
export type DocLiveSource =
  | 'permissions'
  | 'roles'
  | 'flows'
  | 'erp-connectors'
  | 'webhook-endpoints'
  | 'settings'
  | 'metrics-summary';

/**
 * Blocos ao vivo consultam endpoints que já exigem permissão própria. Quem não
 * tiver a permissão recebe 403 — isso NÃO é um erro da documentação, e sim o
 * estado esperado; a UI mostra um aviso discreto no lugar da tabela. Por isso
 * `retry: false` e nenhuma invalidação agressiva.
 */
const LIVE_QUERY_OPTIONS = {
  retry: false,
  staleTime: 60_000,
} as const;

/** Permissão exigida pelo endpoint por trás de cada fonte, exibida quando falta acesso. */
export const LIVE_SOURCE_PERMISSION: Record<DocLiveSource, string> = {
  permissions: 'roles.manage',
  roles: 'roles.manage',
  flows: 'flows.view',
  'erp-connectors': 'integrations.manage',
  'webhook-endpoints': 'integrations.manage_channels',
  settings: 'settings.manage',
  'metrics-summary': 'observability.view_metrics',
};

export function useDocsLiveQuery(source: DocLiveSource): UseQueryResult<unknown, unknown> {
  const permissions = useQuery({
    queryKey: queryKeys.roles.permissionCatalog(),
    queryFn: fetchPermissionCatalog,
    enabled: source === 'permissions',
    ...LIVE_QUERY_OPTIONS,
  });

  const roles = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: fetchRoles,
    enabled: source === 'roles',
    ...LIVE_QUERY_OPTIONS,
  });

  const flows = useQuery({
    queryKey: queryKeys.flows.list({ limit: 100, docs: true }),
    queryFn: () => fetchAllFlows({ limit: 100 }),
    enabled: source === 'flows',
    ...LIVE_QUERY_OPTIONS,
  });

  const erpConnectors = useQuery({
    queryKey: ['erp', 'connectors', 'docs'],
    queryFn: fetchErpConnectors,
    enabled: source === 'erp-connectors',
    ...LIVE_QUERY_OPTIONS,
  });

  const webhookEndpoints = useQuery({
    queryKey: queryKeys.webhooks.endpoints(),
    queryFn: fetchWebhookEndpoints,
    enabled: source === 'webhook-endpoints',
    ...LIVE_QUERY_OPTIONS,
  });

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    enabled: source === 'settings',
    ...LIVE_QUERY_OPTIONS,
  });

  const metrics = useQuery({
    queryKey: queryKeys.admin.metricsSummary(),
    queryFn: fetchMetricsSummary,
    enabled: source === 'metrics-summary',
    ...LIVE_QUERY_OPTIONS,
  });

  switch (source) {
    case 'permissions':
      return permissions;
    case 'roles':
      return roles;
    case 'flows':
      return flows;
    case 'erp-connectors':
      return erpConnectors;
    case 'webhook-endpoints':
      return webhookEndpoints;
    case 'settings':
      return settings;
    case 'metrics-summary':
      return metrics;
  }
}
