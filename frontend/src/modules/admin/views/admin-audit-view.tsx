import { Button, Card } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { AdminHeaderActions, useAdminHeader } from '../components/admin-modal-context';
import { useAdminAudit } from '../hooks/use-admin-audit';
import {
  AUDIT_ACTION_FILTERS,
  AUDIT_MODULES,
  auditActionLabel,
  auditEntityLabel,
  auditModuleLabel,
  formatAuditPayload,
} from '../lib/audit-labels';

const moduleColors: Record<string, string> = {
  auth: 'bg-sky-500',
  forms: 'bg-violet-500',
  solicitations: 'bg-blue-500',
  approvals: 'bg-orange-500',
  responses: 'bg-emerald-500',
  users: 'bg-amber-500',
  ai: 'bg-fuchsia-500',
  audit: 'bg-slate-400',
};

const absoluteDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function toRelativeTime(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.max(Math.floor(diffMs / 60000), 0);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  return `há ${Math.floor(diffH / 24)} dia(s)`;
}

export function AdminAuditView() {
  const {
    events,
    total,
    page,
    totalPages,
    loading,
    error,
    params,
    filterByModule,
    filterByAction,
    setPage,
    reload,
  } = useAdminAudit();
  useAdminHeader({
    description: `${total} evento(s) registrado(s). Linha do tempo de ações críticas.`,
  });

  return (
    <section className="grid gap-4">
      <AdminHeaderActions>
        <Button size="sm" variant="subtle" onClick={() => reload()} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </AdminHeaderActions>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {['', ...AUDIT_MODULES.map((m) => m.code)].map((mod) => {
          const isActive = mod ? params.module === mod : !params.module;
          return (
            <button
              key={mod || 'all'}
              onClick={() => filterByModule(mod || undefined)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-primary bg-primary text-white dark:border-blue-600 dark:bg-blue-600 dark:text-white'
                  : 'border-border-default/50 bg-bg-surface text-tx-primary hover:bg-surface-container-low dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
              )}
            >
              {mod ? auditModuleLabel(mod) : 'Todos os módulos'}
            </button>
          );
        })}
        <div className="mx-1 w-px bg-outline-variant/30 dark:bg-slate-600" />
        {['', ...AUDIT_ACTION_FILTERS].map((act) => {
          const isActive = act ? params.action === act : !params.action;
          return (
            <button
              key={act || 'all-actions'}
              onClick={() => filterByAction(act || undefined)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-primary bg-primary text-white dark:border-blue-600 dark:bg-blue-600 dark:text-white'
                  : 'border-border-default/50 bg-bg-surface text-tx-primary hover:bg-surface-container-low dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
              )}
            >
              {act ? auditActionLabel(act) : 'Todas as ações'}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      {/* Timeline */}
      {loading ? (
        <Card>
          <p className="text-sm text-tx-secondary">Carregando...</p>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <p className="text-sm text-tx-secondary">
            Nenhum evento encontrado para os filtros selecionados.
          </p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {events.map((event) => {
            const barColor = moduleColors[event.module] ?? 'bg-slate-400';
            const relTime = toRelativeTime(event.createdAt);
            return (
              <Card key={event.id} className="relative pl-6 py-3">
                <span className={`absolute left-2 top-3 bottom-3 w-1 rounded-full ${barColor}`} />
                <div className="flex flex-wrap items-start justify-between gap-1">
                  <div>
                    <p className="text-sm font-semibold text-tx-primary">
                      <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
                        {auditModuleLabel(event.module)}
                      </span>{' '}
                      {auditActionLabel(event.action)}{' '}
                      <span className="font-normal text-tx-secondary">
                        em {auditEntityLabel(event.entity)}
                      </span>
                    </p>
                    <p className="text-xs text-tx-secondary">
                      {event.actorName
                        ? `Por ${event.actorName}`
                        : event.actorId
                          ? 'Por usuário removido'
                          : 'Pelo sistema'}
                    </p>
                  </div>
                  <time
                    dateTime={event.createdAt}
                    title={absoluteDate.format(new Date(event.createdAt))}
                    className="shrink-0 text-xs text-tx-secondary"
                  >
                    {relTime}
                  </time>
                </div>
                {event.payload && Object.keys(event.payload).length > 0 && (
                  <p className="mt-1 break-words text-xs text-tx-secondary">
                    {formatAuditPayload(event.payload)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="subtle" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </Button>
          <span className="text-sm text-tx-secondary">
            Página {page} de {totalPages}
          </span>
          <Button
            size="sm"
            variant="subtle"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próximo →
          </Button>
        </div>
      )}
    </section>
  );
}
