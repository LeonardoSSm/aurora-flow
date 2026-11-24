import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  BRANCH_ORPHAN_REASON_TEXT,
  branchOrphanReason,
  type BranchFieldInfo,
} from '../../lib/section-flow-layout';
import type { FormulaAvailableField } from '../formula-editor';
import { PhaseFieldRow } from '../../../kanban-phases/components/phase-field-row';
import { newDraftField } from '../../../kanban-phases/lib/phase-draft';
import { isPhaseLayoutType } from '../../../kanban-phases/lib/phase-field-types';
import {
  groupPhaseFormSections,
  movePhaseFormSection,
  nextPhaseFieldPosition,
  replaceSectionFields,
  type PhaseFormSection,
} from '../../../kanban-phases/lib/phase-form-sections';
import {
  phaseBranchOptions,
  setSectionRoute,
  type PhaseBranchOption,
} from '../../../kanban-phases/lib/phase-section-flow';
import {
  PHASE_SECTION_AUTO,
  PHASE_SECTION_END,
  phaseColorHex,
  type DraftKanbanPhase,
  type DraftKanbanPhaseField,
  type DraftPhaseSectionFlow,
  type DraftPhaseSectionRoute,
} from '../../../kanban-phases/types';

/** "Seguir o caminho padrão" no seletor de uma ramificação: sem regra para essa resposta. */
const DEFAULT_TARGET = '__padrao__';

const selectClass =
  'h-9 rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary';

function sectionName(section: PhaseFormSection, index: number): string {
  return section.title || (section.titleFieldId ? `Seção ${index + 1}` : 'Início');
}

/**
 * "Depois desta seção": ramificações pela resposta de uma lista ou caixa de seleção da própria
 * seção e o caminho padrão — o mesmo jeito do formulário de abertura.
 */
