import { validateFormulaSource } from '../../forms/formula';
import { supportsOptions } from '../../builder/types';
import type { SaveKanbanPhaseInput } from '../services/kanban-phases-api';
import type { DraftKanbanPhase, DraftKanbanPhaseField, KanbanPhase, KanbanPhaseVisibility } from '../types';
import { isPhaseLayoutType, phaseTypeHasOptions } from './phase-field-types';
import { peopleCount, phaseActors, phaseApprovers } from './phase-people';
import { readItemListId, visibleOptions } from '../../item-lists/linked-options';
import { phaseSectionFlowIssue, sectionFlowFromServer, sectionFlowToPayload } from './phase-section-flow';

/**
 * Rascunho das fases do Kanban, usado pelo editor do formulário (todas as fases) e pelo modal de
 * configuração de uma fase no board. O PUT substitui a configuração inteira do formulário: quem
 * edita uma fase só manda as outras como vieram.
 */

export function makeLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || makeLocalId('campo')
  );
}

export const EMPTY_VISIBILITY: KanbanPhaseVisibility = { roleCodes: [], areaIds: [], userIds: [] };

function visibilityDraft(visibleTo: KanbanPhaseVisibility | null | undefined) {
  const value = {
    roleCodes: visibleTo?.roleCodes ?? [],
    areaIds: visibleTo?.areaIds ?? [],
    userIds: visibleTo?.userIds ?? [],
  };
  const restrictVisibility = value.roleCodes.length + value.areaIds.length + value.userIds.length > 0;
  return { restrictVisibility, visibleTo: value };
}

export function visibilityCount(visibleTo: KanbanPhaseVisibility): number {
  return visibleTo.roleCodes.length + visibleTo.areaIds.length + visibleTo.userIds.length;
}

export function toDraft(phases: KanbanPhase[]): DraftKanbanPhase[] {
  return phases.map((phase) => {
    const fields = phase.fields.map((field) => ({
      id: field.id,
      serverId: field.id,
      code: field.code,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
      settingsJson: field.settingsJson ?? {},
      options: field.optionsJson ?? [],
    }));
    return { ...phaseDraft(phase), fields, sectionFlow: sectionFlowFromServer(phase.sectionFlow, fields) };
  });
}

function phaseDraft(phase: KanbanPhase): Omit<DraftKanbanPhase, 'fields' | 'sectionFlow'> {
  return {
    id: phase.id,
    serverId: phase.id,
    key: phase.key,
    label: phase.label,
    color: phase.color,
    description: phase.description ?? '',
    isTerminal: phase.isTerminal,
    actors: phaseActors(phase),
    requiresApproval: phase.requiresApproval,
    approvers: phaseApprovers(phase),
    approvalMode: phase.approvalMode ?? 'any',
    approvalRequest: phase.approvalRequest ?? 'manual',
    approvalOnApproved: phase.approvalOnApproved ?? 'stay',
    approvalOnRejected: phase.approvalOnRejected ?? 'stay',
    requireFieldsToExit: phase.requireFieldsToExit ?? false,
    requireAssigneeToExit: phase.requireAssigneeToExit ?? false,
    blockMoveBack: phase.blockMoveBack ?? false,
    ...visibilityDraft(phase.visibleTo),
    slaHours: phase.slaHours ?? null,
    slaBusinessHours: phase.slaBusinessHours ?? false,
    slaWarningPercent: phase.slaWarningPercent ?? null,
  };
}

export function toSavePayload(phases: DraftKanbanPhase[]): SaveKanbanPhaseInput[] {
  return phases.map((phase, phaseIndex) => ({
    id: phase.serverId ?? undefined,
    key: phase.key.trim() || `fase_${phaseIndex + 1}`,
    label: phase.label.trim() || `Fase ${phaseIndex + 1}`,
    color: phase.color,
    description: phase.description.trim() || null,
    order: phaseIndex,
    isTerminal: phase.isTerminal,
    actors: peopleCount(phase.actors) > 0 ? phase.actors : null,
    requiresApproval: phase.requiresApproval,
    approvers: phase.requiresApproval && peopleCount(phase.approvers) > 0 ? phase.approvers : null,
    approvalMode: phase.requiresApproval ? phase.approvalMode : 'any',
    approvalRequest: phase.requiresApproval ? phase.approvalRequest : 'manual',
    approvalOnApproved: phase.requiresApproval ? phase.approvalOnApproved : 'stay',
    approvalOnRejected: phase.requiresApproval ? phase.approvalOnRejected : 'stay',
    requireFieldsToExit: phase.requireFieldsToExit,
    requireAssigneeToExit: phase.requireAssigneeToExit,
    blockMoveBack: phase.blockMoveBack,
    visibleTo: phase.restrictVisibility ? phase.visibleTo : null,
    // Fase final não tem prazo: o card já terminou.
    slaHours: phase.isTerminal ? null : phase.slaHours,
    slaBusinessHours: phase.isTerminal || phase.slaHours === null ? false : phase.slaBusinessHours,
    slaWarningPercent: phase.isTerminal || phase.slaHours === null ? null : phase.slaWarningPercent,
    fields: phase.fields.map((field, fieldIndex) => ({
      id: field.serverId ?? undefined,
      code: field.code.trim() || `campo_${fieldIndex + 1}`,
      label: field.label.trim() || `Campo ${fieldIndex + 1}`,
      fieldType: field.fieldType,
      required: field.required,
      order: fieldIndex,
      settingsJson: field.settingsJson,
      options: supportsOptions(field.fieldType)
        ? field.options.map((option) => ({ value: option.value, label: option.label.trim() }))
        : undefined,
    })),
    sectionFlow: sectionFlowToPayload(phase),
  }));
}

