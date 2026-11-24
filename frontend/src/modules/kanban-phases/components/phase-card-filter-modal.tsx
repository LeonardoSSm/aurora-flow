import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, EyeOff, Filter, ListFilter, Loader2, Plus, Trash2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { useRoleOptionsQuery } from '../../admin/hooks/use-roles';
import { fetchFormById } from '../../forms/services/forms-api';
import { useKanbanPhasesQuery } from '../hooks/use-kanban-phases-query';
import {
  cardFilterFields,
  cardFilterRuleIssue,
  cardFilterValueLabel,
  cardVisibilityPayload,
  draftFromCardVisibility,
  newCardFilterRule,
  type CardFilterField,
  type DraftCardFilterRule,
} from '../lib/phase-card-filter';
import { saveKanbanPhaseCardVisibility } from '../services/kanban-phases-api';
import { phaseColorHex } from '../types';
import { ChipMultiSelect, PhasePeoplePicker } from './people-multi-select';

const labelCls = 'text-[11px] font-bold uppercase tracking-wide text-tx-secondary';
const inputCls =
  'h-9 w-full min-w-0 rounded-[8px] border border-border-default bg-bg-s2 px-2.5 text-sm text-tx-primary outline-none focus:border-primary';

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return 'Não foi possível salvar o filtro de cards.';
}

