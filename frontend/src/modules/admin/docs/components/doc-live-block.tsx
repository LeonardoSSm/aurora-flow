import { AlertCircle, Loader2, RefreshCw, Radio } from 'lucide-react';
import type { AppSetting, MetricsSummaryDto } from '../../services/admin-api';
import type { ErpConnector } from '../../services/erp-api';
import type { PermissionDefinition, Role } from '../../services/roles-api';
import type { WebhookEndpoint } from '../../../integrations/services/webhooks-api';
import type { FlowPage } from '../../../flows/types/flow.types';
import { LIVE_SOURCE_PERMISSION, useDocsLiveQuery } from '../hooks/use-docs-live';
import type { DocLiveSource } from '../hooks/use-docs-live';
import { DocTable } from '../../../docs-kit';

function isForbidden(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 401;
}

function renderContent(source: DocLiveSource, data: unknown): JSX.Element {
  switch (source) {
    case 'permissions': {
      const items = (data as PermissionDefinition[]) ?? [];
      return (
        <DocTable
          columns={['Código', 'Módulo', 'Rótulo', 'Escopável']}
          rows={items.map((p) => [p.code, p.module, p.label, p.scopable ? 'sim' : 'não'])}
        />
      );
    }
    case 'roles': {
      const items = (data as Role[]) ?? [];
      return (
        <DocTable
          columns={['Código', 'Nome', 'Sistema', 'Permissões', 'Usuários ativos']}
          rows={items.map((r) => [
            r.code,
            r.name,
            r.isSystem ? 'sim' : 'não',
            String(Object.keys(r.permissions ?? {}).length),
            String(r.activeUserCount),
          ])}
        />
      );
    }
    case 'flows': {
      const page = data as FlowPage | undefined;
      const items = page?.data ?? [];
      return (
        <DocTable
          columns={['Fluxo', 'Ativo', 'Formulário', 'Nós', 'Atualizado em']}
          rows={items.map((f) => [
            f.name,
            f.isActive ? 'sim' : 'não',
            f.formId ?? '—',
            String(f.nodes?.length ?? 0),
            new Date(f.updatedAt).toLocaleDateString('pt-BR'),
          ])}
        />
      );
    }
    case 'erp-connectors': {
      const items = (data as ErpConnector[]) ?? [];
      return (
        <DocTable
          columns={['Conector', 'Base URL', 'Autenticação', 'Ativo', 'Timeout']}
          rows={items.map((c) => [
            c.name,
            c.baseUrl,
            c.authType,
            c.isActive ? 'sim' : 'não',
            `${c.timeoutMs} ms`,
          ])}
        />
      );
    }
    case 'webhook-endpoints': {
      const items = (data as WebhookEndpoint[]) ?? [];
      return (
        <DocTable
          columns={['Endpoint', 'Ativo', 'Assinatura HMAC', 'Dispara fluxo']}
          rows={items.map((e) => [
            e.name,
            e.isActive ? 'sim' : 'não',
            e.signingSecretConfigured ? 'configurada' : 'sem assinatura',
            e.flowTriggerEnabled ? 'sim' : 'não',
          ])}
        />
      );
    }
    case 'settings': {
      const items = (data as AppSetting[]) ?? [];
      return (
        <DocTable
          columns={['Chave', 'Valor', 'Tipo', 'Público', 'Descrição']}
          rows={items.map((s) => [
            s.key,
            s.value ?? '—',
            s.valueType,
            s.isPublic ? 'sim' : 'não',
            s.description ?? '—',
          ])}
        />
      );
    }
    case 'metrics-summary': {
      const m = data as MetricsSummaryDto | undefined;
      if (!m) return <p className="text-sm text-tx-secondary">Sem dados.</p>;
      return (
        <DocTable
          columns={['Indicador', 'Valor']}
          rows={[
            ['Solicitações (total)', String(m.solicitations.total)],
            ['Solicitações pendentes', String(m.solicitations.pending)],
            ['SLA estourado', String(m.solicitations.slaBreached)],
            ['Aprovações pendentes', String(m.approvals.pending)],
            ['Aprovações decididas hoje', String(m.approvals.decidedToday)],
            ['Execuções de fluxo hoje', String(m.flows.executionsToday)],
            ['Execuções de fluxo com falha', String(m.flows.failedExecutions)],
            ['Entregas de webhook hoje', String(m.webhooks.deliveriesToday)],
            ['Entregas de webhook falhas', String(m.webhooks.failedDeliveries)],
          ]}
        />
      );
    }
  }
}

export function DocLiveBlock({
  source,
  title,
  description,
}: {
  source: DocLiveSource;
  title?: string;
  description?: string;
}) {
  const query = useDocsLiveQuery(source);

  return (
    <section className="rounded-2xl bg-surface-container-low p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2">
          <Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold text-tx-primary">
              {title ?? 'Dados deste ambiente'}
            </p>
            {description ? (
              <p className="text-xs text-tx-secondary">{description}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="flex items-center gap-1.5 rounded-xl bg-surface-container-high px-2.5 py-1.5 text-xs font-semibold text-tx-secondary transition-colors hover:text-tx-primary"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      {query.isLoading ? (
        <p className="flex items-center gap-2 py-4 text-sm text-tx-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando a API…
        </p>
      ) : query.isError ? (
        <p className="flex items-start gap-2 rounded-xl bg-surface-container-lowest p-3 text-sm text-tx-secondary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-tx-muted" />
          {isForbidden(query.error)
            ? `Seu perfil não tem a permissão "${LIVE_SOURCE_PERMISSION[source]}", exigida pelo endpoint que alimenta este bloco. O restante da página continua disponível.`
            : 'Não foi possível carregar os dados ao vivo agora. O conteúdo estático da página continua válido.'}
        </p>
      ) : (
        renderContent(source, query.data)
      )}
    </section>
  );
}
