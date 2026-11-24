import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { Card } from '../../../components/ui';
import { AdminHeaderActions } from '../components/admin-modal-context';
import { useMetricsSummaryQuery } from '../hooks/use-metrics-summary';
import { buildStatusChart, countActiveSolicitations } from '../lib/solicitation-status-chart';

const GRAFANA_URL: string = (import.meta.env.VITE_GRAFANA_URL as string | undefined) ?? 'http://localhost:3001';


function integrationHealth(success: number, failed: number): 'ok' | 'warning' | 'error' {
  if (failed === 0) return 'ok';
  const total = success + failed;
  if (total === 0) return 'ok';
  return failed / total >= 0.3 ? 'error' : 'warning';
}

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'error' }) {
  const cfg = {
    ok: {
      label: 'OK',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    warning: {
      label: 'Atenção',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    },
    error: { label: 'Crítico', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  } as const;
  const { label, cls } = cfg[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
  );
}

type KpiCardProps = {
  label: string;
  value: number;
  highlight?: 'red' | 'amber';
};

function KpiCard({ label, value, highlight }: KpiCardProps) {
  const valueColor =
    highlight === 'red' && value > 0
      ? 'text-red-600'
      : highlight === 'amber' && value > 0
        ? 'text-amber-500'
        : 'text-tx-primary';
  return (
    <Card>
      <p className="text-sm text-tx-secondary">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="h-4 w-32 rounded bg-surface-container-high" />
      <div className="mt-2 h-9 w-16 rounded bg-surface-container-high" />
    </Card>
  );
}

function useElapsedSeconds(since: number | undefined) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const secs = Math.floor((now - since) / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}min`;
}

export function AdminObservabilityView() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useMetricsSummaryQuery();
  const elapsed = useElapsedSeconds(dataUpdatedAt || undefined);

  if (isLoading) {
    return (
      <section className="grid gap-6">
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-tx-secondary">
          Não foi possível carregar as métricas operacionais.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </button>
      </Card>
    );
  }

  const { solicitations, approvals, webhooks, flows, whatsapp } = data;

  const activeCount = countActiveSolicitations(solicitations.total, solicitations.byStatus);

  const chartData = buildStatusChart(solicitations.byStatus);

  const chartHeight = Math.max(120, chartData.length * 40);

  const integrations = [
    { name: 'WhatsApp', success: whatsapp.sentToday, failed: whatsapp.failed },
    { name: 'Webhooks', success: webhooks.deliveriesToday, failed: webhooks.failedDeliveries },
  ];

  return (
    <section className="grid gap-6">
      <AdminHeaderActions>
        <div className="flex items-center gap-3">
          {elapsed && (
            <span className="text-xs text-tx-secondary">Atualizado há {elapsed}</span>
          )}
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-1.5 text-sm font-medium text-tx-primary transition-colors hover:bg-surface-container-high"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
      </AdminHeaderActions>

      {/* SECTION 1 — KPIs */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-tx-secondary">
          KPIs Principais
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard label="Solicitações ativas" value={activeCount} />
          <KpiCard label="SLA vencido" value={solicitations.slaBreached} highlight="red" />
          <KpiCard label="Aprovações pendentes" value={approvals.pending} highlight="amber" />
          <KpiCard label="Falhas de webhook" value={webhooks.failedDeliveries} highlight="red" />
          <KpiCard label="WhatsApp enviadas hoje" value={whatsapp.sentToday} />
          <KpiCard label="Execuções de fluxo hoje" value={flows.executionsToday} />
        </div>
      </div>

      {/* SECTION 2 — Bar chart by status */}
      <Card>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-tx-secondary">
          Solicitações por Status
        </h3>
        {chartData.length === 0 ? (
          <p className="py-6 text-center text-sm text-tx-secondary">
            Nenhuma solicitação registrada.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'currentColor' }}
                stroke="currentColor"
                className="text-tx-secondary"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={148}
                tick={{ fontSize: 12, fill: 'currentColor' }}
                stroke="currentColor"
                className="text-tx-secondary"
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [value, 'Solicitações']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* SECTION 3 — Integrations table */}
      <Card>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-tx-secondary">
          Integrações
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default text-left">
              <th className="pb-2 text-xs font-semibold text-tx-secondary">Integração</th>
              <th className="pb-2 text-xs font-semibold text-tx-secondary">Sucessos hoje</th>
              <th className="pb-2 text-xs font-semibold text-tx-secondary">Falhas hoje</th>
              <th className="pb-2 text-xs font-semibold text-tx-secondary">Status</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((row) => (
              <tr key={row.name} className="border-b border-border-default last:border-0">
                <td className="py-3 font-medium">{row.name}</td>
                <td className="py-3 tabular-nums">{row.success}</td>
                <td className="py-3 tabular-nums">{row.failed}</td>
                <td className="py-3">
                  <StatusBadge status={integrationHealth(row.success, row.failed)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* SECTION 4 — Grafana link */}
      <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-tx-primary">Métricas técnicas detalhadas</p>
          <p className="mt-0.5 text-sm text-tx-secondary">
            Séries temporais, latência e gráficos de infraestrutura disponíveis no Grafana.
          </p>
        </div>
        <a
          href={GRAFANA_URL}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Activity className="h-4 w-4" />
          Abrir Grafana
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Card>
    </section>
  );
}
