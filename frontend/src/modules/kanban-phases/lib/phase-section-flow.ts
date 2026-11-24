import { organizeSectionFlow } from '../../builder/lib/section-flow-layout';
import type { DraftField, DraftSection } from '../../builder/types';
import {
  PHASE_SECTION_AUTO,
  PHASE_SECTION_END,
  type DraftKanbanPhase,
  type DraftKanbanPhaseField,
  type DraftPhaseSectionFlow,
  type DraftPhaseSectionRoute,
  type KanbanPhase,
  type KanbanPhaseField,
  type KanbanPhaseSectionRoute,
} from '../types';
import { groupPhaseFormSections, UNTITLED_SECTION_ID } from './phase-form-sections';

/**
 * Ramificação no formulário da fase. Cada campo "Título" abre uma seção (ver phase-form-sections.ts);
 * o caminho diz para onde cada seção leva, com a mesma regra do formulário de abertura: a primeira
 * ramificação que casar decide; sem nenhuma, vale o caminho padrão (a seção seguinte, se ninguém
 * escolheu outra). Mesma conta do backend: backend/src/modules/kanban-phases/phase-section-flow.ts.
 *
 * O backend guarda seções e campos pelo código; o rascunho, pelo id — assim renomear um código ou
 * mover seções não quebra as setas enquanto se edita.
 */

/** Chave da seção sem título (antes do primeiro "Título") no que o backend guarda. */
export const PHASE_START_SECTION = '__inicio__';

const BRANCH_FIELD_TYPES = new Set<string>(['single_select', 'multi_select', 'checkbox']);

export type PhaseBranchOption = {
  key: string;
  label: string;
  optionValue: string | null;
  checkboxValue: boolean | null;
};

/** Respostas de um campo que podem decidir uma ramificação (lista ou caixa de seleção). */
export function phaseBranchOptions(field: DraftKanbanPhaseField): PhaseBranchOption[] {
  if (field.fieldType === 'checkbox') {
    return [
      { key: 'true', label: 'Sim', optionValue: null, checkboxValue: true },
      { key: 'false', label: 'Não', optionValue: null, checkboxValue: false },
    ];
  }
  if (field.fieldType === 'single_select' || field.fieldType === 'multi_select') {
    return field.options
      .filter((option) => option.label.trim())
      .map((option) => ({
        key: option.value,
        label: option.label,
        optionValue: option.value,
        checkboxValue: null,
      }));
  }
  return [];
}

/** Código que o campo leva no salvamento (mesma regra de toSavePayload). */
function payloadCode(field: DraftKanbanPhaseField, index: number): string {
  return field.code.trim() || `campo_${index + 1}`;
}

// ── Servidor ⇄ rascunho ──────────────────────────────────────────────────────

export function sectionFlowFromServer(
  routes: KanbanPhaseSectionRoute[] | null | undefined,
  fields: DraftKanbanPhaseField[],
): DraftPhaseSectionFlow {
  const flow: DraftPhaseSectionFlow = {};
  if (!routes?.length) return flow;
  const sections = groupPhaseFormSections(fields);
  const idByKey = new Map<string, string>();
  for (const section of sections) {
    const title = section.titleFieldId ? fields.find((field) => field.id === section.titleFieldId) : null;
    idByKey.set(title ? title.code : PHASE_START_SECTION, section.id);
  }
  const target = (key: string | null): string | undefined =>
    key === null ? PHASE_SECTION_END : idByKey.get(key);

  for (const route of routes) {
    const sectionId = idByKey.get(route.section);
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section || !sectionId) continue;
    const next = route.next === undefined ? PHASE_SECTION_AUTO : (target(route.next) ?? PHASE_SECTION_AUTO);
    const branches = route.branches.flatMap((branch) => {
      const field = section.fields.find((candidate) => candidate.code === branch.fieldCode);
      const to = target(branch.target);
      return field && to
        ? [{ fieldId: field.id, optionValue: branch.optionValue, checkboxValue: branch.checkboxValue, target: to }]
        : [];
    });
    flow[sectionId] = { next, branches };
  }
  return flow;
}

