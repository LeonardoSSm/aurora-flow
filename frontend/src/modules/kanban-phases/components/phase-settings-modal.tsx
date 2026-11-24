import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ExternalLink,
  ListChecks,
  Maximize2,
  Loader2,
  Plus,
  Settings2,
  ShieldCheck,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { fetchFlows } from '../../flows/services/flows-api';
import { phaseAutomations } from '../lib/phase-automations';
import { answerFields, draftSaveIssue, newDraftField } from '../lib/phase-draft';
import { PHASE_COLOR_PALETTE, phaseColorHex, type DraftKanbanPhase } from '../types';
import { PhaseFieldRow } from './phase-field-row';
import { ApproversField } from '../../approvals/components/approvers-field';
import { PhaseSlaEditor } from './phase-sla-editor';
import { PhaseApprovalAutomationEditor } from './phase-approval-automation-editor';
import { PhaseAssigneeExitToggle, PhaseNoReturnToggle, PhaseRequiredExitToggle } from './phase-required-exit-toggle';
import { isPhaseLayoutType } from '../lib/phase-field-types';
import type { FormulaAvailableField } from '../../builder/components/formula-editor';
import { PhaseVisibilityEditor } from './phase-visibility-editor';
import { PhasePeoplePicker, usePhaseUserOptions } from './people-multi-select';
import { NO_PEOPLE, peopleCount, peopleSummary } from '../lib/phase-people';
import { visibilitySummary } from '../lib/phase-visibility';

type TabId = 'geral' | 'acesso' | 'campos' | 'automacoes';

const TABS: Array<{ id: TabId; label: string; icon: typeof Settings2 }> = [
  { id: 'geral', label: 'Geral', icon: Settings2 },
  { id: 'acesso', label: 'Acesso e aprovação', icon: ShieldCheck },
  { id: 'campos', label: 'Formulário', icon: ListChecks },
  { id: 'automacoes', label: 'Integrações e automações', icon: Workflow },
];

const inputCls =
  'h-9 w-full min-w-0 rounded-[8px] border border-border-default bg-bg-s2 px-2.5 text-sm text-tx-primary outline-none focus:border-primary';
const labelCls = 'text-[11px] font-bold uppercase tracking-wide text-tx-secondary';

export function SummaryChip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' | 'ok' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'neutral' && 'bg-bg-s2 text-tx-secondary',
        tone === 'warn' && 'bg-amber-100 text-amber-800',
        tone === 'ok' && 'bg-green-100 text-green-700',
      )}
    >
      {children}
    </span>
  );
}

export type PhaseSettingsTab = TabId;

/**
 * Configuração de UMA fase, aberta pela engrenagem do card no editor de fases do formulário.
 * Edita uma cópia da fase e devolve o resultado em `onApply` — quem grava é o "Salvar fases" do
 * editor, junto com o resto do rascunho. Mostra, só para leitura, os fluxos que reagem à fase.
 */