export function newDraftField(position: number): DraftKanbanPhaseField {
  return {
    id: makeLocalId('field'),
    serverId: null,
    code: slugify(`campo_${position}`),
    label: '',
    fieldType: 'short_text',
    required: false,
    settingsJson: {},
    options: [],
  };
}

/** Campos que guardam resposta (sem título/descrição/divisor). */
export function answerFields(fields: DraftKanbanPhaseField[]): DraftKanbanPhaseField[] {
  return fields.filter((field) => !isPhaseLayoutType(field.fieldType));
}

/** Mensagem do primeiro problema que impede salvar, ou `null`: nome vazio (o backend recusa), opções faltando ou repetidas. */
export function draftSaveIssue(phases: DraftKanbanPhase[]): string | null {
  if (phases.length === 0) return 'O Kanban precisa de pelo menos uma fase.';
  const missingApprover = phases.find(
    (phase) => phase.requiresApproval && peopleCount(phase.approvers) === 0,
  );
  if (missingApprover) {
    return `A fase "${missingApprover.label || 'sem nome'}" exige aprovação mas ninguém foi escolhido para aprovar (perfil ou usuário).`;
  }
  for (const phase of phases) {
    const name = phase.label || 'sem nome';
    if (phase.restrictVisibility && visibilityCount(phase.visibleTo) === 0) {
      return `A fase "${name}" está visível só para alguns, mas ninguém foi escolhido.`;
    }
    const codes = phase.fields.map((field) => field.code.trim()).filter(Boolean);
    const repeated = codes.find((code, index) => codes.indexOf(code) !== index);
    if (repeated) return `A fase "${name}" tem dois campos com o código "${repeated}".`;
    const flowIssue = phaseSectionFlowIssue(phase);
    if (flowIssue) return flowIssue;
    for (const field of phase.fields) {
      if (!field.label.trim() && field.fieldType !== 'divider') {
        return `A fase "${name}" tem um campo sem nome.`;
      }
      if (field.fieldType === 'calculated') {
        const formula = typeof field.settingsJson.formula === 'string' ? field.settingsJson.formula : '';
        const issue = formula.trim() ? validateFormulaSource(formula) : 'Escreva uma fórmula.';
        if (issue) return `O cálculo "${field.label.trim() || 'sem nome'}" da fase "${name}": ${issue}`;
      }
      if (field.fieldType === 'item_order') {
        const fieldName = field.label.trim() || 'sem nome';
        if (!field.settingsJson.itemListId) return `Escolha a lista de itens do campo "${fieldName}" (fase "${name}").`;
        if (!field.settingsJson.inputColumns?.length) {
          return `O campo "${fieldName}" (fase "${name}") precisa de pelo menos uma coluna para preencher.`;
        }
      }
      if (!phaseTypeHasOptions(field.fieldType)) continue;
      const fieldName = field.label.trim() || 'sem nome';
      if (readItemListId(field.settingsJson)) {
        // Opções vindas da lista: o servidor reaplica ao salvar; aqui só confere que sobra alguma.
        if (visibleOptions(field.options, field.settingsJson, (o) => o.value).length === 0) {
          return `A lista escolhida no campo "${fieldName}" não tem itens ativos.`;
        }
        continue;
      }
      if (field.options.length === 0) return `O campo "${fieldName}" precisa de pelo menos uma opção.`;
      if (field.options.some((option) => !option.label.trim())) {
        return `O campo "${fieldName}" tem uma opção sem nome.`;
      }
      const values = field.options.map((option) => option.value);
      if (values.some((value, index) => values.indexOf(value) !== index)) {
        return `O campo "${fieldName}" tem duas opções iguais.`;
      }
    }
  }
  return null;
}
