import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowDown, ArrowUp, Check, LayoutList, Loader2, RotateCcw, Trash2, User, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import {
  CARD_DISPLAY_LABEL_MAX,
  CARD_DISPLAY_MAX_FIELDS,
  CARD_INDICATOR_OPTIONS,
  DEFAULT_CARD_DISPLAY,
  addField,
  moveField,
  normalizeDraft,
  removeField,
  renameField,
  sameCardDisplay,
  toggleIndicator,
  type CardDisplay,
  type CardDisplayFieldOption,
  type PhaseCardDisplayView,
} from '../lib/card-display';
import {
  fetchPhaseCardDisplay,
  savePersonalCardDisplay,
  savePhaseCardDisplay,
} from '../services/card-display-api';
import { phaseColorHex } from '../types';

type Scope = 'personal' | 'phase';

const labelCls = 'text-[11px] font-bold uppercase tracking-wide text-tx-secondary';
const inputCls =
  'h-8 w-full min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary';

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return 'Não foi possível salvar o card.';
}

export const cardDisplayQueryKey = (formId: string, phaseId: string) =>
  ['kanban-phases', formId, 'card-display', phaseId] as const;

/** Ponto de partida de cada aba: o que a pessoa vê hoje / o padrão atual da fase. */
function initialDraft(view: PhaseCardDisplayView, scope: Scope): CardDisplay {
  if (scope === 'phase') return view.phaseDefault ?? DEFAULT_CARD_DISPLAY;
  return view.personal ?? view.phaseDefault ?? DEFAULT_CARD_DISPLAY;
}

function fieldOptionLabel(field: CardDisplayFieldOption): string {
  return field.phaseLabel ? `${field.label} (fase ${field.phaseLabel})` : field.label;
}

