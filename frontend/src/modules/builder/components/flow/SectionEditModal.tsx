import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../../components/ui';
import { useEscapeKey } from '../../../../hooks/use-escape-key';
import { usePrefersReducedMotion } from '../../../../hooks/use-reduced-motion';
import { filterFieldsByQuery, summarizeFields } from '../../lib/field-search';
import {
  BRANCH_ORPHAN_REASON_TEXT,
  branchFieldsByCode,
  branchOrphanReason,
  isNextSectionOrphaned,
} from '../../lib/section-flow-layout';
import { useAutomations } from '../../../automations/hooks/use-automations';
import type { AutomationRule } from '../../../automations/types';
import { createLocalId, createUniqueFieldCode } from '../../state/draft.helpers';
import type {
  DraftField,
  DraftFieldOption,
  DraftSection,
  DraftSectionBranch,
} from '../../types';
import type {
  FieldConditions,
  FieldSettings,
  FormFieldType,
  ProductTableColumn,
  VisibilityRule,
} from '../../../forms/types';
import { applyFieldTypeChoice, fieldTypeChoiceOf, type FieldTypeChoice } from '../../types';
import { BuilderWizardFieldRow } from '../builder-wizard-field-row';
import type { FormulaPhaseOption } from '../formula-editor';
import { scoreModeOf, sectionScoreQuestions } from '../../lib/score-fields';
import { useKanbanPhasesQuery } from '../../../kanban-phases/hooks/use-kanban-phases-query';
import { FieldTypePopover } from './FieldTypePopover';
import {
  ERP_TABLE_DEPENDENCY_TYPES,
  type ErpTableDependencyField,
  type ErpTableParameter,
  parameterFieldLabel,
} from '../erp-table-settings-editor';

const SUBMIT_VALUE = '__submit__';
const DEFAULT_VALUE = '__default__';
const ORPHAN_DEFAULT_VALUE = '__orphan__';

type FieldUpdateValue =
  | string
  | boolean
  | FormFieldType
  | FieldSettings
  | FieldConditions
  | VisibilityRule[]
  | DraftFieldOption[]
  | null;

type SectionEditModalProps = {
  section: DraftSection;
  sections: DraftSection[];
  formId: string | null;
  availableFields: Array<{
    code: string;
    label: string;
    fieldType: FormFieldType;
    productTableColumns?: ProductTableColumn[];
    options?: Array<{ internalValue: string; displayLabel: string }>;
  }>;
  /** `ERP_TABLE_ENABLED` ligado no backend: "Tabela dinâmica do ERP" pode ser adicionada. */
  erpTableEnabled?: boolean;
  onClose: () => void;
  /** Troca a seção aberta sem fechar o modal (botões anterior/próxima). */
  onSelectSection: (sectionId: string) => void;
  onUpdateSection: (key: 'title' | 'description', value: string) => void;
  onRemoveSection: () => void;
  canRemoveSection: boolean;
  /** Adiciona o campo ao fim da seção e devolve o id dele (a linha abre já expandida). */
  onAddField: (fieldType: FieldTypeChoice) => string | void;
  /** Duplica o campo logo abaixo e devolve o id da cópia. */
  onDuplicateField?: (fieldId: string) => string | void;
  onRemoveField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, key: keyof DraftField, value: FieldUpdateValue) => void;
  onMoveField: (fromIndex: number, toIndex: number) => void;
  onSetSectionFlow: (
    nextSectionId: string | null,
    nextIsSubmit: boolean,
    branches: DraftSectionBranch[],
  ) => void;
};

type SubTab = 'fields' | 'flow' | 'automations';

/** Contador/etiqueta em azul claro (Campos, Obrigatório). */
const primarySoftChip = 'bg-brand-primary-light text-primary dark:bg-primary/30 dark:text-tx-primary';

function getFieldBranchOptions(
  field: DraftField,
): Array<{ key: string; label: string; optionValue: string | null; checkboxValue: boolean | null }> {
  if (field.fieldType === 'checkbox') {
    return [
      { key: 'true', label: 'Sim', optionValue: null, checkboxValue: true },
      { key: 'false', label: 'Não', optionValue: null, checkboxValue: false },
    ];
  }
  if (field.fieldType === 'single_select' || field.fieldType === 'multi_select') {
    return field.options
      .filter((option) => option.displayLabel.trim())
      .map((option) => ({
        key: option.internalValue,
        label: option.displayLabel,
        optionValue: option.internalValue,
        checkboxValue: null,
      }));
  }
  return [];
}