function PhaseSectionRouteEditor({
  sections,
  section,
  route,
  onChange,
}: {
  sections: PhaseFormSection[];
  section: PhaseFormSection;
  route: DraftPhaseSectionRoute;
  onChange: (route: DraftPhaseSectionRoute) => void;
}) {
  const index = sections.findIndex((candidate) => candidate.id === section.id);
  const others = sections
    .map((candidate, candidateIndex) => ({ id: candidate.id, name: sectionName(candidate, candidateIndex) }))
    .filter((candidate) => candidate.id !== section.id);
  const following = sections[index + 1];
  const branchFields = section.fields.filter((field) => phaseBranchOptions(field).length > 0);

  function branchFor(field: DraftKanbanPhaseField, option: PhaseBranchOption) {
    return route.branches.find(
      (branch) =>
        branch.fieldId === field.id &&
        branch.optionValue === option.optionValue &&
        branch.checkboxValue === option.checkboxValue,
    );
  }

  function setBranch(field: DraftKanbanPhaseField, option: PhaseBranchOption, target: string) {
    const rest = route.branches.filter((branch) => branch !== branchFor(field, option));
    onChange({
      ...route,
      branches:
        target === DEFAULT_TARGET
          ? rest
          : [
              ...rest,
              { fieldId: field.id, optionValue: option.optionValue, checkboxValue: option.checkboxValue, target },
            ],
    });
  }

  // Mesma conta do canvas (phaseSectionsForCanvas → countOrphanedRules): o campo é procurado só
  // nesta seção, pelo id.
  const sectionIds = new Set(sections.map((candidate) => candidate.id));
  const fieldsById = new Map<string, BranchFieldInfo>(
    section.fields.map((field) => [
      field.id,
      { fieldType: field.fieldType, optionValues: new Set(field.options.map((option) => option.value)) },
    ]),
  );
  const orphanBranches = route.branches.flatMap((branch) => {
    const reason = branchOrphanReason(
      {
        id: '',
        fieldCode: branch.fieldId,
        optionValue: branch.optionValue,
        checkboxValue: branch.checkboxValue,
        targetSectionId: branch.target === PHASE_SECTION_END ? null : branch.target,
        targetIsSubmit: branch.target === PHASE_SECTION_END,
      },
      sectionIds,
      fieldsById,
    );
    if (!reason) return [];
    const field = section.fields.find((candidate) => candidate.id === branch.fieldId);
    const fieldName = field?.label || field?.code || 'campo removido';
    let answer = 'sem resposta definida';
    if (branch.checkboxValue !== null) answer = branch.checkboxValue ? 'Sim' : 'Não';
    else if (branch.optionValue !== null) {
      answer = field?.options.find((option) => option.value === branch.optionValue)?.label || branch.optionValue;
    }
    const goTo =
      branch.target === PHASE_SECTION_END
        ? 'Fim do formulário'
        : (others.find((other) => other.id === branch.target)?.name ?? 'seção removida');
    return [{ branch, reason, when: `“${fieldName}” = ${answer}`, goTo }];
  });

  return (
    <section aria-label="Depois desta seção" className="grid gap-4 border-t border-border-default pt-4">
      <div>
        <p className="text-sm font-bold text-tx-primary">Depois desta seção</p>
        <p className="text-xs text-tx-secondary">
          No card, aparecem só as seções do caminho escolhido. Campo obrigatório de seção fora do
          caminho não é cobrado.
        </p>
      </div>

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
            Não se aplicam a nenhuma resposta e impedem salvar. Remova e, se precisar, refaça a regra
            nas respostas abaixo.
          </p>
          {orphanBranches.map(({ branch, reason, when, goTo }, orphanIndex) => (
            <div
              key={`${branch.fieldId}-${branch.optionValue}-${String(branch.checkboxValue)}-${orphanIndex}`}
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
                  onChange({ ...route, branches: route.branches.filter((candidate) => candidate !== branch) })
                }
                className="flex shrink-0 items-center gap-1.5 rounded-[6px] px-2 py-1 text-sm font-bold text-error hover:bg-bg-hover"
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {branchFields.length === 0 ? (
        <p className="rounded-[8px] bg-bg-s2 px-3 py-2 text-xs text-tx-secondary">
          Para ramificar, adicione nesta seção uma lista (opção única ou múltipla) ou uma caixa de
          seleção.
        </p>
      ) : (
        branchFields.map((field) => (
          <div key={field.id} className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
              Se “{field.label || field.code}” for
            </p>
            {phaseBranchOptions(field).map((option) => (
              <div
                key={option.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2"
              >
                <span className="text-sm font-semibold text-tx-primary">{option.label}</span>
                <select
                  aria-label={`Destino quando ${field.label || field.code} for ${option.label}`}
                  value={branchFor(field, option)?.target ?? DEFAULT_TARGET}
                  onChange={(event) => setBranch(field, option, event.target.value)}
                  className={selectClass}
                >
                  <option value={DEFAULT_TARGET}>Seguir o caminho padrão</option>
                  {others.map((other) => (
                    <option key={other.id} value={other.id}>
                      Ir para {other.name}
                    </option>
                  ))}
                  <option value={PHASE_SECTION_END}>Fim do formulário</option>
                </select>
              </div>
            ))}
          </div>
        ))
      )}

      <label className="grid gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-tx-secondary">Caminho padrão</span>
        <select
          value={route.next}
          onChange={(event) => onChange({ ...route, next: event.target.value })}
          className={`${selectClass} w-full max-w-sm`}
        >
          <option value={PHASE_SECTION_AUTO}>
            {following ? `Seção seguinte (${sectionName(following, index + 1)})` : 'Seção seguinte (fim do formulário)'}
          </option>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
          <option value={PHASE_SECTION_END}>Fim do formulário</option>
        </select>
      </label>
    </section>
  );
}

/**
 * Edição de uma seção do formulário de uma fase, aberta pelo nó no mapa. As alterações vão direto
 * para o rascunho do processo (gravado no "Salvar" do topo).
 */
export function PhaseSectionModal({
  phase,
  sectionId,
  formulaFields,
  onChangeFields,
  onChangeSectionFlow,
  onRemoveSection,
  onSelectSection,
  onClose,
}: {
  phase: DraftKanbanPhase;
  sectionId: string;
  formulaFields: FormulaAvailableField[];
  onChangeFields: (fields: DraftKanbanPhase['fields']) => void;
  onChangeSectionFlow: (sectionFlow: DraftPhaseSectionFlow) => void;
  /** Remove a seção, os campos dela e as setas que chegavam nela. */
  onRemoveSection: () => void;
  onSelectSection: (sectionId: string) => void;
  onClose: () => void;
}) {
  const sections = groupPhaseFormSections(phase.fields);
  const index = sections.findIndex((section) => section.id === sectionId);
  const section = sections[index];
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!section) return null;

  const titleField = section.titleFieldId
    ? phase.fields.find((field) => field.id === section.titleFieldId)
    : undefined;
  const sectionFormulaFields: FormulaAvailableField[] = [
    ...formulaFields,
    ...phase.fields
      .filter((field) => field.code && !isPhaseLayoutType(field.fieldType))
      .map((field) => ({ code: field.code, label: field.label || field.code, fieldType: field.fieldType })),
  ];

  function setSectionFields(next: DraftKanbanPhase['fields']) {
    onChangeFields(replaceSectionFields(phase.fields, sectionId, next));
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="phase-section-title"
        className="flex max-h-[90dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header
          className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4"
          style={{ borderTop: `4px solid ${phaseColorHex(phase.color)}` }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">
              {`${phase.label || 'Fase'} · Seção ${index + 1} de ${sections.length}`}
            </p>
            {titleField ? (
              <input
                id="phase-section-title"
                value={titleField.label}
                onChange={(event) =>
                  onChangeFields(
                    phase.fields.map((field) =>
                      field.id === titleField.id ? { ...field, label: event.target.value } : field,
                    ),
                  )
                }
                placeholder="Título da seção"
                aria-label="Título da seção"
                className="mt-1 h-9 w-full rounded-[8px] border border-transparent bg-transparent px-1.5 text-lg font-bold text-tx-primary outline-none hover:border-border-default focus:border-primary"
              />
            ) : (
              <h3 id="phase-section-title" className="mt-1 text-lg font-bold italic text-tx-muted">
                Início <span className="text-sm font-semibold not-italic">(seção sem título)</span>
              </h3>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectSection(sections[index - 1].id)}
              disabled={index === 0}
              aria-label="Seção anterior"
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-hover disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5 text-tx-secondary" />
            </button>
            <button
              type="button"
              onClick={() => onSelectSection(sections[index + 1].id)}
              disabled={index === sections.length - 1}
              aria-label="Próxima seção"
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-hover disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5 text-tx-secondary" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-hover"
            >
              <X className="h-5 w-5 text-tx-secondary" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-5 py-5">
          {section.fields.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-6 text-center text-sm text-tx-muted">
              Nenhum campo nesta seção.
            </p>
          ) : (
            <ul className="grid gap-2">
              {section.fields.map((field, fieldIndex) => (
                <PhaseFieldRow
                  key={field.id}
                  field={field}
                  formulaFields={sectionFormulaFields.filter((f) => f.code !== field.code)}
                  index={fieldIndex}
                  total={section.fields.length}
                  expanded={expandedFieldId === field.id}
                  onToggle={() => setExpandedFieldId((current) => (current === field.id ? null : field.id))}
                  onChange={(next) => setSectionFields(section.fields.map((f) => (f.id === field.id ? next : f)))}
                  onRemove={() => setSectionFields(section.fields.filter((f) => f.id !== field.id))}
                  onMove={(delta) => {
                    const target = fieldIndex + delta;
                    if (target < 0 || target >= section.fields.length) return;
                    const next = [...section.fields];
                    [next[fieldIndex], next[target]] = [next[target], next[fieldIndex]];
                    setSectionFields(next);
                  }}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              const field = newDraftField(nextPhaseFieldPosition(phase.fields));
              setSectionFields([...section.fields, field]);
              setExpandedFieldId(field.id);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong py-2 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar campo
          </button>

          <PhaseSectionRouteEditor
            sections={sections}
            section={section}
            route={phase.sectionFlow[sectionId] ?? { next: PHASE_SECTION_AUTO, branches: [] }}
            onChange={(route) => onChangeSectionFlow(setSectionRoute(phase.sectionFlow, sectionId, route))}
          />
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border-default px-5 py-3">
          {section.titleFieldId ? (
            <>
              <button
                type="button"
                onClick={() => onChangeFields(movePhaseFormSection(phase.fields, sectionId, -1))}
                className="h-9 rounded-[8px] px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover"
              >
                Mover para trás
              </button>
              <button
                type="button"
                onClick={() => onChangeFields(movePhaseFormSection(phase.fields, sectionId, 1))}
                className="h-9 rounded-[8px] px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover"
              >
                Mover para frente
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Remover a seção e todos os campos dela?')) return;
              onRemoveSection();
              onClose();
            }}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-xs font-bold text-error hover:bg-error/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remover seção
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[8px] bg-primary px-4 text-sm font-bold text-white"
          >
            Concluir
          </button>
        </footer>
      </section>
    </div>
  );
}
