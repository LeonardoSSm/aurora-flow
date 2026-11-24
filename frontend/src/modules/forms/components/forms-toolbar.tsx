import { Plus, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { STATUS_TABS, type StatusFilterValue } from '../hooks/use-forms-management';

const STATUS_TAB_LABEL: Record<string, string> = {
  active: 'Ativos',
  published: 'Publicados',
  draft: 'Rascunhos',
  archived: 'Arquivados',
  all: 'Todos',
};

type FormsToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (value: StatusFilterValue) => void;
  /** Quantos processos cada aba mostra (com a busca atual); ausente enquanto carrega. */
  statusCounts: Partial<Record<StatusFilterValue, number>>;
  /** Processos nesta página e total do filtro, para o "Exibindo X de Y". */
  showingCount: number;
  totalCount: number;
  onQuickCreate: () => void;
  onReload: () => void;
  onCreateWithBuilder: () => void;
  /** Sem forms.create os botões de criar somem (o backend recusaria). */
  canCreate?: boolean;
  loading: boolean;
  creating: boolean;
  isOwnScope?: boolean;
};

export function FormsToolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  showingCount,
  totalCount,
  onQuickCreate,
  onReload,
  onCreateWithBuilder,
  canCreate = true,
  loading,
  creating,
  isOwnScope = false,
}: FormsToolbarProps) {
  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-tx-primary">
            {isOwnScope ? 'Meus Processos' : 'Gestão de Processos'}
          </h1>
          <p className="mt-1 text-sm text-tx-secondary">
            {isOwnScope
              ? 'Processos criados por você — crie, edite e acompanhe.'
              : 'Controle de criação, status e visão geral dos processos ativos.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-tx-secondary transition-colors hover:bg-bg-hover hover:text-tx-primary disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
          {canCreate ? (
            <>
              <button
                type="button"
                onClick={onCreateWithBuilder}
                className="inline-flex h-10 items-center rounded-[10px] border border-border-strong bg-bg-surface px-3.5 text-sm font-bold text-tx-primary transition-colors hover:bg-bg-hover"
              >
                Novo processo
              </button>
              <button
                type="button"
                onClick={onQuickCreate}
                disabled={creating}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-sm font-bold text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {creating ? 'Criando…' : 'Criar rápido'}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-[290px]">
          <span className="sr-only">Pesquisar processos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Pesquisar por nome, categoria, área ou status..."
            className="h-10 w-full rounded-[10px] border border-border-default bg-bg-surface pl-9 pr-3 text-sm text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary"
          />
        </label>

        <div
          role="tablist"
          aria-label="Filtrar por status"
          className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-bg-s2 p-1"
        >
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab;
            const count = statusCounts[tab];
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onStatusFilterChange(tab)}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-bg-surface text-primary shadow-sm dark:text-blue-300'
                    : 'text-tx-secondary hover:text-tx-primary',
                )}
              >
                {STATUS_TAB_LABEL[tab]}
                {typeof count === 'number' ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                      active
                        ? 'bg-primary/10 text-primary dark:bg-blue-900/40 dark:text-blue-300'
                        : 'bg-bg-s3 text-tx-secondary',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-tx-secondary md:ml-auto">
          Exibindo <strong className="text-tx-primary">{showingCount}</strong> de{' '}
          <strong className="text-tx-primary">{totalCount}</strong> processo(s)
        </p>
      </div>
    </div>
  );
}