/** Respostas digitadas (campo de texto): Enter ou "Adicionar" vira um chip. */
function TypedValues({ values, onChange }: { values: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const value = text.trim();
    if (value && !values.some((item) => item.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setText('');
  };
  return (
    <div className="grid gap-2 rounded-[10px] border border-border-default p-3">
      <span className="text-xs font-bold text-tx-primary">Respostas</span>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={text}
          placeholder="Digite a resposta e tecle Enter"
          aria-label="Nova resposta"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-[8px] border border-border-default px-3 text-xs font-semibold text-tx-primary hover:border-primary"
        >
          Adicionar
        </button>
      </div>
      {values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full bg-bg-s2 px-2 py-0.5 text-xs font-semibold text-tx-primary"
            >
              {value}
              <button
                type="button"
                aria-label={`Tirar ${value}`}
                onClick={() => onChange(values.filter((item) => item !== value))}
                className="text-tx-muted hover:text-tx-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <p className="text-[11px] text-tx-muted">Compara a resposta inteira, sem diferença de maiúsculas.</p>
    </div>
  );
}

function RuleEditor({
  index,
  rule,
  fields,
  roleOptions,
  showIssue,
  onChange,
  onRemove,
}: {
  index: number;
  rule: DraftCardFilterRule;
  fields: CardFilterField[];
  roleOptions: ReadonlyArray<{ code: string; name: string }>;
  showIssue: boolean;
  onChange: (next: DraftCardFilterRule) => void;
  onRemove: () => void;
}) {
  const field = fields.find((item) => item.code === rule.fieldCode);
  const missingField = !!rule.fieldCode && !field;
  const issue = cardFilterRuleIssue(rule);

  return (
    <li className="grid gap-3 rounded-[12px] border border-border-default bg-bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-tx-primary">{`Regra ${index + 1}`}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover regra ${index + 1}`}
          className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-semibold text-tx-secondary hover:bg-bg-s2 hover:text-[#ef4444]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remover
        </button>
      </div>

      <label className="grid gap-1">
        <span className={labelCls}>Quando o campo</span>
        <select
          className={inputCls}
          aria-label={`Campo da regra ${index + 1}`}
          value={rule.fieldCode}
          onChange={(event) => onChange({ ...rule, fieldCode: event.target.value, values: [] })}
        >
          <option value="">Escolha um campo…</option>
          {missingField ? <option value={rule.fieldCode}>{`${rule.fieldCode} (campo não encontrado)`}</option> : null}
          {fields.map((item) => (
            <option key={item.code} value={item.code}>
              {item.phaseLabel ? `${item.label} (fase ${item.phaseLabel})` : item.label}
            </option>
          ))}
        </select>
      </label>

      {rule.fieldCode ? (
        <div className="grid gap-1">
          <span className={labelCls}>Tiver uma destas respostas</span>
          {field?.kind === 'text' || missingField ? (
            <TypedValues values={rule.values} onChange={(values) => onChange({ ...rule, values })} />
          ) : (
            <ChipMultiSelect
              icon={ListFilter}
              title="Respostas"
              options={field?.options ?? []}
              selected={rule.values}
              onChange={(values) => onChange({ ...rule, values })}
              searchPlaceholder="Buscar resposta"
            />
          )}
          {field && field.kind === 'options' && field.options.length === 0 ? (
            <p className="text-[11px] text-tx-muted">Este campo ainda não tem opções.</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-1">
        <span className={labelCls}>O card aparece para</span>
        <PhasePeoplePicker
          label={`Quem vê os cards da regra ${index + 1}`}
          value={{ roleCodes: rule.roleCodes, userIds: rule.userIds }}
          onChange={(people) => onChange({ ...rule, roleCodes: people.roleCodes, userIds: people.userIds })}
          roleOptions={roleOptions}
        />
      </div>

      {rule.values.length && field ? (
        <p className="text-xs text-tx-secondary">
          {`Cards com “${field.label}” = ${rule.values.map((value) => `“${cardFilterValueLabel(field, value)}”`).join(' ou ')}.`}
        </p>
      ) : null}
      {showIssue && issue ? (
        <p role="alert" className="text-xs font-semibold text-[#ef4444]">
          {issue}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Configurações da fase no Kanban (engrenagem da coluna): filtro de cards pela resposta. Cada regra
 * liga uma ou mais respostas de um campo a perfis/usuários; quem está numa regra só vê, nesta
 * fase, os cards cuja resposta casa com uma das suas regras. Grava na hora, separado do
 * "Salvar fases" do construtor.
 */
export function PhaseCardFilterModal({
  formId,
  phaseId,
  onClose,
}: {
  formId: string;
  phaseId: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const phasesQuery = useKanbanPhasesQuery(formId);
  const formQuery = useQuery({
    queryKey: queryKeys.forms.byId(formId),
    queryFn: () => fetchFormById(formId),
    staleTime: 60_000,
  });
  const { data: roleOptions = [] } = useRoleOptionsQuery();

  const phase = phasesQuery.data?.find((item) => item.id === phaseId);
  const fields = useMemo(
    () => cardFilterFields(formQuery.data, phasesQuery.data ?? []),
    [formQuery.data, phasesQuery.data],
  );

  const [draft, setDraft] = useState<ReturnType<typeof draftFromCardVisibility> | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  useEffect(() => {
    if (phase && draft === null) setDraft(draftFromCardVisibility(phase.cardVisibility));
  }, [phase, draft]);

  const saved = JSON.stringify(cardVisibilityPayload(draftFromCardVisibility(phase?.cardVisibility)));
  const dirty = !!draft && JSON.stringify(cardVisibilityPayload(draft)) !== saved;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dirty) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onClose]);

  const mutation = useMutation({
    mutationFn: () => saveKanbanPhaseCardVisibility(formId, phaseId, cardVisibilityPayload(draft as NonNullable<typeof draft>)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.kanbanPhases.byForm(formId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.kanbanBoard(formId) });
      showToast({ title: draft?.rules.length ? 'Filtro de cards salvo' : 'Filtro de cards desligado', variant: 'success' });
      onClose();
    },
    onError: (error) => showToast({ title: errorMessage(error), variant: 'error' }),
  });

  const save = () => {
    if (!draft) return;
    if (draft.rules.some((rule) => cardFilterRuleIssue(rule))) {
      setShowIssues(true);
      return;
    }
    mutation.mutate();
  };

  const updateRule = (id: string, next: DraftCardFilterRule) =>
    setDraft((current) => current && { ...current, rules: current.rules.map((rule) => (rule.id === id ? next : rule)) });

  const choice = (value: boolean, icon: LucideIcon, title: string, text: string) => {
    const Icon = icon;
    const active = draft?.othersSeeAll === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => setDraft((current) => current && { ...current, othersSeeAll: value })}
        className={cn(
          'flex min-w-0 items-start gap-2.5 rounded-[10px] border p-3 text-left transition-colors',
          active ? 'border-primary bg-primary/10 dark:bg-blue-900/40' : 'border-border-default hover:border-primary/50',
        )}
      >
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary dark:text-blue-300' : 'text-tx-muted')} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-tx-primary">{title}</span>
          <span className="block text-xs text-tx-secondary">{text}</span>
        </span>
      </button>
    );
  };

  const loading = phasesQuery.isLoading || formQuery.isLoading || !draft;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dirty) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="phase-card-filter-title"
        className="flex max-h-[90dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header
          className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4"
          style={{ borderTop: `4px solid ${phaseColorHex(phase?.color ?? 'gray')}` }}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">Configurações da fase</p>
            <h3 id="phase-card-filter-title" className="break-words text-lg font-bold leading-snug text-tx-primary">
              {phase?.label ?? 'Fase'}
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
            <Filter className="mt-0.5 h-4 w-4 shrink-0 text-tx-secondary" />
            <div>
              <p className="text-sm font-bold text-tx-primary">Quem vê quais cards, pela resposta</p>
              <p className="text-xs text-tx-secondary">
                Quem estiver em uma regra só vê, nesta fase, os cards cuja resposta casa com a regra. Em mais de uma
                regra, basta casar uma.
              </p>
            </div>
          </div>

          {phasesQuery.isError || (phasesQuery.isSuccess && !phase) ? (
            <p role="alert" className="text-sm font-semibold text-[#ef4444]">
              Não foi possível carregar esta fase.
            </p>
          ) : loading || !draft ? (
            <div className="flex items-center gap-2 py-8 text-sm text-tx-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              {draft.rules.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-border-default px-4 py-6 text-center text-sm text-tx-secondary">
                  Sem regras: todos que veem a fase veem todos os cards dela.
                </p>
              ) : (
                <ol className="grid gap-3">
                  {draft.rules.map((rule, index) => (
                    <RuleEditor
                      key={rule.id}
                      index={index}
                      rule={rule}
                      fields={fields}
                      roleOptions={roleOptions}
                      showIssue={showIssues}
                      onChange={(next) => updateRule(rule.id, next)}
                      onRemove={() =>
                        setDraft((current) => current && { ...current, rules: current.rules.filter((item) => item.id !== rule.id) })
                      }
                    />
                  ))}
                </ol>
              )}
              {fields.length === 0 ? (
                <p className="text-xs text-tx-muted">
                  O formulário não tem campo de lista, caixa de seleção ou texto curto para filtrar.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setDraft((current) => current && { ...current, rules: [...current.rules, newCardFilterRule()] })}
                className="inline-flex w-fit items-center gap-1.5 rounded-[8px] border border-dashed border-primary/60 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 dark:text-blue-300"
              >
                <Plus className="h-4 w-4" /> Adicionar regra
              </button>

              {draft.rules.length ? (
                <div className="grid gap-2">
                  <p className={labelCls}>Quem não está em nenhuma regra</p>
                  <div role="radiogroup" aria-label="Quem não está em nenhuma regra" className="grid gap-2 sm:grid-cols-2">
                    {choice(true, Eye, 'Vê todos os cards', 'Só quem está nas regras fica limitado')}
                    {choice(false, EyeOff, 'Não vê nenhum card', 'A coluna aparece vazia para essa pessoa')}
                  </div>
                </div>
              ) : null}

              <p className="text-[11px] text-tx-muted">
                Quem configura as fases do processo sempre vê todos os cards, e cada pessoa sempre vê o card que
                abriu ou do qual é responsável. Fora isso, o card escondido some do Kanban, do painel inicial, da
                lista de Solicitações e de Respostas, e não abre nem por link direto.
              </p>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-3">
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
            disabled={loading || !dirty || mutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </button>
        </footer>
      </section>
    </div>
  );
}
