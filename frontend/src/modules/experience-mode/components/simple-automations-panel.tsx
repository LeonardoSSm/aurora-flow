import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ExternalLink, Plus, Trash2, Workflow, X, Zap } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { flowPhaseIds } from '../../builder/lib/process-automation-map';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { FormAssigneesPicker } from '../../builder/components/form-assignees-picker';
import {
  createFlowForForm,
  deleteFlow,
  fetchFlows,
  toggleFlowActive,
} from '../../flows/services/flows-api';
import { useKanbanPhasesQuery } from '../../kanban-phases/hooks/use-kanban-phases-query';
import { fetchAssignableUsers } from '../../users/services/users-api';
import {
  automationIssue,
  buildAutomationFlow,
  defaultMessage,
  describeAction,
  describeTrigger,
  parseSimpleAutomation,
  SIMPLE_ACTIONS,
  SIMPLE_TRIGGERS,
  type SimpleAction,
  type SimpleActionKind,
  type SimpleAutomation,
  type SimpleTrigger,
  type SimpleTriggerKind,
} from '../lib/simple-automations';
import { SimpleModal } from './simple-modal';

const selectClass =
  'h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary';

function Choice({
  selected,
  label,
  onSelect,
  children,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <li
      className={cn(
        'rounded-xl border-2 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border-default hover:bg-bg-hover',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span
          className={cn(
            'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2',
            selected ? 'border-primary' : 'border-border-strong',
          )}
        >
          {selected ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
        </span>
        <span className="text-sm font-semibold text-tx-primary">{label}</span>
      </button>
      {selected && children ? <div className="grid gap-3 px-3.5 pb-3.5">{children}</div> : null}
    </li>
  );
}

/**
 * Automações do processo no modo simplificado: à esquerda "quando", à direita "então". Cada uma
 * vira um fluxo pequeno; a lista mostra também os fluxos do processo feitos no modo avançado.
 */
export type AutomationPhaseFilter = { id: string; label: string } | null;

export function AutomationsManager({
  formId,
  onClose,
  phaseFilter,
  onPhaseFilterChange,
  editorLinks = false,
  narrow = false,
  highlightFlowId = null,
  onOpenFlow,
  onCreateFlow,
  hideHeader = false,
}: {
  formId: string;
  /** Mostra o X no cabeçalho. */
  onClose?: () => void;
  /** Só as automações que tocam esta fase (id salvo); "Ver todas" chama onPhaseFilterChange(null). */
  phaseFilter: AutomationPhaseFilter;
  onPhaseFilterChange: (filter: AutomationPhaseFilter) => void;
  /** Link "Abrir no editor" de fluxos em cada uma (modo avançado). */
  editorLinks?: boolean;
  /** Coluna estreita (lateral do mapa): "quando" e "então" um embaixo do outro. */
  narrow?: boolean;
  /** Automação em destaque (ex.: a seta clicada no mapa). */
  highlightFlowId?: string | null;
  /** Abre a automação no editor de fluxo ali mesmo (mapa de processos), em vez do link. */
  onOpenFlow?: (flowId: string) => void;
  /** "Nova com nós": abre o editor de fluxo vazio, já preso ao processo. */
  onCreateFlow?: () => void;
  /** Quem hospeda já tem cabeçalho (abas da lateral do mapa): só aparece no "Nova automação". */
  hideHeader?: boolean;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('flows.manage', formId);
  const filter = phaseFilter;
  const setFilter = onPhaseFilterChange;
  const { showToast } = useToast();
  const highlightRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightFlowId]);
  const flows = useQuery({
    queryKey: queryKeys.flows.byForm(formId),
    queryFn: () => fetchFlows(formId),
  });
  const phasesQuery = useKanbanPhasesQuery(formId);
  const users = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => fetchAssignableUsers(),
    staleTime: 5 * 60_000,
  });

  const phases = useMemo(
    () => [...(phasesQuery.data ?? [])].sort((a, b) => a.order - b.order),
    [phasesQuery.data],
  );
  const names = useMemo(
    () => ({
      phaseName: (id: string) => phases.find((phase) => phase.id === id)?.label ?? 'etapa apagada',
      userName: (id: string) => users.data?.find((user) => user.id === id)?.fullName ?? 'alguém',
    }),
    [phases, users.data],
  );

  const [creating, setCreating] = useState(false);
  const [triggerKind, setTriggerKind] = useState<SimpleTriggerKind | null>(null);
  const [triggerPhaseId, setTriggerPhaseId] = useState('');
  const [actionKind, setActionKind] = useState<SimpleActionKind | null>(null);
  const [actionPhaseId, setActionPhaseId] = useState('');
  const [actionUserId, setActionUserId] = useState('');
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [messageTouched, setMessageTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trigger: SimpleTrigger | null = !triggerKind
    ? null
    : triggerKind === 'phase_entered'
      ? { kind: 'phase_entered', phaseId: triggerPhaseId }
      : { kind: triggerKind };
  const action: SimpleAction | null = !actionKind
    ? null
    : actionKind === 'email_requester'
      ? { kind: 'email_requester', message }
      : actionKind === 'notify_users'
        ? { kind: 'notify_users', userIds: notifyUserIds, message }
        : actionKind === 'move_phase'
          ? { kind: 'move_phase', phaseId: actionPhaseId }
          : { kind: 'assign', userId: actionUserId };

  // Mensagem sugerida acompanha o gatilho até a pessoa mexer nela.
  const suggestedMessage = trigger ? defaultMessage(trigger, names) : '';
  const shownMessage = messageTouched ? message : suggestedMessage;
  const actionWithMessage: SimpleAction | null =
    action && (action.kind === 'email_requester' || action.kind === 'notify_users')
      ? { ...action, message: shownMessage }
      : action;

  function resetForm() {
    setCreating(false);
    setTriggerKind(null);
    setTriggerPhaseId('');
    setActionKind(null);
    setActionPhaseId('');
    setActionUserId('');
    setNotifyUserIds([]);
    setMessage('');
    setMessageTouched(false);
    setError(null);
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.flows.byForm(formId) });
  const onFail = () =>
    showToast({
      title: 'Não deu certo',
      description: 'Tente de novo em instantes.',
      variant: 'error',
    });

  const createMutation = useMutation({
    mutationFn: (automation: SimpleAutomation) =>
      createFlowForForm(formId, buildAutomationFlow(formId, automation, names)),
    onSuccess: () => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.flows.all() });
      showToast({
        title: 'Automação criada',
        description: 'Ela já está ligada.',
        variant: 'success',
      });
      resetForm();
    },
    onError: onFail,
  });
  const toggleMutation = useMutation({
    mutationFn: toggleFlowActive,
    onSuccess: () => void refresh(),
    onError: onFail,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteFlow,
    onSuccess: () => void refresh(),
    onError: onFail,
  });

  function save() {
    const issue = automationIssue({ trigger, action: actionWithMessage });
    if (issue || !trigger || !actionWithMessage) {
      setError(issue);
      return;
    }
    setError(null);
    createMutation.mutate({ trigger, action: actionWithMessage });
  }

  const workPhases = phases.filter((phase) => !phase.isTerminal);
  const list = useMemo(() => {
    const all = flows.data ?? [];
    if (!filter) return all;
    const mapPhases = phases.map((phase) => ({
      id: phase.id,
      requiresApproval: phase.requiresApproval,
    }));
    return all.filter((flow) => flowPhaseIds(flow, mapPhases).includes(filter.id));
  }, [flows.data, filter, phases]);

  const pad = narrow ? 'px-4' : 'px-6';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header
        className={cn(
          'flex shrink-0 items-start gap-3 border-b border-border-default py-4',
          pad,
          hideHeader && !creating && 'hidden',
        )}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary dark:text-blue-300">
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn('font-bold text-tx-primary', narrow ? 'text-base' : 'text-xl')}>
            {creating ? 'Nova automação' : 'Automações'}
          </h2>
          <p className="mt-0.5 text-xs text-tx-secondary">
            Quando algo acontecer no processo, o sistema faz uma tarefa sozinho.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-tx-secondary hover:bg-bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </header>

      <div className={cn('min-h-0 flex-1 overflow-y-auto py-4', pad)}>
        {creating ? (
          <div
            className={cn('grid gap-4', !narrow && 'md:grid-cols-[1fr_auto_1fr] md:items-start')}
          >
            <section>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-tx-secondary">
                Quando…
              </h3>
              <ul className="grid gap-2" role="radiogroup" aria-label="Quando">
                {SIMPLE_TRIGGERS.map((option) => (
                  <Choice
                    key={option.kind}
                    label={option.label}
                    selected={triggerKind === option.kind}
                    onSelect={() => setTriggerKind(option.kind)}
                  >
                    {option.kind === 'phase_entered' ? (
                      <select
                        aria-label="Etapa"
                        value={triggerPhaseId}
                        onChange={(event) => setTriggerPhaseId(event.target.value)}
                        className={selectClass}
                      >
                        <option value="">Escolha a etapa</option>
                        {phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </Choice>
                ))}
              </ul>
            </section>

            <div className={narrow ? 'flex justify-center' : 'hidden pt-11 md:block'}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white">
                {narrow ? <ArrowDown className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
              </span>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-tx-secondary">
                Então…
              </h3>
              <ul className="grid gap-2" role="radiogroup" aria-label="Então">
                {SIMPLE_ACTIONS.map((option) => (
                  <Choice
                    key={option.kind}
                    label={option.label}
                    selected={actionKind === option.kind}
                    onSelect={() => setActionKind(option.kind)}
                  >
                    {option.kind === 'notify_users' ? (
                      <FormAssigneesPicker
                        users={users.data ?? []}
                        loading={users.isLoading}
                        selectedIds={notifyUserIds}
                        onChange={setNotifyUserIds}
                      />
                    ) : null}
                    {option.kind === 'email_requester' || option.kind === 'notify_users' ? (
                      <label className="grid gap-1.5 text-sm font-bold text-tx-primary">
                        Mensagem
                        <textarea
                          rows={3}
                          value={shownMessage}
                          onChange={(event) => {
                            setMessageTouched(true);
                            setMessage(event.target.value);
                          }}
                          className="resize-none rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-tx-primary outline-none focus:border-primary"
                        />
                      </label>
                    ) : null}
                    {option.kind === 'move_phase' ? (
                      <select
                        aria-label="Etapa de destino"
                        value={actionPhaseId}
                        onChange={(event) => setActionPhaseId(event.target.value)}
                        className={selectClass}
                      >
                        <option value="">Escolha a etapa</option>
                        {phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {option.kind === 'assign' ? (
                      <select
                        aria-label="Responsável"
                        value={actionUserId}
                        onChange={(event) => setActionUserId(event.target.value)}
                        className={selectClass}
                      >
                        <option value="">Escolha a pessoa</option>
                        {(users.data ?? []).map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullName}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </Choice>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <>
            {filter ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg-s2 px-3.5 py-2.5 text-sm text-tx-secondary">
                <span>
                  Só as automações de <strong className="text-tx-primary">{filter.label}</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="font-bold text-primary hover:underline dark:text-blue-300"
                >
                  Ver todas
                </button>
              </div>
            ) : null}
            {flows.isLoading ? <p className="text-sm text-tx-secondary">Carregando…</p> : null}
            {!flows.isLoading && list.length === 0 ? (
              <div className="grid justify-items-center gap-2 py-8 text-center">
                <Zap className="h-10 w-10 text-tx-muted" />
                <p className="text-base font-semibold text-tx-primary">
                  {filter ? 'Nenhuma automação nesta etapa' : 'Nenhuma automação ainda'}
                </p>
                <p className="text-sm text-tx-secondary">
                  Ex.: quando o pedido for aprovado, mover para{' '}
                  {workPhases[1]?.label ?? 'a próxima etapa'}.
                </p>
              </div>
            ) : null}
            <ul className="grid gap-2">
              {list.map((flow) => {
                const parsed = parseSimpleAutomation(flow);
                return (
                  <li
                    key={flow.id}
                    ref={flow.id === highlightFlowId ? highlightRef : undefined}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
                      flow.id === highlightFlowId
                        ? 'border-[#3B82F6] ring-2 ring-[#3B82F6]/30'
                        : 'border-border-default',
                      narrow && 'justify-end gap-2 px-3',
                      !flow.isActive && 'opacity-60',
                    )}
                  >
                    <div
                      className={cn(
                        'flex min-w-0 flex-1 gap-2 text-sm',
                        // Coluna estreita: "quando ↓ então" ocupa a linha; os controles descem.
                        narrow ? 'basis-full flex-col items-start' : 'flex-wrap items-center',
                      )}
                    >
                      {parsed ? (
                        <>
                          <span className="rounded-lg bg-bg-s2 px-2.5 py-1 font-semibold text-tx-primary">
                            {describeTrigger(parsed.trigger, names)}
                          </span>
                          {narrow ? (
                            <ArrowDown className="ml-3 h-4 w-4 shrink-0 text-tx-muted" />
                          ) : (
                            <ArrowRight className="h-4 w-4 shrink-0 text-tx-muted" />
                          )}
                          <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-semibold text-primary dark:text-blue-300">
                            {describeAction(parsed.action, names)}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-tx-primary">
                          {flow.name}{' '}
                          <span className="font-normal text-tx-secondary">
                            · feita no modo avançado
                          </span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={flow.isActive}
                      aria-label={flow.isActive ? 'Desligar automação' : 'Ligar automação'}
                      disabled={!canManage}
                      onClick={() => toggleMutation.mutate(flow.id)}
                      className={cn(
                        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                        flow.isActive ? 'bg-primary' : 'bg-bg-hover',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                          flow.isActive ? 'translate-x-5' : 'translate-x-0',
                        )}
                      />
                    </button>
                    {onOpenFlow ? (
                      <button
                        type="button"
                        onClick={() => onOpenFlow(flow.id)}
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
                      >
                        <Workflow className="h-3.5 w-3.5" /> Editar nós
                      </button>
                    ) : editorLinks ? (
                      <Link
                        to={`/flows/${flow.id}`}
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
                      >
                        Abrir no editor <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                    {parsed && canManage ? (
                      <button
                        type="button"
                        aria-label="Apagar automação"
                        onClick={() => {
                          if (window.confirm('Apagar esta automação?'))
                            deleteMutation.mutate(flow.id);
                        }}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-tx-secondary hover:bg-bg-hover hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {canManage ? (
              <div className={cn('mt-4 grid gap-2', onCreateFlow && !narrow && 'sm:grid-cols-2')}>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong text-base font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
                >
                  <Plus className="h-5 w-5" />
                  Nova automação
                </button>
                {onCreateFlow ? (
                  <button
                    type="button"
                    onClick={onCreateFlow}
                    title="Monta a automação com os nós do editor de fluxos"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong text-sm font-bold text-tx-secondary hover:bg-bg-hover hover:text-tx-primary"
                  >
                    <Workflow className="h-5 w-5" />
                    Nova com nós (editor de fluxo)
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {creating ? (
        <footer
          className={cn(
            'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-default py-3',
            pad,
          )}
        >
          {error ? (
            <p
              role="alert"
              className="mr-auto w-full text-sm font-semibold text-red-600 dark:text-red-400 sm:w-auto"
            >
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={resetForm}
            className="h-11 rounded-xl px-4 text-sm font-bold text-tx-primary hover:bg-bg-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={createMutation.isPending}
            className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {createMutation.isPending ? 'Criando…' : 'Criar automação'}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

/** As automações numa janela por cima da tela (kanban do modo simplificado). */
export function SimpleAutomationsPanel({
  formId,
  onClose,
  phaseFilter = null,
  editorLinks = false,
}: {
  formId: string;
  onClose: () => void;
  phaseFilter?: AutomationPhaseFilter;
  editorLinks?: boolean;
}) {
  const [filter, setFilter] = useState<AutomationPhaseFilter>(phaseFilter);
  return (
    <SimpleModal title="Automações" onClose={onClose} widthClass="max-w-4xl" bare>
      <AutomationsManager
        formId={formId}
        onClose={onClose}
        phaseFilter={filter}
        onPhaseFilterChange={setFilter}
        editorLinks={editorLinks}
      />
    </SimpleModal>
  );
}