export function PhaseSettingsModal({
  formId,
  phase: initialPhase,
  position,
  total,
  roleOptions,
  initialTab = 'geral',
  onApply,
  onClose,
  formulaFields = [],
  formSlot,
  onExpandForm,
  integrationsSlot,
  applyHint = 'Grava junto com as outras fases em “Salvar fases”.',
}: {
  formId: string;
  /** Conteúdo extra no topo da aba "Formulário" (ex.: o formulário de abertura da 1ª fase). */
  formSlot?: ReactNode;
  /**
   * Abre o formulário desta fase no mapa do processo. O modal aplica o que foi editado antes de
   * chamar, para o mapa já mostrar os campos como estão aqui.
   */
  onExpandForm?: () => void;
  /** Conteúdo extra no topo da aba "Integrações e automações". */
  integrationsSlot?: ReactNode;
  /** Texto do rodapé dizendo quando a fase é gravada. */
  applyHint?: string;
  /** Campos do formulário e das OUTRAS fases, para o editor de "Cálculo". */
  formulaFields?: FormulaAvailableField[];
  phase: DraftKanbanPhase;
  /** Posição da fase no board (1-based), só para exibição. */
  position: number;
  total: number;
  roleOptions: ReadonlyArray<{ code: string; name: string }>;
  initialTab?: PhaseSettingsTab;
  onApply: (next: DraftKanbanPhase) => void;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const { showToast } = useToast();
  const canViewFlows = can('flows.view', formId);
  // Fase nova (sem id do servidor) ainda não pode ser alvo de nenhum fluxo.
  const serverPhaseId = initialPhase.serverId;
  const flowsQuery = useQuery({
    queryKey: queryKeys.flows.byForm(formId),
    queryFn: () => fetchFlows(formId),
    enabled: canViewFlows && !!serverPhaseId,
    staleTime: 30_000,
  });

  const [tab, setTab] = useState<TabId>(initialTab);
  const [phase, setPhase] = useState<DraftKanbanPhase>(initialPhase);
  const [dirty, setDirty] = useState(false);
  // Um campo aberto por vez na aba "Campos"; os outros mostram só o resumo.
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Com alteração não salva, só fecha pelo botão: Esc/clique fora não descartam a edição.
      if (event.key === 'Escape' && !dirty) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, dirty]);

  const automations = useMemo(
    () => (serverPhaseId ? phaseAutomations(flowsQuery.data ?? [], serverPhaseId) : []),
    [flowsQuery.data, serverPhaseId],
  );
  // Os campos desta fase entram como estão no rascunho (inclusive os que acabaram de ser criados).
  const phaseFormulaFields = useMemo<FormulaAvailableField[]>(
    () => [
      ...formulaFields,
      ...phase.fields
        .filter((field) => !isPhaseLayoutType(field.fieldType) && field.code)
        .map((field) => ({ code: field.code, label: field.label || field.code, fieldType: field.fieldType })),
    ],
    [formulaFields, phase.fields],
  );

  // Opções da janela "Escolher aprovadores" (usuários só buscados quando a fase exige aprovação).
  const approverRoleOptions = useMemo(
    () => roleOptions.map((role) => ({ value: role.code, label: role.name })),
    [roleOptions],
  );
  const approverUsers = usePhaseUserOptions(roleOptions, phase.requiresApproval);

  function update(next: DraftKanbanPhase) {
    setPhase(next);
    setDirty(true);
  }

  function handleApply() {
    const issue = draftSaveIssue([phase]);
    if (issue) {
      showToast({ title: 'Revise a fase', description: issue, variant: 'error' });
      return;
    }
    onApply(phase);
    onClose();
  }

  function handleExpandForm() {
    if (!onExpandForm) return;
    if (dirty) {
      const issue = draftSaveIssue([phase]);
      if (issue) {
        showToast({ title: 'Revise a fase', description: issue, variant: 'error' });
        return;
      }
      onApply(phase);
    }
    onExpandForm();
  }

  /**
   * Todas as abas ficam montadas na mesma célula do grid (as inativas, invisíveis): o modal tem a
   * altura da maior aba e não muda de tamanho ao trocar de aba — só cresce quando o conteúdo cresce
   * (ex.: mais campos), até o teto de 90% da tela. Cada aba rola sozinha: a aba curta não herda a
   * rolagem da comprida.
   */
  const panelProps = (id: TabId) => ({
    role: 'tabpanel' as const,
    'aria-hidden': tab !== id,
    'aria-label': TABS.find((t) => t.id === id)?.label,
  });

  const answers = answerFields(phase.fields);
  const requiredCount = answers.filter((field) => field.required).length;
  const actorsLabel = peopleSummary(phase.actors, roleOptions, 'qualquer perfil com acesso');
  const approversLabel = peopleSummary(phase.approvers, roleOptions, 'ninguém escolhido');

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
        aria-labelledby="phase-settings-title"
        className="flex max-h-[90dvh] w-full max-w-[960px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header
          className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4"
          style={{ borderTop: `4px solid ${phaseColorHex(phase.color)}` }}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">
              {`Configurar fase · ${position} de ${total}`}
            </p>
            <h3 id="phase-settings-title" className="break-words text-lg font-bold leading-snug text-tx-primary">
              {phase.label || 'Nova fase'}
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <SummaryChip>
                  {answers.length} {answers.length === 1 ? 'campo' : 'campos'}
                  {requiredCount > 0 ? ` · ${requiredCount} obrigatório${requiredCount === 1 ? '' : 's'}` : ''}
                </SummaryChip>
                <SummaryChip tone={phase.restrictVisibility ? 'warn' : 'neutral'}>
                  Visível: {visibilitySummary(phase.restrictVisibility, phase.visibleTo, roleOptions)}
                </SummaryChip>
                <SummaryChip>Atua: {actorsLabel}</SummaryChip>
                {phase.requiresApproval ? (
                  <SummaryChip tone="warn">Aprovação: {approversLabel}</SummaryChip>
                ) : null}
                {phase.requireFieldsToExit ? (
                  <SummaryChip tone="warn">Só avança preenchida</SummaryChip>
                ) : null}
                {phase.requireAssigneeToExit ? (
                  <SummaryChip tone="warn">Só avança com responsável</SummaryChip>
                ) : null}
                {phase.blockMoveBack ? <SummaryChip tone="warn">Ponto sem volta</SummaryChip> : null}
                {phase.isTerminal ? <SummaryChip tone="ok">Fase final</SummaryChip> : null}
                {canViewFlows && serverPhaseId ? (
                  <SummaryChip>
                    {automations.length} {automations.length === 1 ? 'automação' : 'automações'}
                  </SummaryChip>
                ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-bg-hover sm:h-9 sm:w-9"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

          <div className="flex min-h-[min(520px,60dvh)] flex-1 flex-col sm:flex-row">
            <nav
              aria-label="Seções da configuração"
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-default px-3 py-2 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r sm:px-2 sm:py-3"
            >
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-xs font-bold transition-colors',
                    tab === id
                      ? 'bg-primary/10 text-primary dark:bg-blue-900/40 dark:text-blue-300'
                      : 'text-tx-secondary hover:bg-bg-hover hover:text-tx-primary',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>

            <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden">
                <div
                  {...panelProps('geral')}
                  className={cn('grid gap-4 min-h-0 min-w-0 content-start overflow-y-auto px-5 py-5 [grid-area:1/1]', tab !== 'geral' && 'invisible')}
                >
                  <div className="grid gap-1">
                    <label htmlFor="phase-label" className={labelCls}>
                      Nome da fase
                    </label>
                    <input
                      id="phase-label"
                      value={phase.label}
                      onChange={(e) => update({ ...phase, label: e.target.value })}
                      className={cn(inputCls, 'font-bold')}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className={labelCls}>Cor</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {PHASE_COLOR_PALETTE.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => update({ ...phase, color: c.value })}
                          aria-label={c.label}
                          aria-pressed={phase.color === c.value}
                          className={cn(
                            'h-6 w-6 rounded-full border-2',
                            phase.color === c.value ? 'border-tx-primary' : 'border-transparent',
                          )}
                          style={{ background: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="phase-description" className={labelCls}>
                      Legenda
                    </label>
                    <textarea
                      id="phase-description"
                      value={phase.description}
                      onChange={(e) => update({ ...phase, description: e.target.value })}
                      rows={3}
                      placeholder="O que acontece nesta etapa (opcional)"
                      className="w-full min-w-0 resize-none rounded-[8px] border border-border-default bg-bg-s2 px-2.5 py-1.5 text-sm text-tx-secondary outline-none focus:border-primary"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm text-tx-primary">
                    <input
                      type="checkbox"
                      checked={phase.isTerminal}
                      onChange={(e) => update({ ...phase, isTerminal: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-border-default"
                    />
                    <span>
                      <span className="font-semibold">Fase final</span>
                      <span className="block text-xs text-tx-secondary">
                        Cards aqui não contam como solicitações ativas.
                      </span>
                    </span>
                  </label>
                  <PhaseSlaEditor
                    value={phase}
                    isTerminal={phase.isTerminal}
                    onChange={(sla) => update({ ...phase, ...sla })}
                  />
                </div>

                <div
                  {...panelProps('acesso')}
                  className={cn('grid gap-5 min-h-0 min-w-0 content-start overflow-y-auto px-5 py-5 [grid-area:1/1]', tab !== 'acesso' && 'invisible')}
                >
                  <PhaseVisibilityEditor
                    restrict={phase.restrictVisibility}
                    visibleTo={phase.visibleTo}
                    roleOptions={roleOptions}
                    onChange={(next) => update({ ...phase, ...next })}
                  />
                  <hr className="border-border-default" />
                  <div className="grid gap-2">
                    <div>
                      <p className={labelCls}>Quem atua nesta fase</p>
                      <p className="text-xs text-tx-secondary">
                        {peopleCount(phase.actors) > 0
                          ? 'Só os perfis e usuários escolhidos preenchem os campos e pedem aprovação nesta fase — basta ser um deles (quem gerencia todas as solicitações também pode).'
                          : 'Ninguém escolhido: qualquer pessoa com acesso à solicitação preenche os campos desta fase.'}
                      </p>
                    </div>
                    <PhasePeoplePicker
                      label="Quem atua nesta fase"
                      value={phase.actors}
                      onChange={(actors) => update({ ...phase, actors })}
                      roleOptions={roleOptions}
                    />
                    <p className="text-[11px] text-tx-muted">
                      O perfil de quem atua precisa poder gerenciar solicitações (Administração → Perfis).
                    </p>
                  </div>

                  <PhaseAssigneeExitToggle
                    checked={phase.requireAssigneeToExit}
                    onChange={(requireAssigneeToExit) => update({ ...phase, requireAssigneeToExit })}
                  />

                  <PhaseNoReturnToggle
                    checked={phase.blockMoveBack}
                    rejectedStays={phase.requiresApproval && phase.approvalOnRejected === 'stay'}
                    onChange={(blockMoveBack) => update({ ...phase, blockMoveBack })}
                  />

                  <div className="grid gap-2 rounded-[10px] border border-border-default p-3">
                    <label className="flex items-start gap-2 text-sm text-tx-primary">
                      <input
                        type="checkbox"
                        checked={phase.requiresApproval}
                        onChange={(e) =>
                          update({
                            ...phase,
                            requiresApproval: e.target.checked,
                            approvers: e.target.checked ? phase.approvers : { ...NO_PEOPLE },
                          })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-border-default"
                      />
                      <span>
                        <span className="font-semibold">Exige aprovação para avançar</span>
                        <span className="block text-xs text-tx-secondary">
                          O card só sai desta fase depois de uma aprovação aprovada.
                        </span>
                      </span>
                    </label>
                    {phase.requiresApproval ? (
                      <div className="grid gap-2 pl-6">
                        <div>
                          <p className={labelCls}>Quem aprova</p>
                          <p className="text-xs text-tx-secondary">
                            A aprovação vai para os escolhidos, pela regra abaixo. Um perfil conta como um
                            aprovador (basta uma pessoa dele). O perfil de quem aprova precisa ter a
                            permissão de decidir aprovações.
                          </p>
                        </div>
                        <ApproversField
                          value={phase.approvers}
                          onChange={(approvers) => update({ ...phase, approvers })}
                          rule={phase.approvalMode}
                          onRuleChange={(approvalMode) => update({ ...phase, approvalMode })}
                          roleOptions={approverRoleOptions}
                          userOptions={approverUsers.options}
                          usersLoading={approverUsers.isLoading}
                        />
                        {peopleCount(phase.approvers) === 0 ? (
                          <p role="alert" className="text-xs font-semibold text-[#ef4444]">
                            Escolha pelo menos um perfil ou usuário para aprovar.
                          </p>
                        ) : null}
                        <hr className="my-1 border-border-default" />
                        <PhaseApprovalAutomationEditor
                          value={phase}
                          isFirst={position === 1}
                          hasNext={position < total}
                          onChange={(next) => update({ ...phase, ...next })}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  {...panelProps('campos')}
                  className={cn('grid gap-3 min-h-0 min-w-0 content-start overflow-y-auto px-5 py-5 [grid-area:1/1]', tab !== 'campos' && 'invisible')}
                >
                  {formSlot}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-xs text-tx-secondary">
                      {formSlot ? (
                        <strong className="mb-1 block text-tx-primary">Campos de quem atua na fase</strong>
                      ) : null}
                      Preenchidos no card quando ele está nesta fase. Os valores ficam gravados na
                      solicitação e os fluxos enxergam cada um pelo código: como variável{' '}
                      <code>{'{{codigo}}'}</code> e nas condições.
                    </p>
                    {onExpandForm && !formSlot ? (
                      <button
                        type="button"
                        onClick={handleExpandForm}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border-strong px-3 py-1.5 text-xs font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        Expandir no mapa
                      </button>
                    ) : null}
                  </div>
                  <PhaseRequiredExitToggle
                    checked={phase.requireFieldsToExit}
                    requiredCount={requiredCount}
                    onChange={(requireFieldsToExit) => update({ ...phase, requireFieldsToExit })}
                  />
                  {phase.fields.length === 0 ? (
                    <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-6 text-center text-sm text-tx-muted">
                      Nenhum campo nesta fase.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {phase.fields.map((field, fieldIndex) => (
                        <PhaseFieldRow
                          key={field.id}
                          field={field}
                          formulaFields={phaseFormulaFields}
                          index={fieldIndex}
                          total={phase.fields.length}
                          expanded={expandedFieldId === field.id}
                          onToggle={() =>
                            setExpandedFieldId((current) => (current === field.id ? null : field.id))
                          }
                          onChange={(next) =>
                            update({ ...phase, fields: phase.fields.map((f) => (f.id === field.id ? next : f)) })
                          }
                          onRemove={() =>
                            update({ ...phase, fields: phase.fields.filter((f) => f.id !== field.id) })
                          }
                          onMove={(delta) => {
                            const target = fieldIndex + delta;
                            if (target < 0 || target >= phase.fields.length) return;
                            const fields = [...phase.fields];
                            [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
                            update({ ...phase, fields });
                          }}
                        />
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const field = newDraftField(phase.fields.length + 1);
                      update({ ...phase, fields: [...phase.fields, field] });
                      setExpandedFieldId(field.id);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong py-2 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar campo
                  </button>
                </div>

                <div
                  {...panelProps('automacoes')}
                  className={cn('grid gap-3 min-h-0 min-w-0 content-start overflow-y-auto px-5 py-5 [grid-area:1/1]', tab !== 'automacoes' && 'invisible')}
                >
                  {integrationsSlot}
                  <p className="text-xs text-tx-secondary">
                    Fluxos deste processo que reagem a esta fase. Para mudar o que acontece, abra o fluxo.
                  </p>
                  {!canViewFlows ? (
                    <p className="text-sm text-tx-muted">Seu perfil não tem acesso aos fluxos.</p>
                  ) : !serverPhaseId ? (
                    <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-6 text-center text-sm text-tx-muted">
                      Fase nova: salve as fases para poder usá-la num fluxo.
                    </p>
                  ) : flowsQuery.isLoading ? (
                    <p className="flex items-center gap-2 text-sm text-tx-secondary">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando fluxos...
                    </p>
                  ) : flowsQuery.isError ? (
                    <p role="alert" className="text-sm text-[#ef4444]">
                      Não foi possível carregar os fluxos.
                    </p>
                  ) : automations.length === 0 ? (
                    <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-6 text-center text-sm text-tx-muted">
                      Nenhum fluxo reage a esta fase. Use o gatilho “Campos de fase salvos” ou o nó
                      “Mover para fase” num fluxo deste processo.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {automations.map((automation) => (
                        <li
                          key={automation.flowId}
                          className="flex items-start justify-between gap-3 rounded-[10px] border border-border-default p-3"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-tx-primary">
                              <span className="min-w-0 break-words">{automation.flowName}</span>
                              {automation.isActive ? (
                                <SummaryChip tone="ok">
                                  <CheckCircle2 className="h-3 w-3" /> Ativo
                                </SummaryChip>
                              ) : (
                                <SummaryChip>Inativo</SummaryChip>
                              )}
                            </p>
                            <ul className="mt-1 grid gap-0.5">
                              {automation.roles.map((role) => (
                                <li key={role} className="text-xs text-tx-secondary">
                                  {role}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <Link
                            to={`/flows/${automation.flowId}`}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline dark:text-blue-300"
                          >
                            Abrir <ExternalLink className="h-3 w-3" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
            </div>
          </div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border-default px-5 py-4">
          <p className="mr-auto text-[11px] text-tx-muted">
            {applyHint}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover sm:h-10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!dirty}
            className="h-11 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60 sm:h-10"
          >
            Aplicar
          </button>
        </footer>
      </section>
    </div>
  );
}
