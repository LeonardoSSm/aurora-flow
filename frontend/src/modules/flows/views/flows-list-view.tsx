import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Trash2, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { queryKeys } from '../../../lib/query-keys';
import { deleteFlow, fetchAllFlows } from '../services/flows-api';
import type { Flow } from '../types/flow.types';

function FlowStatus({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase',
        active ? 'bg-[#e3f8f0] text-[#008d5a] dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-bg-s2 text-tx-secondary',
      ].join(' ')}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function FlowCard({
  flow,
  isDeleting,
  onDelete,
}: {
  flow: Flow;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <article className="grid min-w-0 gap-5 rounded-[10px] border border-border-strong bg-bg-surface p-5 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={[
              'grid h-10 w-10 shrink-0 place-items-center rounded-[10px]',
              flow.isActive ? 'bg-[#e3f8f0] text-[#008d5a] dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-bg-hover text-tx-secondary',
            ].join(' ')}
          >
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-tx-primary">{flow.name}</h2>
            <p className="mt-1 text-xs text-tx-secondary">
              Atualizado em {new Date(flow.updatedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <FlowStatus active={flow.isActive} />
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold text-tx-secondary">Nós</dt>
          <dd className="font-bold text-tx-primary">{flow.nodes.length}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Link
          to={`/flows/${flow.id}`}
          className="inline-flex h-10 items-center justify-center rounded-[8px] bg-bg-hover px-4 text-sm font-bold text-primary transition-colors hover:bg-[#dbeafe] dark:text-blue-200 dark:hover:bg-blue-500/25 dark:hover:text-white"
        >
          Abrir
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          title="Excluir fluxo"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#fee2e2] bg-bg-surface px-3 text-sm font-bold text-[#ef4444] transition-colors hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="grid gap-5 rounded-[10px] border border-border-strong bg-bg-surface p-5 shadow-sm">
      <div className="flex animate-pulse items-start gap-3">
        <div className="h-10 w-10 rounded-[10px] bg-border-default" />
        <div className="grid flex-1 gap-2">
          <div className="h-4 w-40 rounded bg-border-default" />
          <div className="h-3 w-28 rounded bg-bg-hover" />
        </div>
      </div>
      <div className="h-20 animate-pulse rounded-[8px] bg-bg-s2" />
    </div>
  );
}

type ActiveFilter = 'all' | 'active' | 'inactive';

export function FlowsListView() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  const queryParams = {
    page,
    limit: 12,
    ...(search ? { search } : {}),
    ...(activeFilter !== 'all' ? { isActive: activeFilter === 'active' } : {}),
  };

  const {
    data: flowPage,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.flows.list(queryParams),
    queryFn: () => fetchAllFlows(queryParams),
  });

  const flows = flowPage?.data ?? [];
  const totalPages = flowPage?.totalPages ?? 1;
  const total = flowPage?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: deleteFlow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows.all() });
    },
  });

  function handleDelete(flow: Flow) {
    if (window.confirm(`Excluir fluxo "${flow.name}"?`)) {
      deleteMutation.mutate(flow.id);
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-tx-primary">Fluxos</h1>
          <p className="mt-2 text-sm text-tx-secondary">
            Gerencie seus fluxos visuais independentes dos formulários.
          </p>
        </div>

        <Link
          to="/flows/new"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo fluxo
        </Link>
      </header>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome..."
            className="h-10 w-full rounded-[8px] border border-border-default bg-bg-surface pl-9 pr-3 text-sm text-tx-primary outline-none focus:border-primary"
          />
        </div>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          className="h-10 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
        >
          <option value="all">Todos os status</option>
          <option value="active">Apenas ativos</option>
          <option value="inactive">Apenas inativos</option>
        </select>

        {!isLoading && !isError && (
          <span className="text-xs text-tx-muted">
            {total} {total === 1 ? 'fluxo' : 'fluxos'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {isError ? (
        <div className="grid place-items-center gap-4 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-6 py-12 text-center">
          <p className="text-sm font-bold text-[#dc2626]">Erro ao carregar fluxos.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#fecaca] bg-bg-surface px-4 text-sm font-bold text-[#dc2626]"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoading && !isError && flows.length === 0 ? (
        <div className="grid place-items-center gap-4 rounded-[10px] border border-dashed border-border-strong bg-bg-surface px-6 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-bg-hover text-primary">
            <Zap className="h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-bold text-tx-primary">
              {search || activeFilter !== 'all' ? 'Nenhum resultado' : 'Nenhum fluxo criado'}
            </p>
            <p className="mt-1 text-sm text-tx-secondary">
              {search || activeFilter !== 'all'
                ? 'Tente ajustar os filtros de busca.'
                : 'Crie um fluxo em branco para começar.'}
            </p>
          </div>
          {!search && activeFilter === 'all' && (
            <Link
              to="/flows/new"
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Novo fluxo
            </Link>
          )}
        </div>
      ) : null}

      {!isLoading && !isError && flows.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {flows.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                isDeleting={deleteMutation.variables === flow.id && deleteMutation.isPending}
                onDelete={() => handleDelete(flow)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="text-xs text-tx-muted">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-bold text-tx-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-bg-s2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-bold text-tx-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-bg-s2"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