function DisplayEditor({
  draft,
  fields,
  onChange,
}: {
  draft: CardDisplay;
  fields: CardDisplayFieldOption[];
  onChange: (next: CardDisplay) => void;
}) {
  const byCode = useMemo(() => new Map(fields.map((field) => [field.code, field])), [fields]);
  const available = fields.filter((field) => !draft.fields.some((chosen) => chosen.fieldCode === field.code));
  const full = draft.fields.length >= CARD_DISPLAY_MAX_FIELDS;

  return (
    <div className="grid gap-5">
      <section className="grid gap-2" aria-labelledby="card-display-indicators">
        <p id="card-display-indicators" className={labelCls}>
          Indicadores
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CARD_INDICATOR_OPTIONS.map((option) => {
            const on = draft.indicators.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange(toggleIndicator(draft, option.key))}
                className={cn(
                  'flex min-w-0 items-start gap-2.5 rounded-[10px] border p-2.5 text-left transition-colors',
                  on ? 'border-primary bg-primary/10 dark:bg-blue-900/40' : 'border-border-default hover:border-primary/50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border',
                    on ? 'border-primary bg-primary text-white' : 'border-border-default bg-bg-surface',
                  )}
                  aria-hidden
                >
                  {on ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-tx-primary">{option.label}</span>
                  <span className="block text-xs text-tx-secondary">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-tx-muted">
          O título sempre aparece, e o aviso &quot;Sua aprovação pendente&quot; também.
        </p>
      </section>

      <section className="grid gap-2" aria-labelledby="card-display-fields">
        <div className="flex items-baseline justify-between gap-2">
          <p id="card-display-fields" className={labelCls}>
            Campos do processo
          </p>
          <span className="text-[11px] text-tx-muted">{`${draft.fields.length}/${CARD_DISPLAY_MAX_FIELDS}`}</span>
        </div>
        {draft.fields.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-border-default px-4 py-4 text-center text-sm text-tx-secondary">
            Nenhum campo no card. Escolha abaixo as respostas que você quer ver sem abrir a solicitação.
          </p>
        ) : (
          <ol className="grid gap-2">
            {draft.fields.map((chosen, index) => {
              const field = byCode.get(chosen.fieldCode);
              const name = field ? fieldOptionLabel(field) : `${chosen.fieldCode} (campo não encontrado)`;
              return (
                <li
                  key={chosen.fieldCode}
                  className="grid gap-2 rounded-[10px] border border-border-default bg-bg-surface p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className={cn('min-w-0 truncate text-sm font-semibold', field ? 'text-tx-primary' : 'text-[#ef4444]')} title={name}>
                    {name}
                  </span>
                  <input
                    className={inputCls}
                    value={chosen.label ?? ''}
                    maxLength={CARD_DISPLAY_LABEL_MAX}
                    placeholder={field?.label ?? 'Rótulo no card'}
                    aria-label={`Rótulo no card para ${name}`}
                    onChange={(event) => onChange(renameField(draft, chosen.fieldCode, event.target.value))}
                  />
                  <span className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      aria-label={`Subir ${name}`}
                      disabled={index === 0}
                      onClick={() => onChange(moveField(draft, chosen.fieldCode, -1))}
                      className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-secondary hover:bg-bg-s2 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Descer ${name}`}
                      disabled={index === draft.fields.length - 1}
                      onClick={() => onChange(moveField(draft, chosen.fieldCode, 1))}
                      className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-secondary hover:bg-bg-s2 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Tirar ${name} do card`}
                      onClick={() => onChange(removeField(draft, chosen.fieldCode))}
                      className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-secondary hover:bg-bg-s2 hover:text-[#ef4444]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <select
          aria-label="Adicionar campo ao card"
          value=""
          disabled={full || available.length === 0}
          onChange={(event) => onChange(addField(draft, event.target.value))}
          className="h-9 w-full rounded-[8px] border border-dashed border-primary/60 bg-bg-surface px-2.5 text-sm text-tx-primary disabled:opacity-50"
        >
          <option value="">
            {full
              ? `Limite de ${CARD_DISPLAY_MAX_FIELDS} campos`
              : available.length === 0
                ? 'Nenhum outro campo disponível'
                : '+ Adicionar campo…'}
          </option>
          {available.map((field) => (
            <option key={field.code} value={field.code}>
              {fieldOptionLabel(field)}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-tx-muted">
          Campo sem resposta não aparece no card. Arquivos não entram (veja-os ao abrir a solicitação).
        </p>
      </section>
    </div>
  );
}

/**
 * "Personalizar card" de uma fase: cada pessoa escolhe o que vê no card (só para ela); quem configura
 * as fases também define o padrão da fase, que vale para quem não ajustou o próprio.
 */
export function CardDisplayModal({
  formId,
  phaseId,
  phaseLabel,
  phaseColor,
  canManagePhase,
  onClose,
}: {
  formId: string;
  phaseId: string;
  phaseLabel: string;
  phaseColor?: string;
  canManagePhase: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const viewQuery = useQuery({
    queryKey: cardDisplayQueryKey(formId, phaseId),
    queryFn: () => fetchPhaseCardDisplay(formId, phaseId),
  });
  const view = viewQuery.data;

  const [scope, setScope] = useState<Scope>('personal');
  const [drafts, setDrafts] = useState<Record<Scope, CardDisplay> | null>(null);
  useEffect(() => {
    if (view && drafts === null) {
      setDrafts({ personal: initialDraft(view, 'personal'), phase: initialDraft(view, 'phase') });
    }
  }, [view, drafts]);

  const draft = drafts?.[scope];
  const baseline = view ? initialDraft(view, scope) : null;
  const dirty = !!draft && !!baseline && !sameCardDisplay(draft, baseline);
  const anyDirty =
    !!drafts && !!view && (['personal', 'phase'] as Scope[]).some((key) => !sameCardDisplay(drafts[key], initialDraft(view, key)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !anyDirty) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyDirty, onClose]);

  const mutation = useMutation({
    mutationFn: ({ target, display }: { target: Scope; display: CardDisplay | null }) =>
      target === 'personal'
        ? savePersonalCardDisplay(formId, phaseId, display)
        : savePhaseCardDisplay(formId, phaseId, display),
    onSuccess: (saved, { target, display }) => {
      queryClient.setQueryData(cardDisplayQueryKey(formId, phaseId), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.kanbanBoard(formId) });
      const title =
        target === 'personal'
          ? display
            ? 'Card ajustado só para você'
            : 'Você voltou ao card padrão da fase'
          : display
            ? 'Padrão do card da fase salvo'
            : 'A fase voltou ao card padrão do sistema';
      showToast({ title, variant: 'success' });
      onClose();
    },
    onError: (error) => showToast({ title: errorMessage(error), variant: 'error' }),
  });

  const setDraft = (next: CardDisplay) => setDrafts((current) => current && { ...current, [scope]: next });
  const save = () => draft && mutation.mutate({ target: scope, display: normalizeDraft(draft) });
  const canReset = scope === 'personal' ? !!view?.personal : !!view?.phaseDefault;
  const reset = () => mutation.mutate({ target: scope, display: null });

  const sourceText = !view
    ? null
    : view.source === 'personal'
      ? 'Hoje você vê o card com o seu ajuste.'
      : view.source === 'phase'
        ? 'Hoje você vê o card padrão desta fase.'
        : 'Hoje você vê o card padrão do sistema.';

  const tab = (value: Scope, Icon: typeof User, title: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={scope === value}
      onClick={() => setScope(value)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-semibold transition-colors',
        scope === value ? 'bg-bg-surface text-tx-primary shadow-sm' : 'text-tx-secondary hover:text-tx-primary',
      )}
    >
      <Icon className="h-4 w-4" /> {title}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !anyDirty) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-display-title"
        className="flex max-h-[90dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header
          className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4"
          style={{ borderTop: `4px solid ${phaseColorHex(phaseColor ?? 'gray')}` }}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">Personalizar card</p>
            <h3 id="card-display-title" className="break-words text-lg font-bold leading-snug text-tx-primary">
              {phaseLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-[8px] p-1.5 text-tx-secondary hover:bg-bg-s2 hover:text-tx-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid flex-1 content-start gap-4 overflow-y-auto bg-bg-s2/40 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <LayoutList className="mt-0.5 h-4 w-4 shrink-0 text-tx-secondary" />
            <div>
              <p className="text-sm font-bold text-tx-primary">O que aparece no card desta fase</p>
              <p className="text-xs text-tx-secondary">
                {scope === 'personal'
                  ? 'Vale só para você, só nesta fase. Os outros continuam vendo o card como estava.'
                  : 'Vale para todos que não ajustaram o próprio card nesta fase.'}{' '}
                {sourceText}
              </p>
            </div>
          </div>

          {canManagePhase ? (
            <div role="tablist" aria-label="Para quem" className="flex w-fit gap-1 rounded-[10px] bg-bg-s2 p-1">
              {tab('personal', User, 'Só para mim')}
              {tab('phase', Users, 'Padrão da fase (todos)')}
            </div>
          ) : null}

          {viewQuery.isError ? (
            <p role="alert" className="text-sm font-semibold text-[#ef4444]">
              Não foi possível carregar o card desta fase.
            </p>
          ) : !view || !draft ? (
            <div className="flex items-center gap-2 py-8 text-sm text-tx-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <DisplayEditor draft={draft} fields={view.fields} onChange={setDraft} />
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default px-5 py-3">
          <div>
            {canReset ? (
              <button
                type="button"
                onClick={reset}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-sm font-semibold text-tx-secondary hover:bg-bg-s2 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {scope === 'personal' ? 'Voltar ao padrão da fase' : 'Voltar ao padrão do sistema'}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[8px] px-3 py-2 text-sm font-semibold text-tx-secondary hover:bg-bg-s2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draft || !dirty || mutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {scope === 'personal' ? 'Salvar para mim' : 'Salvar para todos'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
