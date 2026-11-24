import { makeLocalId, newDraftField } from './phase-draft';
import type { DraftKanbanPhaseField } from '../types';

/**
 * Seções do formulário de uma fase. Os campos de fase são uma lista plana; no mapa do processo
 * cada campo "Título" abre uma seção, e o que vem antes do primeiro título é uma seção sem título.
 * Assim a fase ganha seções sem mudar o que o backend guarda (o card mostra o título como cabeçalho).
 */
export type PhaseFormSection = {
  /** Id do campo "Título" da seção; null para a seção inicial sem título. */
  id: string;
  titleFieldId: string | null;
  title: string;
  /** Campos da seção, sem o título. */
  fields: DraftKanbanPhaseField[];
};

export const UNTITLED_SECTION_ID = 'sem-titulo';

export function groupPhaseFormSections(fields: DraftKanbanPhaseField[]): PhaseFormSection[] {
  const sections: PhaseFormSection[] = [];
  let current: PhaseFormSection | null = null;
  for (const field of fields) {
    if (field.fieldType === 'title') {
      current = { id: field.id, titleFieldId: field.id, title: field.label, fields: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: UNTITLED_SECTION_ID, titleFieldId: null, title: '', fields: [] };
      sections.push(current);
    }
    current.fields.push(field);
  }
  return sections;
}

/** Junta as seções de volta numa lista plana, na ordem das seções. */
export function flattenPhaseFormSections(
  sections: PhaseFormSection[],
  allFields: DraftKanbanPhaseField[],
): DraftKanbanPhaseField[] {
  const byId = new Map(allFields.map((field) => [field.id, field]));
  return sections.flatMap((section) => {
    const title = section.titleFieldId ? byId.get(section.titleFieldId) : undefined;
    return title ? [title, ...section.fields] : section.fields;
  });
}

/** Próximo código livre no padrão `campo_N`. */
export function nextPhaseFieldPosition(fields: DraftKanbanPhaseField[]): number {
  const used = new Set(fields.map((field) => field.code));
  let position = fields.length + 1;
  while (used.has(`campo_${position}`)) position += 1;
  return position;
}

/** Acrescenta uma seção (um campo "Título") ao fim do formulário e devolve os campos e o id dela. */
export function appendPhaseFormSection(
  fields: DraftKanbanPhaseField[],
  title: string,
): { fields: DraftKanbanPhaseField[]; sectionId: string } {
  const titleField: DraftKanbanPhaseField = {
    ...newDraftField(nextPhaseFieldPosition(fields)),
    id: makeLocalId('field'),
    fieldType: 'title',
    label: title,
  };
  return { fields: [...fields, titleField], sectionId: titleField.id };
}

/** Troca os campos (sem o título) de uma seção, mantendo as outras como estão. */
export function replaceSectionFields(
  fields: DraftKanbanPhaseField[],
  sectionId: string,
  nextSectionFields: DraftKanbanPhaseField[],
): DraftKanbanPhaseField[] {
  const sections = groupPhaseFormSections(fields).map((section) =>
    section.id === sectionId ? { ...section, fields: nextSectionFields } : section,
  );
  // Seção sem título que ainda não existia (formulário vazio): entra no começo.
  if (sectionId === UNTITLED_SECTION_ID && !sections.some((s) => s.id === UNTITLED_SECTION_ID)) {
    sections.unshift({ id: UNTITLED_SECTION_ID, titleFieldId: null, title: '', fields: nextSectionFields });
  }
  return flattenPhaseFormSections(sections, fields);
}

/** Remove a seção inteira: o título e os campos dela. */
export function removePhaseFormSection(
  fields: DraftKanbanPhaseField[],
  sectionId: string,
): DraftKanbanPhaseField[] {
  const sections = groupPhaseFormSections(fields).filter((section) => section.id !== sectionId);
  return flattenPhaseFormSections(sections, fields);
}

/** Move uma seção (com os campos) uma posição para frente ou para trás. */
export function movePhaseFormSection(
  fields: DraftKanbanPhaseField[],
  sectionId: string,
  delta: -1 | 1,
): DraftKanbanPhaseField[] {
  const sections = groupPhaseFormSections(fields);
  const index = sections.findIndex((section) => section.id === sectionId);
  const target = index + delta;
  // A seção sem título é sempre a primeira: nada passa à frente dela nem ela sai do lugar.
  if (index < 0 || target < 0 || target >= sections.length) return fields;
  if (sections[index].titleFieldId === null || sections[target].titleFieldId === null) return fields;
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return flattenPhaseFormSections(sections, fields);
}