export function sectionFlowToPayload(phase: DraftKanbanPhase): KanbanPhaseSectionRoute[] | null {
  const sections = groupPhaseFormSections(phase.fields);
  const codeById = new Map(phase.fields.map((field, index) => [field.id, payloadCode(field, index)]));
  const keyById = new Map(
    sections.map((section) => [
      section.id,
      section.titleFieldId ? (codeById.get(section.titleFieldId) ?? '') : PHASE_START_SECTION,
    ]),
  );
  const target = (id: string): string | null | undefined =>
    id === PHASE_SECTION_END ? null : keyById.get(id);

  const routes: KanbanPhaseSectionRoute[] = [];
  for (const section of sections) {
    const route = phase.sectionFlow[section.id];
    if (!route) continue;
    const branches = route.branches.flatMap((branch) => {
      const fieldCode = codeById.get(branch.fieldId);
      const to = target(branch.target);
      return fieldCode && to !== undefined
        ? [{ fieldCode, optionValue: branch.optionValue, checkboxValue: branch.checkboxValue, target: to }]
        : [];
    });
    const next = route.next === PHASE_SECTION_AUTO ? undefined : target(route.next);
    if (next === undefined && branches.length === 0) continue;
    routes.push({
      section: keyById.get(section.id) as string,
      ...(next !== undefined ? { next } : {}),
      branches,
    });
  }
  return routes.length > 0 ? routes : null;
}

// ── Edição ───────────────────────────────────────────────────────────────────

/** Troca o caminho de uma seção; o caminho padrão sem ramificação some do rascunho. */
export function setSectionRoute(
  flow: DraftPhaseSectionFlow,
  sectionId: string,
  route: DraftPhaseSectionRoute,
): DraftPhaseSectionFlow {
  const next = { ...flow };
  if (route.next === PHASE_SECTION_AUTO && route.branches.length === 0) delete next[sectionId];
  else next[sectionId] = route;
  return next;
}

/** Tira uma seção removida do caminho: setas para ela voltam ao padrão ou somem. */
export function removeSectionFromFlow(flow: DraftPhaseSectionFlow, sectionId: string): DraftPhaseSectionFlow {
  const next: DraftPhaseSectionFlow = {};
  for (const [id, route] of Object.entries(flow)) {
    if (id === sectionId) continue;
    const cleaned = {
      next: route.next === sectionId ? PHASE_SECTION_AUTO : route.next,
      branches: route.branches.filter((branch) => branch.target !== sectionId),
    };
    if (cleaned.next !== PHASE_SECTION_AUTO || cleaned.branches.length > 0) next[id] = cleaned;
  }
  return next;
}

/**
 * Primeiro problema do caminho que impede salvar (o backend recusa referência quebrada), ou null:
 * seta para seção removida, ramificação por campo que saiu da seção ou por opção que não existe.
 */
export function phaseSectionFlowIssue(phase: DraftKanbanPhase): string | null {
  const sections = groupPhaseFormSections(phase.fields);
  const ids = new Set(sections.map((section) => section.id));
  const phaseName = phase.label || 'sem nome';
  for (const [index, section] of sections.entries()) {
    const route = phase.sectionFlow[section.id];
    if (!route) continue;
    const name = section.title || (section.titleFieldId ? `Seção ${index + 1}` : 'Início');
    const exists = (target: string) => target === PHASE_SECTION_END || ids.has(target);
    if (route.next !== PHASE_SECTION_AUTO && !exists(route.next)) {
      return `No formulário da fase "${phaseName}", a seção "${name}" leva a uma seção que não existe mais.`;
    }
    for (const branch of route.branches) {
      const field = section.fields.find((candidate) => candidate.id === branch.fieldId);
      if (!field || !BRANCH_FIELD_TYPES.has(field.fieldType)) {
        return `No formulário da fase "${phaseName}", uma regra da seção "${name}" usa um campo que não está mais nela.`;
      }
      if (
        field.fieldType !== 'checkbox' &&
        !phaseBranchOptions(field).some((option) => option.optionValue === branch.optionValue)
      ) {
        return `No formulário da fase "${phaseName}", uma regra da seção "${name}" usa uma opção que não existe mais no campo "${field.label || field.code}".`;
      }
      if (!exists(branch.target)) {
        return `No formulário da fase "${phaseName}", uma regra da seção "${name}" leva a uma seção que não existe mais.`;
      }
    }
  }
  return null;
}

// ── Caminho no card ──────────────────────────────────────────────────────────

function branchMatches(fieldType: string, branch: { optionValue: string | null; checkboxValue: boolean | null }, value: unknown) {
  if (branch.checkboxValue !== null) return Boolean(value) === branch.checkboxValue;
  if (branch.optionValue === null) return false;
  if (fieldType === 'multi_select') return Array.isArray(value) && value.includes(branch.optionValue);
  return String(value ?? '') === branch.optionValue;
}