function upsertBranchTarget(
  branches: DraftSectionBranch[],
  match: { fieldCode: string; optionValue: string | null; checkboxValue: boolean | null },
  target: { targetSectionId: string | null; targetIsSubmit: boolean } | null,
): DraftSectionBranch[] {
  const existingIndex = branches.findIndex(
    (b) =>
      b.fieldCode === match.fieldCode &&
      b.optionValue === match.optionValue &&
      b.checkboxValue === match.checkboxValue,
  );

  if (!target) {
    return existingIndex >= 0 ? branches.filter((_, i) => i !== existingIndex) : branches;
  }

  const nextBranch: DraftSectionBranch = {
    id: existingIndex >= 0 ? branches[existingIndex].id : createLocalId('branch'),
    fieldCode: match.fieldCode,
    optionValue: match.optionValue,
    checkboxValue: match.checkboxValue,
    targetSectionId: target.targetIsSubmit ? null : target.targetSectionId,
    targetIsSubmit: target.targetIsSubmit,
  };

  if (existingIndex >= 0) {
    const next = [...branches];
    next[existingIndex] = nextBranch;
    return next;
  }
  return [...branches, nextBranch];
}

// ─── Campos sub-tab ─────────────────────────────────────────────────────────

/** Seletor de tipos: adicionar campo, ou trocar o tipo de um campo existente. */
type TypePickerState = { mode: 'add' } | { mode: 'change'; fieldId: string };

