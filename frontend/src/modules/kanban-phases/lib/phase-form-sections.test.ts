import { describe, expect, it } from 'vitest';
import type { DraftKanbanPhaseField } from '../types';
import {
  appendPhaseFormSection,
  groupPhaseFormSections,
  movePhaseFormSection,
  nextPhaseFieldPosition,
  removePhaseFormSection,
  replaceSectionFields,
  UNTITLED_SECTION_ID,
} from './phase-form-sections';

function field(id: string, fieldType: DraftKanbanPhaseField['fieldType'] = 'short_text', label = id): DraftKanbanPhaseField {
  return { id, serverId: null, code: id, label, fieldType, required: false, settingsJson: {}, options: [] };
}

describe('phase-form-sections', () => {
  const fields = [field('a'), field('t1', 'title', 'Dados'), field('b'), field('t2', 'title', 'Fotos'), field('c')];

  it('agrupa por título, com seção inicial sem título', () => {
    const sections = groupPhaseFormSections(fields);
    expect(sections.map((s) => [s.id, s.title, s.fields.map((f) => f.id)])).toEqual([
      [UNTITLED_SECTION_ID, '', ['a']],
      ['t1', 'Dados', ['b']],
      ['t2', 'Fotos', ['c']],
    ]);
  });

  it('formulário vazio não tem seção', () => {
    expect(groupPhaseFormSections([])).toEqual([]);
  });

  it('acrescenta seção ao fim com código livre', () => {
    const { fields: next, sectionId } = appendPhaseFormSection([field('campo_2')], 'Nova seção');
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: sectionId, fieldType: 'title', label: 'Nova seção', code: 'campo_3' });
    expect(nextPhaseFieldPosition([field('campo_1'), field('campo_2')])).toBe(3);
  });

  it('troca os campos de uma seção sem mexer nas outras', () => {
    const next = replaceSectionFields(fields, 't1', [field('b'), field('d')]);
    expect(next.map((f) => f.id)).toEqual(['a', 't1', 'b', 'd', 't2', 'c']);
  });

  it('cria a seção sem título quando ainda não existe', () => {
    const next = replaceSectionFields([field('t1', 'title')], UNTITLED_SECTION_ID, [field('x')]);
    expect(next.map((f) => f.id)).toEqual(['x', 't1']);
  });

  it('remove a seção com os campos', () => {
    expect(removePhaseFormSection(fields, 't1').map((f) => f.id)).toEqual(['a', 't2', 'c']);
  });

  it('move seções com título; a sem título fica no começo', () => {
    expect(movePhaseFormSection(fields, 't2', -1).map((f) => f.id)).toEqual(['a', 't2', 'c', 't1', 'b']);
    expect(movePhaseFormSection(fields, 't1', -1)).toBe(fields);
  });
});