/**
 * Ids dos campos (títulos inclusive) que ficam no caminho com as respostas atuais. Sem caminho
 * configurado, todos. Campo da ramificação ainda sem resposta segue o caminho padrão.
 */
export function reachablePhaseFieldIds(
  phase: Pick<KanbanPhase, 'fields' | 'sectionFlow'>,
  valueOf: (field: KanbanPhaseField) => unknown,
): Set<string> {
  const ordered = [...phase.fields].sort((a, b) => a.order - b.order);
  type Section = { key: string; fields: KanbanPhaseField[] };
  const sections: Section[] = [];
  for (const field of ordered) {
    if (field.fieldType === 'title') {
      sections.push({ key: field.code, fields: [field] });
    } else if (sections.length === 0) {
      sections.push({ key: PHASE_START_SECTION, fields: [field] });
    } else {
      sections[sections.length - 1].fields.push(field);
    }
  }
  const routes = phase.sectionFlow ?? [];
  if (routes.length === 0) return new Set(ordered.map((field) => field.id));

  const indexOf = new Map(sections.map((section, index) => [section.key, index]));
  const routeOf = new Map(routes.map((route) => [route.section, route]));
  const reachable = new Set<string>();
  const visited = new Set<string>();
  let index: number | undefined = sections.length > 0 ? 0 : undefined;
  while (index !== undefined && !visited.has(sections[index].key)) {
    const section = sections[index];
    visited.add(section.key);
    section.fields.forEach((field) => reachable.add(field.id));

    const route = routeOf.get(section.key);
    let next: string | null | undefined;
    for (const branch of route?.branches ?? []) {
      const field = section.fields.find((candidate) => candidate.code === branch.fieldCode);
      if (field && branchMatches(field.fieldType, branch, valueOf(field))) {
        next = branch.target;
        break;
      }
    }
    if (next === undefined) {
      next = route && route.next !== undefined ? route.next : (sections[index + 1]?.key ?? null);
    }
    index = next === null ? undefined : indexOf.get(next);
  }
  return reachable;
}

// ── Mapa ─────────────────────────────────────────────────────────────────────

function toBuilderField(field: DraftKanbanPhaseField): DraftField {
  return {
    id: field.id,
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    isSensitive: false,
    options: field.options.map((option, index) => ({
      id: `${field.id}_${index}`,
      internalValue: option.value,
      displayLabel: option.label,
    })),
    settingsJson: field.settingsJson,
    conditionsJson: {},
    visibilityRules: null,
  };
}

/**
 * As seções da fase no formato do canvas do formulário de abertura (SectionFlowCanvas), com o
 * caminho padrão resolvido em seta de verdade. Posição não é guardada: o canvas abre sempre na
 * disposição por caminho (organizeSectionFlow).
 */
export function phaseSectionsForCanvas(phase: DraftKanbanPhase): DraftSection[] {
  const sections = groupPhaseFormSections(phase.fields);
  const nextOf = (index: number): string | null => {
    const next = phase.sectionFlow[sections[index].id]?.next ?? PHASE_SECTION_AUTO;
    if (next === PHASE_SECTION_AUTO) return sections[index + 1]?.id ?? null;
    return next === PHASE_SECTION_END ? null : next;
  };

  const canvasSections: DraftSection[] = sections.map((section, index) => {
    const route = phase.sectionFlow[section.id];
    const nextSectionId = nextOf(index);
    return {
      id: section.id,
      serverId: null,
      title: section.title || (section.id === UNTITLED_SECTION_ID ? 'Início' : ''),
      description: '',
      nextSectionId,
      nextIsSubmit: nextSectionId === null,
      flowPositionX: null,
      flowPositionY: null,
      branches: (route?.branches ?? []).map((branch, branchIndex) => ({
        id: `${section.id}_${branchIndex}`,
        fieldCode: section.fields.find((field) => field.id === branch.fieldId)?.code ?? null,
        optionValue: branch.optionValue,
        checkboxValue: branch.checkboxValue,
        targetSectionId: branch.target === PHASE_SECTION_END ? null : branch.target,
        targetIsSubmit: branch.target === PHASE_SECTION_END,
      })),
      fields: section.fields.map(toBuilderField),
    };
  });

  const positions = organizeSectionFlow(canvasSections);
  return canvasSections.map((section) => {
    const position = positions.get(section.id);
    return { ...section, flowPositionX: position?.x ?? null, flowPositionY: position?.y ?? null };
  });
}