function SectionFieldsTab({
  section,
  sections,
  formId,
  erpTableEnabled = false,
  availableFields,
  onRemoveField,
  onUpdateField,
  onMoveField,
  fieldQuery,
  onFieldQueryChange,
  expandedFieldId,
  onToggleExpanded,
  onCollapseAll,
  typePicker,
  onToggleAddPicker,
  onOpenChangePicker,
  onCloseTypePicker,
  onChooseType,
  onDuplicateField,
  onCreateErpTableParameterField,
  scrollToFieldId,
  onScrolledToField,
  phaseOptions,
}: Pick<
  SectionEditModalProps,
  | 'section'
  | 'sections'
  | 'formId'
  | 'erpTableEnabled'
  | 'availableFields'
  | 'onRemoveField'
  | 'onUpdateField'
  | 'onMoveField'
> & {
  fieldQuery: string;
  onFieldQueryChange: (query: string) => void;
  expandedFieldId: string | null;
  onToggleExpanded: (fieldId: string) => void;
  onCollapseAll: () => void;
  typePicker: TypePickerState | null;
  onToggleAddPicker: () => void;
  onOpenChangePicker: (fieldId: string) => void;
  onCloseTypePicker: () => void;
  onChooseType: (choice: FieldTypeChoice) => void;
  onDuplicateField?: (fieldId: string) => void;
  onCreateErpTableParameterField: (tableFieldId: string, parameter: ErpTableParameter) => void;
  /** Linha recém-criada: a lista rola até ela. */
  scrollToFieldId: string | null;
  onScrolledToField: () => void;
  /** Fases salvas do processo, para as faixas do campo calculado; null = processo ainda não salvo. */
  phaseOptions: FormulaPhaseOption[] | null;
}) {
  // Pontuação: as perguntas desta seção ("Pontuação da seção") e as pontuações de seção do
  // formulário inteiro ("Resultado da pontuação").
  const sectionQuestions = sectionScoreQuestions(section.fields).map((field) => ({
    code: field.code,
    label: field.label,
    options: field.options,
  }));
  const sectionScoreFields = sections.flatMap((item, index) =>
    item.fields
      .filter((field) => scoreModeOf(field) === 'section')
      .map((field) => ({
        code: field.code,
        label: field.label,
        sectionTitle: item.title.trim() || `Seção ${index + 1}`,
      })),
  );
  // Tabela dinâmica do ERP: parâmetro só de campo que vem antes (seção anterior ou antes na
  // mesma seção), do tipo aceito — a mesma regra que o backend confere ao publicar.
  const sectionIndex = sections.findIndex((item) => item.id === section.id);
  const earlierFields = sections.slice(0, Math.max(sectionIndex, 0)).flatMap((item) => item.fields);
  const dependencyFieldsAt = (index: number): ErpTableDependencyField[] =>
    [...earlierFields, ...section.fields.slice(0, index)]
      .filter((field) => ERP_TABLE_DEPENDENCY_TYPES.has(field.fieldType) && field.code)
      .map((field) => ({
        code: field.code,
        label: field.label || 'Campo sem rótulo',
        fieldType: field.fieldType,
      }));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const visibleFields = filterFieldsByQuery(section.fields, fieldQuery);
  const changingField =
    typePicker?.mode === 'change'
      ? (section.fields.find((field) => field.id === typePicker.fieldId) ?? null)
      : null;

  useEffect(() => {
    if (!scrollToFieldId) return;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-field-row-id]') ?? [],
    ).find((element) => element.dataset.fieldRowId === scrollToFieldId);
    if (!row) return;
    // Rola depois que o painel da linha terminou de abrir (200ms): antes disso a lista ainda
    // não tem a altura final e a rolagem para no meio do caminho.
    const timer = window.setTimeout(
      () => {
        row.scrollIntoView?.({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
        onScrolledToField();
      },
      reducedMotion ? 0 : 220,
    );
    return () => window.clearTimeout(timer);
  }, [scrollToFieldId, section.fields, reducedMotion, onScrolledToField]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = section.fields.findIndex((field) => field.id === active.id);
    const toIndex = section.fields.findIndex((field) => field.id === over.id);
    if (fromIndex >= 0 && toIndex >= 0) onMoveField(fromIndex, toIndex);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-default bg-bg-surface px-7 py-3.5">
        <label className="flex h-9 w-[320px] min-w-0 items-center gap-2 rounded-[8px] border border-border-strong px-3 focus-within:border-primary">
          <Search className="h-[15px] w-[15px] shrink-0 text-tx-muted" />
          <input
            value={fieldQuery}
            onChange={(event) => onFieldQueryChange(event.target.value)}
            placeholder="Buscar campo nesta seção"
            aria-label="Buscar campo nesta seção"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-tx-primary outline-none placeholder:text-tx-ph"
          />
        </label>
        <span className="hidden whitespace-nowrap text-[13px] text-tx-secondary sm:inline">
          {summarizeFields(section.fields)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCollapseAll}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-bold text-tx-secondary hover:bg-bg-hover"
        >
          <ChevronsDownUp className="h-[15px] w-[15px]" />
          Recolher
        </button>
        <button
          type="button"
          data-type-picker-trigger=""
          aria-expanded={typePicker?.mode === 'add'}
          onClick={onToggleAddPicker}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-primary px-3.5 text-[13px] font-bold text-white hover:bg-primary-container"
        >
          <Plus className="h-[15px] w-[15px]" />
          Adicionar campo
        </button>
      </div>

      {typePicker ? (
        <FieldTypePopover
          // Remonta ao trocar de modo/campo: a busca começa vazia e o foco volta para ela.
          key={typePicker.mode === 'change' ? typePicker.fieldId : 'add'}
          mode={typePicker.mode}
          currentChoice={
            changingField ? fieldTypeChoiceOf(changingField.fieldType, changingField.settingsJson) : undefined
          }
          erpTableEnabled={erpTableEnabled || changingField?.fieldType === 'erp_table'}
          onChoose={onChooseType}
          onClose={onCloseTypePicker}
        />
      ) : null}

      {/* `minmax(0,1fr)` + `auto-rows-max`: sem isso as linhas (overflow hidden) são
          espremidas até ~14px de altura quando a lista é mais alta que a área. */}
      <div
        ref={listRef}
        className="grid min-h-0 flex-1 auto-rows-max grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto overflow-x-hidden bg-bg-s2 px-7 pb-7 pt-4"
      >
        {visibleFields.length === 0 ? (
          <p className="py-2 text-[13px] text-tx-secondary">Nenhum campo encontrado.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleFields.map(({ field }) => field.id)}
              strategy={verticalListSortingStrategy}
            >
              {visibleFields.map(({ field, index }) => (
                <BuilderWizardFieldRow
                  key={field.id}
                  field={field}
                  formId={formId}
                  position={index + 1}
                  availableFields={availableFields.filter((f) => f.code !== field.code)}
                  phaseOptions={phaseOptions}
                  sectionFieldCodes={section.fields.map((item) => item.code)}
                  sectionQuestions={sectionQuestions}
                  sectionScoreFields={sectionScoreFields}
                  erpTableDependencyFields={field.fieldType === 'erp_table' ? dependencyFieldsAt(index) : undefined}
                  onCreateErpTableParameterField={
                    field.fieldType === 'erp_table'
                      ? (parameter) => onCreateErpTableParameterField(field.id, parameter)
                      : undefined
                  }
                  expanded={expandedFieldId === field.id}
                  onToggleExpanded={() => onToggleExpanded(field.id)}
                  onOpenTypePicker={() => onOpenChangePicker(field.id)}
                  onDuplicate={onDuplicateField ? () => onDuplicateField(field.id) : undefined}
                  onChange={(key, value) => onUpdateField(field.id, key, value)}
                  onRemove={() => onRemoveField(field.id)}
                  canRemove={section.fields.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        <button
          type="button"
          data-type-picker-trigger=""
          onClick={onToggleAddPicker}
          className="flex h-12 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-border-strong text-sm font-bold text-primary hover:border-primary hover:bg-bg-hover dark:text-blue-300"
        >
          <Plus className="h-4 w-4" />
          Adicionar campo
        </button>
      </div>
    </div>
  );
}

// ─── Lógica de fluxo sub-tab ────────────────────────────────────────────────

function SectionFlowLogicTab({
  section,
  sections,
  onSetSectionFlow,
}: Pick<SectionEditModalProps, 'section' | 'sections' | 'onSetSectionFlow'>) {
  const otherSections = sections.filter((s) => s.id !== section.id);
  const branchableFields = section.fields.filter(
    (field) => getFieldBranchOptions(field).length > 0,
  );

  function targetSelectValue(targetSectionId: string | null, targetIsSubmit: boolean): string {
    if (targetIsSubmit) return SUBMIT_VALUE;
    return targetSectionId ?? SUBMIT_VALUE;
  }

  function parseTarget(value: string): { targetSectionId: string | null; targetIsSubmit: boolean } {
    if (value === SUBMIT_VALUE) return { targetSectionId: null, targetIsSubmit: true };
    return { targetSectionId: value, targetIsSubmit: false };
  }

  const sectionIds = new Set(sections.map((s) => s.id));
  const fieldsByCode = branchFieldsByCode(sections, section);
  const orphanBranches = section.branches.flatMap((branch) => {
    const reason = branchOrphanReason(branch, sectionIds, fieldsByCode);
    return reason ? [{ branch, reason }] : [];
  });
  const defaultPathOrphaned = isNextSectionOrphaned(section, sectionIds);

  function describeOrphan(branch: DraftSectionBranch): { when: string; goTo: string } {
    // Mesma ordem de busca do branchFieldsByCode: a própria seção primeiro.
    const field = [section, ...sections]
      .flatMap((s) => s.fields)
      .find((candidate) => candidate.code === branch.fieldCode);
    const fieldName = field?.label || branch.fieldCode || 'campo removido';
    let answer = 'sem resposta definida';
    if (branch.checkboxValue !== null) answer = branch.checkboxValue ? 'Sim' : 'Não';
    else if (branch.optionValue !== null) {
      answer =
        field?.options.find((option) => option.internalValue === branch.optionValue)?.displayLabel ||
        branch.optionValue;
    }
    const target = branch.targetIsSubmit
      ? 'Enviar formulário'
      : sections.find((s) => s.id === branch.targetSectionId)?.title || 'seção removida';
    return { when: `“${fieldName}” = ${answer}`, goTo: target };
  }

  return (
    <div className="grid gap-6">
      {orphanBranches.length > 0 ? (
        <div
          role="group"
          aria-label="Regras sem efeito"
          className="grid gap-2 rounded-[8px] border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/50 dark:bg-amber-500/10"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {orphanBranches.length === 1 ? 'Regra sem efeito' : `${orphanBranches.length} regras sem efeito`}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Não se aplicam a nenhuma resposta e impedem a publicação. Remova e, se precisar, refaça a
            regra nas respostas abaixo.
          </p>
          {orphanBranches.map(({ branch, reason }) => {
            const { when, goTo } = describeOrphan(branch);
            return (
              <div
                key={branch.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border-default bg-bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tx-primary">
                    Se {when} → {goTo}
                  </p>
                  <p className="text-xs text-tx-secondary">Sem efeito: {BRANCH_ORPHAN_REASON_TEXT[reason]}.</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remover regra sem efeito: se ${when}, ir para ${goTo}`}
                  onClick={() =>
                    onSetSectionFlow(
                      section.nextSectionId,
                      section.nextIsSubmit,
                      section.branches.filter((candidate) => candidate.id !== branch.id),
                    )
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-[6px] px-2 py-1 text-sm font-bold text-error hover:bg-bg-hover"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {branchableFields.length === 0 ? (
        <p className="rounded-[8px] bg-bg-s2 px-3 py-2 text-sm text-tx-secondary">
          Nenhum campo de seleção única, múltipla ou checkbox nesta seção ainda. Adicione um na
          aba Campos para configurar ramificações.
        </p>
      ) : (
        branchableFields.map((field) => (
          <div key={field.id} className="grid gap-2">
            <p className="text-sm font-bold text-tx-primary">{field.label || field.code}</p>
            <div className="grid gap-2">
              {getFieldBranchOptions(field).map((option) => {
                const existing = section.branches.find(
                  (b) =>
                    b.fieldCode === field.code &&
                    b.optionValue === option.optionValue &&
                    b.checkboxValue === option.checkboxValue,
                );
                const value = existing
                  ? targetSelectValue(existing.targetSectionId, existing.targetIsSubmit)
                  : DEFAULT_VALUE;

                return (
                  <div
                    key={option.key}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-tx-primary">{option.label}</span>
                    <select
                      value={value}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const nextBranches = upsertBranchTarget(
                          section.branches,
                          {
                            fieldCode: field.code,
                            optionValue: option.optionValue,
                            checkboxValue: option.checkboxValue,
                          },
                          raw === DEFAULT_VALUE ? null : parseTarget(raw),
                        );
                        onSetSectionFlow(section.nextSectionId, section.nextIsSubmit, nextBranches);
                      }}
                      className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
                    >
                      <option value={DEFAULT_VALUE}>Seguir padrão</option>
                      {otherSections.map((s, i) => (
                        <option key={s.id} value={s.id}>
                          {s.title || `Seção ${i + 1}`}
                        </option>
                      ))}
                      <option value={SUBMIT_VALUE}>Enviar formulário</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div className="grid gap-2 border-t border-border-default pt-4">
        <p className="text-sm font-bold text-tx-primary">Caminho padrão desta seção</p>
        <p className="text-xs text-tx-secondary">
          Para onde ir quando nenhuma regra acima se aplicar.
        </p>
        <select
          aria-label="Caminho padrão desta seção"
          // Destino apagado: sem isto o seletor mostraria "Enviar formulário" (que não está valendo)
          // e escolher essa mesma opção não dispararia o onChange.
          value={
            defaultPathOrphaned
              ? ORPHAN_DEFAULT_VALUE
              : targetSelectValue(section.nextSectionId, section.nextIsSubmit)
          }
          onChange={(event) => {
            const { targetSectionId, targetIsSubmit } = parseTarget(event.target.value);
            onSetSectionFlow(targetSectionId, targetIsSubmit, section.branches);
          }}
          className={`h-9 w-full max-w-xs rounded-[8px] border bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary ${
            defaultPathOrphaned ? 'border-error' : 'border-border-strong'
          }`}
        >
          {defaultPathOrphaned ? (
            <option value={ORPHAN_DEFAULT_VALUE} disabled>
              Seção removida — escolha o destino
            </option>
          ) : null}
          {otherSections.map((s, i) => (
            <option key={s.id} value={s.id}>
              {s.title || `Seção ${i + 1}`}
            </option>
          ))}
          <option value={SUBMIT_VALUE}>Enviar formulário</option>
        </select>
      </div>
    </div>
  );
}

// ─── Automações sub-tab ─────────────────────────────────────────────────────

const ACTION_DEFAULTS: Record<string, Record<string, unknown>> = {
  send_email: { type: 'send_email', to: '', subject: '', body: '' },
  webhook: { type: 'webhook', url: '', method: 'POST' },
  notify_users: { type: 'notify_users', userIds: [], message: '' },
};

function AutomationRuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: AutomationRule;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const action = rule.actions[0] as Record<string, unknown> | undefined;

  function patchAction(patch: Record<string, unknown>) {
    onUpdate({ actions: [{ ...action, ...patch }] });
  }

  return (
    <div className="grid gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-3">
      <div className="flex items-center justify-between gap-2">
        <input
          value={rule.name}
          onChange={(event) => onUpdate({ name: event.target.value })}
          placeholder="Nome da automação"
          className="h-9 min-w-0 flex-1 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm font-semibold text-tx-primary outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={onDelete}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-tx-secondary hover:bg-[#fff1f1] hover:text-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {action?.type === 'send_email' ? (
        <div className="grid gap-2">
          <input
            value={String(action.to ?? '')}
            onChange={(event) => patchAction({ to: event.target.value })}
            placeholder="Destinatário (e-mail)"
            className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={String(action.subject ?? '')}
            onChange={(event) => patchAction({ subject: event.target.value })}
            placeholder="Assunto"
            className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          <textarea
            value={String(action.body ?? '')}
            onChange={(event) => patchAction({ body: event.target.value })}
            placeholder="Mensagem"
            rows={3}
            className="rounded-[8px] border border-border-strong bg-bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      ) : null}

      {action?.type === 'webhook' ? (
        <input
          value={String(action.url ?? '')}
          onChange={(event) => patchAction({ url: event.target.value })}
          placeholder="https://exemplo.com/webhook"
          className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm outline-none focus:border-primary"
        />
      ) : null}

      {action?.type === 'notify_users' ? (
        <textarea
          value={String(action.message ?? '')}
          onChange={(event) => patchAction({ message: event.target.value })}
          placeholder="Mensagem da notificação"
          rows={2}
          className="rounded-[8px] border border-border-strong bg-bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      ) : null}
    </div>
  );
}

function SectionAutomationsTab({
  formId,
  section,
}: {
  formId: string | null;
  section: DraftSection;
}) {
  const { showToast } = useToast();
  const automations = useAutomations(formId ?? '');

  if (!formId) {
    return (
      <p className="rounded-[8px] bg-bg-s2 px-3 py-2 text-sm text-tx-secondary">
        Salve o formulário para configurar automações desta seção.
      </p>
    );
  }
  if (!section.serverId) {
    return (
      <p className="rounded-[8px] bg-bg-s2 px-3 py-2 text-sm text-tx-secondary">
        Salve o formulário novamente para vincular esta nova seção antes de configurar
        automações.
      </p>
    );
  }

  const sectionRules = automations.rules.filter(
    (rule) => rule.trigger === 'on_section_reached' && rule.targetSectionId === section.serverId,
  );

  async function addRule(actionType: keyof typeof ACTION_DEFAULTS) {
    try {
      await automations.createRule({
        name: 'Nova automação',
        trigger: 'on_section_reached',
        targetSectionId: section.serverId,
        actions: [ACTION_DEFAULTS[actionType]],
      });
    } catch {
      showToast({
        title: 'Falha ao criar automação',
        description: 'Tente novamente.',
        variant: 'error',
      });
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs text-tx-secondary">
        Dispara quando o respondente alcança esta seção durante o preenchimento.
      </p>

      <div className="grid gap-3">
        {sectionRules.map((rule) => (
          <AutomationRuleCard
            key={rule.id}
            rule={rule}
            onUpdate={(patch) => automations.updateRule({ id: rule.id, payload: patch })}
            onDelete={() => automations.deleteRule(rule.id)}
          />
        ))}
        {sectionRules.length === 0 ? (
          <p className="rounded-[8px] bg-bg-s2 px-3 py-2 text-sm text-tx-secondary">
            Nenhuma automação vinculada a esta seção ainda.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void addRule('send_email')}
          className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-strong px-3 text-xs font-bold text-tx-primary hover:bg-bg-hover"
        >
          <Mail className="h-3.5 w-3.5" />
          Enviar e-mail
        </button>
        <button
          type="button"
          onClick={() => void addRule('notify_users')}
          className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-strong px-3 text-xs font-bold text-tx-primary hover:bg-bg-hover"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Notificar usuário
        </button>
        <button
          type="button"
          onClick={() => void addRule('webhook')}
          className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-strong px-3 text-xs font-bold text-tx-primary hover:bg-bg-hover"
        >
          <Webhook className="h-3.5 w-3.5" />
          Webhook
        </button>
      </div>
    </div>
  );
}

// ─── Modal shell ────────────────────────────────────────────────────────────

export function SectionEditModal({
  section,
  sections,
  formId,
  availableFields,
  erpTableEnabled,
  onClose,
  onUpdateSection,
  onRemoveSection,
  canRemoveSection,
  onAddField,
  onRemoveField,
  onUpdateField,
  onMoveField,
  onSetSectionFlow,
  onSelectSection,
  onDuplicateField,
}: SectionEditModalProps) {
  const [subTab, setSubTab] = useState<SubTab>('fields');
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [fieldQuery, setFieldQuery] = useState('');
  const [typePicker, setTypePicker] = useState<TypePickerState | null>(null);
  const [scrollToFieldId, setScrollToFieldId] = useState<string | null>(null);
  // Trocar de seção (anterior/próxima) volta para Campos, recolhe e limpa a busca.
  const [shownSectionId, setShownSectionId] = useState(section.id);
  if (shownSectionId !== section.id) {
    setShownSectionId(section.id);
    setSubTab('fields');
    setExpandedFieldId(null);
    setFieldQuery('');
    setTypePicker(null);
  }

  const clearScrollTarget = useCallback(() => setScrollToFieldId(null), []);

  /** Abre a linha (fechando a anterior), limpa a busca para ela aparecer e rola até ela. */
  function revealField(fieldId: string) {
    setFieldQuery('');
    setExpandedFieldId(fieldId);
    setScrollToFieldId(fieldId);
  }

  function chooseType(choice: FieldTypeChoice) {
    if (typePicker?.mode === 'change') {
      const field = section.fields.find((item) => item.id === typePicker.fieldId);
      if (field) {
        const next = applyFieldTypeChoice(choice, field.settingsJson);
        onUpdateField(field.id, 'fieldType', next.fieldType);
        onUpdateField(field.id, 'settingsJson', next.settingsJson);
      }
    } else {
      const newFieldId = onAddField(choice);
      if (newFieldId) revealField(newFieldId);
    }
    setTypePicker(null);
  }

  /**
   * Tabela dinâmica do ERP: cria o campo do parâmetro logo antes da tabela (número ou texto
   * curto, conforme o tipo do parâmetro), obrigatório, e já associa. A linha da tabela continua
   * aberta: a pessoa vê a associação feita e o campo novo acima.
   */
  function createErpTableParameterField(tableFieldId: string, parameter: ErpTableParameter) {
    const tableIndex = section.fields.findIndex((field) => field.id === tableFieldId);
    const table = section.fields[tableIndex];
    if (!table) return;
    const newFieldId = onAddField(parameter.type === 'number' ? 'number' : 'short_text');
    if (!newFieldId) return;

    const label = parameterFieldLabel(parameter.name);
    // O campo novo ainda não está em `sections` (render anterior): o código sai igual ao que o
    // reducer gera ao trocar o rótulo, e é gravado explicitamente para a associação bater.
    const code = createUniqueFieldCode(label, sections);
    onUpdateField(newFieldId, 'label', label);
    onUpdateField(newFieldId, 'code', code);
    onUpdateField(newFieldId, 'required', true);
    // Entrou no fim da seção (índice = tamanho antigo); sobe para o lugar da tabela.
    onMoveField(section.fields.length, tableIndex);
    const others = (table.settingsJson.parameterBindings ?? []).filter(
      (binding) => binding.parameter !== parameter.name,
    );
    onUpdateField(table.id, 'settingsJson', {
      ...table.settingsJson,
      parameterBindings: [...others, { parameter: parameter.name, fieldCode: code }],
    });
  }

  useEscapeKey(onClose);

  const index = sections.findIndex((s) => s.id === section.id);
  const previous = index > 0 ? sections[index - 1] : null;
  const next = index >= 0 && index < sections.length - 1 ? sections[index + 1] : null;
  const sectionName = (item: DraftSection) => item.title.trim() || `Seção ${sections.indexOf(item) + 1}`;

  const automations = useAutomations(formId ?? '');
  // Faixas do campo calculado escolhem uma fase já salva (id do servidor): fase nova só aparece
  // depois de salvar o processo.
  const phasesQuery = useKanbanPhasesQuery(formId);
  const phaseOptions = useMemo<FormulaPhaseOption[] | null>(
    () =>
      formId
        ? [...(phasesQuery.data ?? [])]
            .sort((a, b) => a.order - b.order)
            .map((phase) => ({ id: phase.id, label: phase.label }))
        : null,
    [formId, phasesQuery.data],
  );
  const automationCount = section.serverId
    ? automations.rules.filter(
        (rule) => rule.trigger === 'on_section_reached' && rule.targetSectionId === section.serverId,
      ).length
    : 0;

  const tabs: Array<{ value: SubTab; label: string; count?: number; countClassName?: string }> = [
    { value: 'fields', label: 'Campos', count: section.fields.length, countClassName: primarySoftChip },
    { value: 'flow', label: 'Lógica de fluxo' },
    {
      value: 'automations',
      label: 'Automações',
      count: automationCount,
      countClassName: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    },
  ];

  const navButton =
    'inline-flex h-[34px] min-w-0 max-w-[220px] items-center gap-1.5 rounded-[8px] border border-border-strong px-3 text-[13px] font-semibold text-tx-secondary hover:bg-bg-hover';

  return (
    <div
      className="fixed inset-0 z-[80] animate-fade bg-[#071a38]/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${sectionName(section)}`}
        className="fixed inset-x-4 inset-y-4 flex animate-admin-in flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl md:inset-x-8 md:inset-y-6"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-border-default px-7 pb-3.5 pt-[18px]">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-tx-secondary">
              Seção {index + 1} de {sections.length}
            </p>
            <input
              value={section.title}
              onChange={(event) => onUpdateSection('title', event.target.value)}
              placeholder="Título da seção"
              aria-label="Título da seção"
              className="mt-0.5 w-full border-0 bg-transparent text-[22px] font-extrabold text-tx-primary outline-none placeholder:text-tx-ph"
            />
            <input
              value={section.description}
              onChange={(event) => onUpdateSection('description', event.target.value)}
              placeholder="Descrição da seção (opcional)"
              aria-label="Descrição da seção"
              className="mt-1 w-full border-0 bg-transparent text-[13px] text-tx-secondary outline-none placeholder:text-tx-ph"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {previous ? (
              <button
                type="button"
                onClick={() => onSelectSection(previous.id)}
                aria-label={`Seção anterior: ${sectionName(previous)}`}
                className={`${navButton} max-md:hidden`}
              >
                <ChevronLeft className="h-[15px] w-[15px] shrink-0" />
                <span className="truncate">{sectionName(previous)}</span>
              </button>
            ) : null}
            {next ? (
              <button
                type="button"
                onClick={() => onSelectSection(next.id)}
                aria-label={`Próxima seção: ${sectionName(next)}`}
                className={`${navButton} max-md:hidden`}
              >
                <span className="truncate">{sectionName(next)}</span>
                <ChevronRight className="h-[15px] w-[15px] shrink-0" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-tx-secondary hover:bg-bg-hover"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-default px-7">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSubTab(item.value)}
              aria-current={subTab === item.value ? 'page' : undefined}
              className={[
                '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-3 text-sm font-bold',
                subTab === item.value
                  ? 'border-primary text-primary dark:border-blue-300 dark:text-blue-300'
                  : 'border-transparent text-tx-secondary hover:text-tx-primary',
              ].join(' ')}
            >
              {item.label}
              {item.count !== undefined && (item.value === 'fields' || item.count > 0) ? (
                <span className={`rounded-full px-[7px] py-px text-[11px] ${item.countClassName}`}>
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {subTab === 'fields' ? (
          <SectionFieldsTab
            key={section.id}
            section={section}
            sections={sections}
            formId={formId}
            erpTableEnabled={erpTableEnabled}
            availableFields={availableFields}
            onRemoveField={onRemoveField}
            onUpdateField={onUpdateField}
            onMoveField={onMoveField}
            fieldQuery={fieldQuery}
            onFieldQueryChange={setFieldQuery}
            expandedFieldId={expandedFieldId}
            onToggleExpanded={(fieldId) =>
              setExpandedFieldId((current) => (current === fieldId ? null : fieldId))
            }
            onCollapseAll={() => setExpandedFieldId(null)}
            typePicker={typePicker}
            onToggleAddPicker={() =>
              setTypePicker((current) => (current?.mode === 'add' ? null : { mode: 'add' }))
            }
            onOpenChangePicker={(fieldId) => setTypePicker({ mode: 'change', fieldId })}
            onCloseTypePicker={() => setTypePicker(null)}
            onChooseType={chooseType}
            onDuplicateField={
              onDuplicateField
                ? (fieldId) => {
                    const copyId = onDuplicateField(fieldId);
                    if (copyId) revealField(copyId);
                  }
                : undefined
            }
            onCreateErpTableParameterField={createErpTableParameterField}
            scrollToFieldId={scrollToFieldId}
            onScrolledToField={clearScrollTarget}
            phaseOptions={phaseOptions}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
            {subTab === 'flow' ? (
              <SectionFlowLogicTab
                section={section}
                sections={sections}
                onSetSectionFlow={onSetSectionFlow}
              />
            ) : (
              <SectionAutomationsTab formId={formId} section={section} />
            )}
          </div>
        )}

        <footer className="flex shrink-0 items-center justify-between border-t border-border-default px-7 py-3.5">
          {canRemoveSection ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Remover a seção "${sectionName(section)}" e todos os campos dela?`)) {
                  onRemoveSection();
                }
              }}
              className="text-sm font-bold text-error hover:underline"
            >
              Remover seção
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[8px] bg-primary px-5 text-sm font-bold text-white hover:bg-primary-container"
          >
            Concluído
          </button>
        </footer>
      </section>
    </div>
  );
}
