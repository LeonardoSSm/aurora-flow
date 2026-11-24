import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Columns3, GripVertical, Plus, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { usePhasesDraft } from '../hooks/use-phases-draft';
import { answerFields } from '../lib/phase-draft';
import { isPhaseLayoutType, phaseFieldTypeDef } from '../lib/phase-field-types';
import { visibilitySummary } from '../lib/phase-visibility';
import { describePhaseSla } from '../lib/phase-sla';
import { peopleSummary } from '../lib/phase-people';
import { PhaseSettingsModal, SummaryChip, type PhaseSettingsTab } from './phase-settings-modal';
import { KanbanCardValueSetting } from './kanban-card-value-setting';
import { phaseColorHex, type DraftKanbanPhase } from '../types';

/**
 * Card de uma fase no editor: ordem (arrastar), nome e um resumo do que está configurado. Todo o
 * resto — cor, legenda, quem atua, aprovação e campos — fica no modal da engrenagem.
 */
function PhaseCard({
  phase,
  onChange,
  onRemove,
  onConfigure,
  canRemove,
  roleOptions,
}: {
  phase: DraftKanbanPhase;
  onChange: (next: DraftKanbanPhase) => void;
  onRemove: () => void;
  onConfigure: (tab?: PhaseSettingsTab) => void;
  canRemove: boolean;
  roleOptions: { code: string; name: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: phase.id,
  });
  const answers = answerFields(phase.fields);
  const requiredCount = answers.filter((field) => field.required).length;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        borderTop: `4px solid ${phaseColorHex(phase.color)}`,
      }}
      className="flex w-full shrink-0 flex-col gap-3 self-start rounded-[12px] border border-border-strong bg-bg-surface p-3.5 shadow-sm sm:w-72"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="grid h-7 w-6 shrink-0 cursor-grab place-items-center text-tx-muted active:cursor-grabbing"
          aria-label="Reordenar fase"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <input
          value={phase.label}
          onChange={(e) => onChange({ ...phase, label: e.target.value })}
          placeholder="Nome da fase"
          aria-label="Nome da fase"
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1.5 text-sm font-bold text-tx-primary outline-none hover:border-border-default focus:border-primary"
        />
        <button
          type="button"
          onClick={() => onConfigure()}
          title="Configurar fase"
          aria-label={`Configurar fase ${phase.label || 'sem nome'}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-bg-hover hover:text-tx-primary"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Remover fase"
          title={canRemove ? undefined : 'O Kanban precisa de pelo menos uma fase'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {phase.description ? (
        <p className="line-clamp-2 text-xs text-tx-secondary">{phase.description}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <SummaryChip tone={phase.restrictVisibility ? 'warn' : 'neutral'}>
          Visível: {visibilitySummary(phase.restrictVisibility, phase.visibleTo, roleOptions)}
        </SummaryChip>
        <SummaryChip>Atua: {peopleSummary(phase.actors, roleOptions, 'qualquer perfil')}</SummaryChip>
        {phase.requiresApproval ? (
          <SummaryChip tone="warn">
            Aprovação{phase.approvalMode === 'all' ? ' (todos)' : phase.approvalMode === 'sequential' ? ' (em ordem)' : ''}:{' '}
            {peopleSummary(phase.approvers, roleOptions, 'ninguém escolhido')}
          </SummaryChip>
        ) : null}
        {phase.isTerminal ? <SummaryChip tone="ok">Fase final</SummaryChip> : null}
        {!phase.isTerminal && phase.slaHours ? (
          <SummaryChip>Prazo: {describePhaseSla(phase.slaHours, phase.slaBusinessHours)}</SummaryChip>
        ) : null}
      </div>

      <div className="grid gap-1 rounded-[8px] bg-bg-s2 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
          {answers.length === 0
            ? phase.fields.length === 0
              ? 'Sem campos'
              : 'Só conteúdo, sem campos'
            : `${answers.length} ${answers.length === 1 ? 'campo' : 'campos'}${
                requiredCount > 0 ? ` · ${requiredCount} obrigatório${requiredCount === 1 ? '' : 's'}` : ''
              }`}
        </p>
        {phase.fields.length > 0 ? (
          <ul className="grid gap-0.5">
            {phase.fields.map((field) => (
              <li key={field.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
                <span
                  className={`min-w-0 truncate ${isPhaseLayoutType(field.fieldType) ? 'italic text-tx-muted' : 'text-tx-primary'}`}
                >
                  {field.label || (field.fieldType === 'divider' ? 'Divisor' : 'Campo sem nome')}
                  {field.required ? <span className="text-error"> *</span> : null}
                </span>
                <span className="shrink-0 text-[10px] text-tx-muted">
                  {phaseFieldTypeDef(field.fieldType, field.settingsJson).label}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => onConfigure('campos')}
          className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] font-bold text-primary hover:underline dark:text-blue-300"
        >
          <Plus className="h-3 w-3" />
          {phase.fields.length === 0 ? 'Adicionar campos' : 'Editar campos'}
        </button>
      </div>
    </div>
  );
}

export function KanbanPhasesEditor({ formId }: { formId: string | null }) {
  const {
    draft,
    setDraft,
    roleOptions,
    isLoading,
    hasUnsavedChanges,
    isSaving,
    formulaFieldsFor,
    addPhase: addDraftPhase,
    updatePhase,
    removePhase,
    save,
  } = usePhasesDraft(formId);
  const [configuring, setConfiguring] = useState<{ phaseId: string; tab: PhaseSettingsTab } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!formId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border-strong bg-bg-surface py-16 text-center">
        <Columns3 className="mb-3 h-8 w-8 text-tx-muted" />
        <p className="text-sm font-semibold text-tx-secondary">
          Salve o formulário primeiro para configurar as fases do Kanban.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-tx-secondary">Carregando fases...</p>;
  }

  function addPhase() {
    // Fase nova já abre a configuração completa.
    setConfiguring({ phaseId: addDraftPhase(), tab: 'geral' });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const oldIndex = current.findIndex((p) => p.id === active.id);
      const newIndex = current.findIndex((p) => p.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    await save();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-tx-primary">Fases do Kanban</h3>
          <p className="text-sm text-tx-secondary">
            Configure as etapas pelas quais as solicitações deste formulário passam no Kanban, com
            campos próprios por etapa. Todo formulário começa com Novo, Pendente e Concluído. Use a
            engrenagem de cada fase para a configuração completa.
          </p>
        </div>
        {hasUnsavedChanges ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            Alterações não salvas
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="h-10 shrink-0 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {isSaving ? 'Salvando...' : 'Salvar fases'}
        </button>
      </div>

      <KanbanCardValueSetting formId={formId} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={draft.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap items-start gap-3">
            {draft.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                onChange={(next) => updatePhase(phase.id, next)}
                onRemove={() => removePhase(phase.id)}
                onConfigure={(tab = 'geral') => setConfiguring({ phaseId: phase.id, tab })}
                canRemove={draft.length > 1}
                roleOptions={roleOptions}
              />
            ))}
            <button
              type="button"
              onClick={addPhase}
              className="grid h-12 w-full shrink-0 place-items-center gap-1 self-start rounded-[12px] border-2 border-dashed border-border-strong text-sm font-bold text-tx-secondary hover:border-primary hover:text-primary sm:w-40"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Adicionar fase
              </span>
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {configuring
        ? (() => {
            const index = draft.findIndex((p) => p.id === configuring.phaseId);
            if (index < 0) return null;
            return (
              <PhaseSettingsModal
                key={configuring.phaseId}
                formId={formId}
                phase={draft[index]}
                position={index + 1}
                total={draft.length}
                roleOptions={roleOptions}
                initialTab={configuring.tab}
                formulaFields={formulaFieldsFor(configuring.phaseId)}
                onApply={(next) => updatePhase(next.id, next)}
                onClose={() => setConfiguring(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
