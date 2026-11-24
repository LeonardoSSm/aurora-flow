import { Activity, BarChart2, ExternalLink, FileCode, GitBranch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tool = {
  key: string;
  name: string;
  description: string;
  url: string;
  icon: LucideIcon;
  color: string;
  category: string;
  credentials?: { user: string; hint: string };
};

const ALL_TOOLS: (Omit<Tool, 'url'> & { url: string | undefined })[] = [
  {
    key: 'grafana',
    name: 'Grafana',
    description: 'Dashboards de métricas e observabilidade',
    url: import.meta.env.VITE_GRAFANA_URL as string | undefined,
    icon: BarChart2,
    color: '#F46800',
    category: 'Observabilidade',
    credentials: { user: 'admin', hint: 'senha no .env' },
  },
  {
    key: 'prometheus',
    name: 'Prometheus',
    description: 'Coleta e consulta de métricas (PromQL)',
    url: import.meta.env.VITE_PROMETHEUS_URL as string | undefined,
    icon: Activity,
    color: '#E6522C',
    category: 'Observabilidade',
  },
  {
    key: 'rabbitmq',
    name: 'RabbitMQ Management',
    description: 'Filas, exchanges, consumers e DLQ',
    url: import.meta.env.VITE_RABBITMQ_MANAGEMENT_URL as string | undefined,
    icon: GitBranch,
    color: '#FF6600',
    category: 'Mensageria',
    credentials: { user: 'formhub', hint: 'senha local no .env / docker-compose' },
  },
  {
    key: 'swagger',
    name: 'Swagger / API Docs',
    description: 'Documentação interativa da API REST',
    url: import.meta.env.VITE_API_URL
      ? `${(import.meta.env.VITE_API_URL as string).replace(/\/$/, '')}/docs`
      : undefined,
    icon: FileCode,
    color: '#85EA2D',
    category: 'Desenvolvimento',
  },
];

const TOOLS: Tool[] = ALL_TOOLS.filter((t): t is Tool => Boolean(t.url));

function groupByCategory(tools: Tool[]): Record<string, Tool[]> {
  return tools.reduce<Record<string, Tool[]>>((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {});
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <div
      className="flex flex-col rounded-2xl bg-surface-container-lowest shadow-soft transition-shadow hover:shadow-md overflow-hidden"
      style={{ borderLeft: `4px solid ${tool.color}` }}
    >
      <div className="flex flex-col gap-2 p-4 flex-1">
        <div className="flex items-start gap-3">
          <Icon size={24} style={{ color: tool.color }} className="shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-tx-primary">{tool.name}</span>
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tx-secondary">
                {tool.category}
              </span>
            </div>
            <p className="mt-1 text-sm text-tx-secondary">{tool.description}</p>
          </div>
        </div>

        {tool.credentials && (
          <p className="text-xs text-tx-secondary pl-9">
            Usuário: <span className="font-semibold">{tool.credentials.user}</span>
            {' · '}
            <span className="italic">{tool.credentials.hint}</span>
          </p>
        )}
      </div>

      <div className="border-t border-border-default/30 px-4 py-3">
        <a
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors"
          style={{ backgroundColor: `${tool.color}1a`, color: tool.color }}
        >
          <ExternalLink size={14} />
          Abrir
        </a>
      </div>
    </div>
  );
}

export function AdminToolsView() {
  const grouped = groupByCategory(TOOLS);
  const categories = Object.keys(grouped);

  return (
    <section className="grid gap-6">
      {TOOLS.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default bg-surface-container-lowest p-8 text-center">
          <p className="font-semibold text-tx-secondary">Nenhuma ferramenta configurada.</p>
          <p className="mt-1 text-sm text-tx-secondary">
            Adicione as URLs no arquivo <code className="rounded bg-surface-container-high px-1 py-0.5 text-xs">.env</code> do frontend.
          </p>
        </div>
      ) : (
        <div className="grid gap-8">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-tx-secondary">
                {category}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {grouped[category].map((tool) => (
                  <ToolCard key={tool.key} tool={tool} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
