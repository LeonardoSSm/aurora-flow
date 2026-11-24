import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ClipboardPaste,
  ExternalLink,
  Link2,
  ListChecks,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import {
  draftToSave,
  emptyListDraft,
  listDraftIssue,
  listToDraft,
  localKey,
  parsePastedItems,
  type ListDraft,
} from '../item-list-draft';
import {
  columnId,
  columnTypeLabel,
  COLUMN_COLORS,
  COLUMN_TYPES,
  COLOR_ORDER,
  type DraftValue,
} from '../item-list-columns';
import {
  fetchItemList,
  itemListKeys,
  saveItemList,
  setItemListActive,
  type ItemListColumn,
  type ItemListColumnType,
} from '../item-lists-api';
import { usageText } from './usage-text';

const inputCls =
  'h-10 w-full min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60';
const cellCls =
  'h-8 w-full min-w-0 rounded-[6px] border border-transparent bg-transparent px-2 text-sm text-tx-primary outline-none hover:border-border-default focus:border-primary focus:bg-bg-surface disabled:opacity-60';
const labelCls = 'text-xs font-bold uppercase tracking-wide text-tx-secondary';
const iconChipCls =
  'grid shrink-0 place-items-center bg-primary/10 text-primary dark:bg-blue-900/30 dark:text-blue-300';

/** A partir daqui a busca nos itens aparece: abaixo, rolar a lista é mais rápido que digitar. */
const SEARCH_FROM = 8;

const snapshotOf = (draft: ListDraft) => JSON.stringify(draftToSave(draft));

function Panel({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 content-start gap-4 rounded-[10px] border border-border-strong bg-bg-surface p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn(iconChipCls, 'h-8 w-8 rounded-[8px]')}>{icon}</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-tx-primary">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-tx-secondary">{description}</p> : null}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Edição de uma coluna própria (nome, tipo e, na seleção, as opções coloridas). Aparece acima da
 * tabela ao clicar no cabeçalho da coluna.
 */
