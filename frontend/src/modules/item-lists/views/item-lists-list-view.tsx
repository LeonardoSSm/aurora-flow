import { ListChecks, Plus, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { cn } from '../../../lib/cn';
import { useItemListsQuery, type ItemListSummary } from '../item-lists-api';
import { usageText } from './usage-text';

type StatusFilter = 'active' | 'all';

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const iconChipCls =
  'grid shrink-0 place-items-center bg-primary/10 text-primary dark:bg-blue-900/30 dark:text-blue-300';

function ListCard({ list }: { list: ItemListSummary }) {
  const linkedFields = list.usage.forms + list.usage.phaseFields;
  return (
    <Link
      to={`/listas-de-itens/${list.id}`}
      className={cn(
        'group grid min-w-0 content-between gap-5 rounded-[10px] border border-border-strong bg-bg-surface p-5 shadow-sm transition-colors hover:border-primary',
        !list.isActive && 'opacity-75',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(iconChipCls, 'h-10 w-10 rounded-[10px]')}>
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-tx-primary group-hover:text-primary dark:group-hover:text-blue-300">
              {list.name}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-tx-secondary">
              {list.description || 'Sem descrição'}
            </p>
          </div>
        </div>
        {!list.isActive ? (
          <span className="shrink-0 rounded-full bg-bg-s2 px-2.5 py-1 text-[11px] font-bold uppercase text-tx-secondary">
            Arquivada
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-[8px] bg-bg-s2 px-3 py-2">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-tx-muted">
            Itens ativos
          </dt>
          <dd className="text-lg font-extrabold text-tx-primary">{list.itemCount}</dd>
        </div>
        <div className="rounded-[8px] bg-bg-s2 px-3 py-2">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-tx-muted">
            Campos ligados
          </dt>
          <dd className="text-lg font-extrabold text-tx-primary">{linkedFields}</dd>
        </div>
      </dl>

      <p className="text-xs text-tx-muted">
        {usageText(list.usage).replace(/^./, (first) => first.toUpperCase())} · atualizada em{' '}
        {new Date(list.updatedAt).toLocaleDateString('pt-BR')}
      </p>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="grid animate-pulse gap-5 rounded-[10px] border border-border-strong bg-bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-[10px] bg-border-default" />
        <div className="grid flex-1 gap-2">
          <div className="h-4 w-40 rounded bg-border-default" />
          <div className="h-3 w-28 rounded bg-bg-hover" />
        </div>
      </div>
      <div className="h-14 rounded-[8px] bg-bg-s2" />
    </div>
  );
}

/**
 * Listas de itens: listas salvas uma vez e usadas como opções de lista suspensa, seleção única e
 * múltipla em vários formulários e fases. Uma lista arquivada some das escolhas novas, mas os
 * campos que já a usam continuam funcionando.
 */
export function ItemListsListView() {
  const { hasPermission } = useAuth();
  // Listas são um catálogo da plataforma: mantém quem tem a permissão de sistema.
  const canEdit = hasPermission('item_lists.manage');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const listQuery = useItemListsQuery(status === 'all');
  const lists = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const term = normalize(search.trim());
  const visible = useMemo(
    () =>
      term
        ? lists.filter((list) => normalize(`${list.name} ${list.description ?? ''}`).includes(term))
        : lists,
    [lists, term],
  );
  const filtered = Boolean(term) || status !== 'active';

  return (
    <section className="grid gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-tx-primary">
            Listas de itens
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-tx-secondary">
            Salve uma lista uma vez e use como opções de lista suspensa, seleção única ou múltipla
            em qualquer formulário ou fase do Kanban. Mudou a lista, mudam as opções de todos os
            campos que a usam.
          </p>
        </div>
        {canEdit ? (
          <Link
            to="/listas-de-itens/nova"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-primary px-4 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nova lista
          </Link>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou descrição..."
            aria-label="Buscar lista de itens"
            className="h-10 w-full rounded-[8px] border border-border-default bg-bg-surface pl-9 pr-3 text-sm text-tx-primary outline-none focus:border-primary"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          aria-label="Situação"
          className="h-10 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
        >
          <option value="active">Apenas ativas</option>
          <option value="all">Incluir arquivadas</option>
        </select>
        {listQuery.isSuccess ? (
          <span className="text-xs text-tx-muted">
            {visible.length} {visible.length === 1 ? 'lista' : 'listas'}
          </span>
        ) : null}
      </div>

      {listQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : listQuery.isError ? (
        <div className="grid place-items-center gap-4 rounded-[10px] border border-error/30 bg-error/5 px-6 py-12 text-center">
          <p className="text-sm font-bold text-error">Erro ao carregar as listas de itens.</p>
          <button
            type="button"
            onClick={() => void listQuery.refetch()}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-error/30 bg-bg-surface px-4 text-sm font-bold text-error"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="grid place-items-center gap-4 rounded-[10px] border border-dashed border-border-strong bg-bg-surface px-6 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-bg-hover text-primary dark:text-blue-300">
            <ListChecks className="h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-bold text-tx-primary">
              {filtered ? 'Nenhum resultado' : 'Nenhuma lista de itens ainda'}
            </p>
            <p className="mt-1 text-sm text-tx-secondary">
              {filtered
                ? 'Tente ajustar a busca ou a situação.'
                : 'Crie uma lista — dá para colar os itens direto da planilha.'}
            </p>
          </div>
          {canEdit && !filtered ? (
            <Link
              to="/listas-de-itens/nova"
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Nova lista
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>
      )}
    </section>
  );
}