function ColumnEditor({
  column,
  disabled,
  onChange,
  onRemove,
  onClose,
}: {
  column: ItemListColumn;
  disabled: boolean;
  onChange: (next: ItemListColumn) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const options = column.options ?? [];
  const setOption = (id: string, patch: Partial<(typeof options)[number]>) =>
    onChange({
      ...column,
      options: options.map((option) => (option.id === id ? { ...option, ...patch } : option)),
    });
  return (
    <div
      role="group"
      aria-label={`Coluna ${column.name || 'sem nome'}`}
      className="grid gap-3 rounded-[8px] border border-primary/40 bg-primary/5 p-3 dark:bg-blue-900/20"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="grid gap-1.5">
          <span className={labelCls}>Nome da coluna</span>
          <input
            autoFocus
            value={column.name}
            disabled={disabled}
            onChange={(event) => onChange({ ...column, name: event.target.value })}
            placeholder="Ex.: CNPJ, Prazo, Status"
            aria-label="Nome da coluna"
            className={inputCls}
          />
        </label>
        <label className="grid gap-1.5">
          <span className={labelCls}>Tipo</span>
          <select
            value={column.type}
            disabled={disabled}
            aria-label="Tipo da coluna"
            onChange={(event) => {
              const type = event.target.value as ItemListColumnType;
              onChange(
                type === 'select'
                  ? { id: column.id, name: column.name, type, options }
                  : { id: column.id, name: column.name, type },
              );
            }}
            className={inputCls}
          >
            {COLUMN_TYPES.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {column.type === 'select' ? (
        <div className="grid gap-2">
          <span className={labelCls}>Opções</span>
          {options.length === 0 ? (
            <p className="text-xs text-tx-muted">Nenhuma opção ainda.</p>
          ) : null}
          {options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <select
                value={option.color}
                disabled={disabled}
                aria-label={`Cor da opção ${option.label || index + 1}`}
                onChange={(event) =>
                  setOption(option.id, {
                    color: event.target.value as (typeof options)[number]['color'],
                  })
                }
                className={cn(
                  'h-9 w-32 shrink-0 rounded-[8px] border border-border-default px-2 text-xs font-bold outline-none focus:border-primary',
                  COLUMN_COLORS[option.color].chip,
                )}
              >
                {COLOR_ORDER.map((color) => (
                  <option key={color} value={color}>
                    {COLUMN_COLORS[color].label}
                  </option>
                ))}
              </select>
              <input
                value={option.label}
                disabled={disabled}
                placeholder="Nome da opção"
                aria-label={`Nome da opção ${index + 1}`}
                onChange={(event) => setOption(option.id, { label: event.target.value })}
                className={cn(inputCls, 'h-9')}
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remover opção ${option.label || index + 1}`}
                onClick={() =>
                  onChange({ ...column, options: options.filter((other) => other !== option) })
                }
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] text-tx-muted hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...column,
                options: [
                  ...options,
                  {
                    id: columnId('o'),
                    label: '',
                    color: COLOR_ORDER[(options.length + 4) % COLOR_ORDER.length],
                  },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-1 text-xs font-bold text-primary dark:text-blue-300"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar opção
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-xs font-bold text-error hover:bg-error/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remover coluna
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-[8px] bg-primary px-4 text-xs font-bold text-white"
        >
          Pronto
        </button>
      </div>
    </div>
  );
}

/** Célula de uma coluna própria, no formato do tipo da coluna. */
function ColumnCell({
  column,
  value,
  disabled,
  position,
  onChange,
}: {
  column: ItemListColumn;
  value: DraftValue | undefined;
  disabled: boolean;
  position: number;
  onChange: (value: DraftValue) => void;
}) {
  const label = `${column.name || 'Coluna'} do item ${position}`;
  const text = typeof value === 'string' ? value : '';
  switch (column.type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case 'select': {
      const chosen = column.options?.find((option) => option.id === text);
      return (
        <select
          value={chosen ? text : ''}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            cellCls,
            'font-bold',
            chosen ? COLUMN_COLORS[chosen.color].chip : 'text-tx-muted',
          )}
        >
          <option value="">—</option>
          {column.options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label || 'Opção sem nome'}
            </option>
          ))}
        </select>
      );
    }
    case 'date':
      return (
        <input
          type="date"
          value={text}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={cellCls}
        />
      );
    case 'number':
    case 'currency':
      return (
        <div className="flex items-center">
          {column.type === 'currency' ? (
            <span className="pl-2 text-xs font-semibold text-tx-muted">R$</span>
          ) : null}
          <input
            inputMode="decimal"
            value={text}
            disabled={disabled}
            aria-label={label}
            onChange={(event) => onChange(event.target.value)}
            className={cn(cellCls, 'text-right tabular-nums')}
          />
        </div>
      );
    case 'url':
      return (
        <div className="flex items-center gap-1">
          <input
            type="url"
            value={text}
            disabled={disabled}
            placeholder="https://"
            aria-label={label}
            onChange={(event) => onChange(event.target.value)}
            className={cellCls}
          />
          {/^https?:\/\//i.test(text.trim()) ? (
            <a
              href={text.trim()}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir ${label}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] text-tx-muted hover:bg-bg-hover hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      );
    default:
      return (
        <input
          value={text}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={cellCls}
        />
      );
  }
}

/** Pergunta antes de sair (link interno ou fechar a aba) com alterações não salvas. */
function useLeaveGuard(dirty: boolean, skip: React.MutableRefObject<boolean>) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !skip.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Há alterações não salvas nesta lista. Sair mesmo assim?'))
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/**
 * Página de uma lista de itens (criar ou editar): dados e onde é usada à esquerda, os itens
 * ocupando o resto da tela. Salvar atualiza as opções de todos os campos ligados à lista.
 */
export function ItemListEditorView({ listId }: { listId: string | null }) {
  const { hasPermission } = useAuth();
  // Listas são um catálogo da plataforma: mantém quem tem a permissão de sistema.
  const canEdit = hasPermission('item_lists.manage');
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const detailQuery = useQuery({
    queryKey: itemListKeys.detail(listId),
    queryFn: () => fetchItemList(listId as string),
    enabled: Boolean(listId),
  });
  const [draft, setDraft] = useState<ListDraft>(emptyListDraft);
  const [baseline, setBaseline] = useState(() => snapshotOf(emptyListDraft()));
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [search, setSearch] = useState('');
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const skipGuard = useRef(false);

  useEffect(() => {
    const next = listId && detailQuery.data ? listToDraft(detailQuery.data) : emptyListDraft();
    setDraft(next);
    setBaseline(snapshotOf(next));
  }, [listId, detailQuery.data]);

  const dirty = canEdit && snapshotOf(draft) !== baseline;
  useLeaveGuard(dirty, skipGuard);

  const saveMutation = useMutation({
    mutationFn: () => saveItemList(listId, draftToSave(draft)),
    onSuccess: (saved) => {
      queryClient.setQueryData(itemListKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: itemListKeys.all });
      const linked = saved.usage.forms + saved.usage.phaseFields;
      showToast({
        title: listId ? 'Lista salva' : 'Lista criada',
        description: linked
          ? 'Os campos que usam esta lista já estão com os itens novos.'
          : undefined,
        variant: 'success',
      });
      if (!listId) {
        skipGuard.current = true;
        navigate(`/listas-de-itens/${saved.id}`, { replace: true });
      }
    },
    onError: (error) =>
      showToast({
        title: 'Não foi possível salvar',
        description: getApiErrorMessage(error, 'Tente novamente.'),
        variant: 'error',
      }),
  });
  const activeMutation = useMutation({
    mutationFn: (isActive: boolean) => setItemListActive(listId as string, isActive),
    onSuccess: (saved) => {
      queryClient.setQueryData(itemListKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: itemListKeys.all });
      showToast({
        title: saved.isActive ? 'Lista reativada' : 'Lista arquivada',
        variant: 'success',
      });
    },
  });

  const term = search.trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      term
        ? draft.items.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(term))
        : draft.items,
    [draft.items, term],
  );

  const backLink = (
    <Link
      to="/listas-de-itens"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-tx-secondary hover:text-primary dark:hover:text-blue-300"
    >
      <ArrowLeft className="h-4 w-4" /> Listas de itens
    </Link>
  );

  if (listId && detailQuery.isLoading) {
    return (
      <section className="grid gap-6">
        {backLink}
        <div className="h-10 w-72 animate-pulse rounded-[8px] bg-bg-s2" />
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="h-72 animate-pulse rounded-[10px] bg-bg-s2" />
          <div className="h-96 animate-pulse rounded-[10px] bg-bg-s2" />
        </div>
      </section>
    );
  }
  if (listId && detailQuery.isError) {
    return (
      <section className="grid gap-6">
        {backLink}
        <div className="grid place-items-center gap-2 rounded-[10px] border border-dashed border-border-strong bg-bg-surface px-6 py-16 text-center">
          <p className="text-base font-bold text-tx-primary">Lista não encontrada</p>
          <p className="text-sm text-tx-secondary">
            {getApiErrorMessage(detailQuery.error, 'Ela pode ter sido removida.')}
          </p>
        </div>
      </section>
    );
  }

  const issue = listDraftIssue(draft);
  const disabled = !canEdit || saveMutation.isPending;
  const detail = listId ? detailQuery.data : undefined;
  const archived = Boolean(detail && !detail.isActive);
  const usage = detail?.usage ?? { forms: 0, phaseFields: 0 };
  const set = (patch: Partial<ListDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateItem = (key: string, patch: Partial<ListDraft['items'][number]>) =>
    set({ items: draft.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  const addItem = () =>
    set({
      items: [...draft.items, { key: localKey(), code: '', name: '', isActive: true, values: {} }],
    });
  const setCell = (key: string, column: string, value: DraftValue) =>
    set({
      items: draft.items.map((item) =>
        item.key === key ? { ...item, values: { ...item.values, [column]: value } } : item,
      ),
    });
  const hasValues = (column: string) =>
    draft.items.some((item) => {
      const value = item.values[column];
      return value === true || (typeof value === 'string' && value.trim() !== '');
    });
  /** Sem os valores da coluna em todos os itens (ao remover a coluna ou mudar o tipo dela). */
  const itemsWithout = (column: string) =>
    draft.items.map((item) => {
      if (!(column in item.values)) return item;
      const values = { ...item.values };
      delete values[column];
      return { ...item, values };
    });
  const addColumn = () => {
    const column: ItemListColumn = { id: columnId(), name: '', type: 'text' };
    set({ columns: [...draft.columns, column] });
    setEditingColumn(column.id);
  };
  const updateColumn = (next: ItemListColumn) => {
    const current = draft.columns.find((column) => column.id === next.id);
    const retyped = current && current.type !== next.type;
    if (
      retyped &&
      hasValues(next.id) &&
      !window.confirm('Mudar o tipo apaga os valores desta coluna em todos os itens. Continuar?')
    )
      return;
    set({
      columns: draft.columns.map((column) => (column.id === next.id ? next : column)),
      ...(retyped ? { items: itemsWithout(next.id) } : {}),
    });
  };
  const removeColumn = (id: string) => {
    if (hasValues(id) && !window.confirm('Remover a coluna apaga os valores dela. Continuar?'))
      return;
    set({ columns: draft.columns.filter((column) => column.id !== id), items: itemsWithout(id) });
    setEditingColumn(null);
  };
  const columnBeingEdited = draft.columns.find((column) => column.id === editingColumn);
  const activeCount = draft.items.filter((item) => item.isActive).length;

  return (
    <section className="grid gap-6">
      {backLink}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(iconChipCls, 'h-12 w-12 rounded-[12px]')}>
            <ListChecks className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-3xl font-extrabold tracking-tight text-tx-primary">
                {draft.name.trim() || (listId ? 'Lista sem nome' : 'Nova lista de itens')}
              </h1>
              {archived ? (
                <span className="rounded-full bg-bg-s2 px-2.5 py-1 text-[11px] font-bold uppercase text-tx-secondary">
                  Arquivada
                </span>
              ) : null}
              {dirty ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Alterações não salvas
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-tx-secondary">
              {activeCount} {activeCount === 1 ? 'item ativo' : 'itens ativos'}
              {draft.items.length > activeCount
                ? ` · ${draft.items.length - activeCount} inativo(s)`
                : ''}
              {listId ? ` · ${usageText(usage)}` : ''}
            </p>
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            {issue && dirty ? (
              <span className="text-xs font-semibold text-error">{issue}</span>
            ) : null}
            {detail ? (
              <button
                type="button"
                onClick={() => activeMutation.mutate(!detail.isActive)}
                disabled={activeMutation.isPending}
                className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-border-strong bg-bg-surface px-4 text-sm font-bold text-tx-secondary transition-colors hover:bg-bg-hover hover:text-tx-primary disabled:opacity-60"
              >
                {detail.isActive ? (
                  <Archive className="h-4 w-4" />
                ) : (
                  <ArchiveRestore className="h-4 w-4" />
                )}
                {detail.isActive ? 'Arquivar' : 'Reativar'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={Boolean(issue) || saveMutation.isPending || (Boolean(listId) && !dirty)}
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[8px] bg-primary px-5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvando…' : listId ? 'Salvar alterações' : 'Criar lista'}
            </button>
          </div>
        ) : null}
      </header>

      {archived ? (
        <p className="rounded-[8px] border border-border-default bg-bg-s2 px-4 py-3 text-sm text-tx-secondary">
          Esta lista está arquivada: não aparece para escolher em campos novos, mas os campos que já
          a usam continuam com as opções dela.
        </p>
      ) : null}

      {/* Com colunas próprias a tabela precisa da largura toda: os painéis sobem, lado a lado. */}
      <div
        className={cn(
          'grid items-start gap-6',
          !draft.columns.length && 'xl:grid-cols-[340px_minmax(0,1fr)]',
        )}
      >
        <div
          className={cn(
            'grid gap-6',
            draft.columns.length ? 'lg:grid-cols-2' : 'xl:sticky xl:top-4',
          )}
        >
          <Panel
            title="Dados da lista"
            description="Como ela aparece na escolha do campo."
            icon={<ListChecks className="h-4 w-4" />}
          >
            <label className="grid gap-1.5">
              <span className={labelCls}>Nome</span>
              <input
                value={draft.name}
                disabled={disabled}
                onChange={(event) => set({ name: event.target.value })}
                placeholder="Ex.: Fornecedores"
                aria-label="Nome da lista"
                className={cn(inputCls, 'font-bold')}
              />
            </label>
            <label className="grid gap-1.5">
              <span className={labelCls}>Descrição (opcional)</span>
              <textarea
                rows={2}
                value={draft.description}
                disabled={disabled}
                onChange={(event) => set({ description: event.target.value })}
                aria-label="Descrição da lista"
                className="w-full resize-y rounded-[8px] border border-border-default bg-bg-surface px-3 py-2 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
          </Panel>

          <Panel
            title="Onde é usada"
            description="Campos de lista suspensa, seleção única ou múltipla ligados a ela."
            icon={<Link2 className="h-4 w-4" />}
          >
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-[8px] bg-bg-s2 px-3 py-2">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-tx-muted">
                  Formulários
                </dt>
                <dd className="text-lg font-extrabold text-tx-primary">{usage.forms}</dd>
              </div>
              <div className="rounded-[8px] bg-bg-s2 px-3 py-2">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-tx-muted">
                  Campos de fase
                </dt>
                <dd className="text-lg font-extrabold text-tx-primary">{usage.phaseFields}</dd>
              </div>
            </dl>
            <p className="text-xs text-tx-muted">
              Para usar: no construtor ou nas fases do Kanban, crie um campo de lista suspensa ou
              seleção e escolha &quot;Usar lista salva&quot;. Salvar aqui atualiza esses campos na
              hora; respostas já enviadas continuam mostrando o item escolhido.
            </p>
          </Panel>
        </div>

        <Panel
          title={`Itens (${draft.items.length})`}
          description={
            'Cada item ativo vira uma opção. Desmarque "Ativo" para tirar das opções sem perder as respostas antigas. Use "+ Coluna" para guardar mais informações de cada item.'
          }
          icon={<ListChecks className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {draft.items.length > SEARCH_FROM ? (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tx-muted" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar item"
                    aria-label="Buscar item"
                    className="h-9 w-48 rounded-[8px] border border-border-default bg-bg-surface pl-8 pr-2 text-sm text-tx-primary outline-none focus:border-primary"
                  />
                </div>
              ) : null}
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPasting((current) => !current)}
                    aria-pressed={pasting}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-xs font-bold text-tx-primary hover:bg-bg-hover"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" /> Colar da planilha
                  </button>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/15 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar item
                  </button>
                </>
              ) : null}
            </div>
          }
        >
          {pasting ? (
            <div className="grid gap-2 rounded-[8px] border border-dashed border-primary/40 bg-primary/5 p-3 dark:bg-blue-900/20">
              <p className="text-xs text-tx-secondary">
                Copie da planilha e cole aqui — um item por linha. Com duas colunas, a primeira é o{' '}
                <strong className="text-tx-primary">código</strong> e a segunda o{' '}
                <strong className="text-tx-primary">nome</strong>; com uma só, é o nome.
                {draft.columns.length ? (
                  <>
                    {' '}
                    Da terceira em diante:{' '}
                    <strong className="text-tx-primary">
                      {draft.columns.map((column) => column.name.trim() || 'sem nome').join(', ')}
                    </strong>
                    , nessa ordem.
                  </>
                ) : null}{' '}
                Também aceita ponto e vírgula. Nomes que já estão na lista são ignorados.
              </p>
              <textarea
                rows={6}
                value={pasted}
                aria-label="Itens colados da planilha"
                onChange={(event) => setPasted(event.target.value)}
                className="w-full rounded-[8px] border border-border-default bg-bg-surface px-3 py-2 font-mono text-xs text-tx-primary outline-none focus:border-primary"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasting(false);
                    setPasted('');
                  }}
                  className="h-9 rounded-[8px] px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!pasted.trim()}
                  onClick={() => {
                    const items = parsePastedItems(pasted, draft.items, draft.columns);
                    set({ items: [...draft.items, ...items] });
                    showToast({
                      title: `${items.length} item(ns) adicionados`,
                      variant: 'success',
                    });
                    setPasting(false);
                    setPasted('');
                  }}
                  className="h-9 rounded-[8px] bg-primary px-4 text-xs font-bold text-white disabled:opacity-50"
                >
                  Adicionar itens
                </button>
              </div>
            </div>
          ) : null}

          {columnBeingEdited ? (
            <ColumnEditor
              key={columnBeingEdited.id}
              column={columnBeingEdited}
              disabled={disabled}
              onChange={updateColumn}
              onRemove={() => removeColumn(columnBeingEdited.id)}
              onClose={() => setEditingColumn(null)}
            />
          ) : null}

          <div className="overflow-x-auto rounded-[8px] border border-border-default">
            <table
              className="w-full text-sm"
              style={{ minWidth: 480 + draft.columns.length * 170 }}
            >
              <thead className="bg-bg-s2 text-left text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-right">#</th>
                  <th className="w-36 px-2 py-2.5">Código</th>
                  <th className="min-w-[180px] px-2 py-2.5">Nome</th>
                  {draft.columns.map((column) => (
                    <th
                      key={column.id}
                      className={cn(
                        'px-1 py-1.5',
                        column.type === 'checkbox' ? 'w-28 text-center' : 'min-w-[160px]',
                      )}
                    >
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={editingColumn === column.id}
                        aria-label={`Editar coluna ${column.name.trim() || 'sem nome'}`}
                        title={columnTypeLabel(column.type)}
                        onClick={() =>
                          setEditingColumn((current) => (current === column.id ? null : column.id))
                        }
                        className={cn(
                          'group inline-flex max-w-full items-center gap-1.5 rounded-[6px] px-1.5 py-1 uppercase tracking-wide enabled:hover:bg-bg-hover enabled:hover:text-tx-primary',
                          editingColumn === column.id &&
                            'bg-primary/10 text-primary dark:text-blue-300',
                        )}
                      >
                        <span className="truncate">{column.name.trim() || 'Sem nome'}</span>
                        {canEdit ? (
                          <Settings2 className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th className="w-16 px-2 py-2.5 text-center">Ativo</th>
                  <th className="w-12 px-1 py-1.5 text-right">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={addColumn}
                        title="Adicionar coluna"
                        className="inline-flex h-7 items-center gap-0.5 whitespace-nowrap rounded-[6px] px-1.5 text-[11px] font-bold normal-case text-primary hover:bg-primary/10 dark:text-blue-300"
                      >
                        <Plus className="h-3.5 w-3.5" /> Coluna
                      </button>
                    ) : (
                      <span className="sr-only">Ações</span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={5 + draft.columns.length} className="px-3 py-12 text-center">
                      <p className="text-sm font-bold text-tx-primary">
                        {draft.items.length ? 'Nenhum item encontrado' : 'Nenhum item ainda'}
                      </p>
                      <p className="mt-1 text-xs text-tx-muted">
                        {draft.items.length
                          ? 'Tente outra busca.'
                          : 'Adicione um item ou cole as linhas direto da planilha.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((item) => {
                    const position = draft.items.indexOf(item) + 1;
                    return (
                      <tr
                        key={item.key}
                        className={cn(
                          'border-t border-border-default transition-colors hover:bg-bg-hover/50',
                          !item.isActive && 'opacity-55',
                        )}
                      >
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-tx-muted">
                          {position}
                        </td>
                        <td className="px-1 py-1.5">
                          <input
                            value={item.code}
                            disabled={disabled}
                            placeholder="opcional"
                            aria-label={`Código do item ${position}`}
                            onChange={(event) => updateItem(item.key, { code: event.target.value })}
                            className={cn(cellCls, 'font-mono')}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <input
                            value={item.name}
                            disabled={disabled}
                            aria-label={`Nome do item ${position}`}
                            onChange={(event) => updateItem(item.key, { name: event.target.value })}
                            className={cn(cellCls, 'font-semibold')}
                          />
                        </td>
                        {draft.columns.map((column) => (
                          <td
                            key={column.id}
                            className={cn(
                              'px-1 py-1.5',
                              column.type === 'checkbox' && 'text-center',
                            )}
                          >
                            <ColumnCell
                              column={column}
                              value={item.values[column.id]}
                              disabled={disabled}
                              position={position}
                              onChange={(value) => setCell(item.key, column.id, value)}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.isActive}
                            disabled={disabled}
                            aria-label={`Item ${position} ativo`}
                            onChange={(event) =>
                              updateItem(item.key, { isActive: event.target.checked })
                            }
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          {canEdit ? (
                            <button
                              type="button"
                              aria-label={`Remover item ${item.name || position}`}
                              onClick={() =>
                                set({
                                  items: draft.items.filter((other) => other.key !== item.key),
                                })
                              }
                              className="grid h-8 w-8 place-items-center rounded-[6px] text-tx-muted hover:bg-error/10 hover:text-error"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {canEdit && draft.items.length > 0 ? (
            <button
              type="button"
              onClick={addItem}
              className="inline-flex w-fit items-center gap-1 text-xs font-bold text-primary dark:text-blue-300"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar item
            </button>
          ) : null}
        </Panel>
      </div>
    </section>
  );
}
