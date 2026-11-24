import { describe, expect, it } from 'vitest';
import { builderReducer, makeInitialState, type BuilderAction } from '../builder-reducer';
import type { BuilderState } from '../builder-reducer';

function reduce(state: BuilderState, action: BuilderAction) {
  return builderReducer(state, action);
}

function freshState() {
  return makeInitialState();
}

// ── RESET_DRAFT ───────────────────────────────────────────────────────────────

describe('RESET_DRAFT', () => {
  it('restores initial draft and clears selection', () => {
    const base = freshState();
    const dirty = reduce(base, { type: 'SET_DRAFT_FIELD', key: 'name', value: 'changed' });
    const result = reduce(dirty, { type: 'RESET_DRAFT' });

    expect(result.draft.name).toBe('');
    expect(result.isDirty).toBe(false);
    expect(result.mode).toBe('create');
    expect(result.selectedSectionId).toBeNull();
    expect(result.validationErrors).toBeNull();
  });
});

// ── SET_DRAFT_FIELD ───────────────────────────────────────────────────────────

describe('SET_DRAFT_FIELD', () => {
  it('updates a top-level draft string field and marks dirty', () => {
    const state = reduce(freshState(), { type: 'SET_DRAFT_FIELD', key: 'name', value: 'Meu Form' });
    expect(state.draft.name).toBe('Meu Form');
    expect(state.isDirty).toBe(true);
  });

  it('updates a boolean field', () => {
    const state = reduce(freshState(), {
      type: 'SET_DRAFT_FIELD',
      key: 'googleSheetsEnabled',
      value: true,
    });
    expect(state.draft.googleSheetsEnabled).toBe(true);
  });
});

// ── ADD_SECTION ───────────────────────────────────────────────────────────────

describe('ADD_SECTION', () => {
  it('appends a new section with a unique local ID', () => {
    const before = freshState();
    const after = reduce(before, { type: 'ADD_SECTION' });

    expect(after.draft.sections).toHaveLength(before.draft.sections.length + 1);
    const newSection = after.draft.sections[after.draft.sections.length - 1];
    expect(newSection.id).toBeTruthy();
    expect(newSection.id).not.toBe(before.draft.sections[0].id);
  });

  it('new section has at least one field', () => {
    const after = reduce(freshState(), { type: 'ADD_SECTION' });
    const newSection = after.draft.sections[after.draft.sections.length - 1];
    expect(newSection.fields.length).toBeGreaterThanOrEqual(1);
  });

  it('marks state as dirty', () => {
    const after = reduce(freshState(), { type: 'ADD_SECTION' });
    expect(after.isDirty).toBe(true);
  });
});

// ── SET_SECTION_FLOW ──────────────────────────────────────────────────────────

describe('SET_SECTION_FLOW', () => {
  it('replaces a section nextSectionId/nextIsSubmit/branches together', () => {
    const before = freshState();
    const sectionId = before.draft.sections[0].id;
    const branch = {
      id: 'branch-1',
      fieldCode: 'area',
      optionValue: 'financeiro',
      checkboxValue: null,
      targetSectionId: 'section-2',
      targetIsSubmit: false,
    };

    const after = reduce(before, {
      type: 'SET_SECTION_FLOW',
      sectionId,
      nextSectionId: 'section-3',
      nextIsSubmit: false,
      branches: [branch],
    });

    expect(after.draft.sections[0].nextSectionId).toBe('section-3');
    expect(after.draft.sections[0].nextIsSubmit).toBe(false);
    expect(after.draft.sections[0].branches).toEqual([branch]);
    expect(after.isDirty).toBe(true);
  });
});

// ── SET_SECTION_FLOW_POSITION ─────────────────────────────────────────────────

describe('SET_SECTION_FLOW_POSITION', () => {
  it('grava a posição arrastada e marca sujo — é o que faz "organizar e sair" persistir', () => {
    const before = freshState();
    const sectionId = before.draft.sections[0].id;

    const after = reduce(before, {
      type: 'SET_SECTION_FLOW_POSITION',
      sectionId,
      x: 480,
      y: 260,
    });

    expect(after.draft.sections[0].flowPositionX).toBe(480);
    expect(after.draft.sections[0].flowPositionY).toBe(260);
    expect(after.isDirty).toBe(true);
  });

  it('só mexe na seção arrastada, as outras ficam como estavam', () => {
    let state = reduce(freshState(), { type: 'ADD_SECTION' });
    const [sectionA, sectionB] = state.draft.sections;

    state = reduce(state, { type: 'SET_SECTION_FLOW_POSITION', sectionId: sectionA.id, x: 10, y: 20 });

    expect(state.draft.sections[0].flowPositionX).toBe(10);
    expect(state.draft.sections[1].id).toBe(sectionB.id);
    expect(state.draft.sections[1].flowPositionX).toBeNull();
  });
});

// ── REMOVE_SECTION (orphan cleanup) ───────────────────────────────────────────

describe('REMOVE_SECTION orphan cleanup', () => {
  it('nulls out nextSectionId and branch targets that pointed at the removed section', () => {
    let state = freshState();
    state = reduce(state, { type: 'ADD_SECTION' });
    const [sectionA, sectionB] = state.draft.sections;

    state = reduce(state, {
      type: 'SET_SECTION_FLOW',
      sectionId: sectionA.id,
      nextSectionId: sectionB.id,
      nextIsSubmit: false,
      branches: [
        {
          id: 'branch-1',
          fieldCode: 'area',
          optionValue: 'financeiro',
          checkboxValue: null,
          targetSectionId: sectionB.id,
          targetIsSubmit: false,
        },
      ],
    });

    const after = reduce(state, { type: 'REMOVE_SECTION', sectionId: sectionB.id });

    expect(after.draft.sections).toHaveLength(1);
    expect(after.draft.sections[0].nextSectionId).toBeNull();
    expect(after.draft.sections[0].branches[0].targetSectionId).toBeNull();
  });
});

// ── REMOVE_SECTION ────────────────────────────────────────────────────────────

describe('REMOVE_SECTION', () => {
  it('removes the section by id', () => {
    const base = reduce(freshState(), { type: 'ADD_SECTION' });
    const idToRemove = base.draft.sections[1].id;
    const after = reduce(base, { type: 'REMOVE_SECTION', sectionId: idToRemove });

    expect(after.draft.sections).toHaveLength(1);
    expect(after.draft.sections.find((s) => s.id === idToRemove)).toBeUndefined();
  });

  it('does not remove if only one section remains', () => {
    const base = freshState();
    expect(base.draft.sections).toHaveLength(1);
    const after = reduce(base, { type: 'REMOVE_SECTION', sectionId: base.draft.sections[0].id });
    expect(after.draft.sections).toHaveLength(1);
  });
});

// ── REORDER_SECTIONS ──────────────────────────────────────────────────────────

describe('REORDER_SECTIONS', () => {
  it('swaps two sections correctly', () => {
    let state = freshState();
    state = reduce(state, { type: 'ADD_SECTION' });
    state = reduce(state, { type: 'ADD_SECTION' });
    expect(state.draft.sections).toHaveLength(3);

    const [id0, id1, id2] = state.draft.sections.map((s) => s.id);
    const after = reduce(state, { type: 'REORDER_SECTIONS', fromIndex: 0, toIndex: 2 });

    expect(after.draft.sections[0].id).toBe(id1);
    expect(after.draft.sections[1].id).toBe(id2);
    expect(after.draft.sections[2].id).toBe(id0);
  });
});

// ── ADD_FIELD ─────────────────────────────────────────────────────────────────

describe('ADD_FIELD', () => {
  it('appends a field to the target section', () => {
    const base = freshState();
    const sectionId = base.draft.sections[0].id;
    const before = base.draft.sections[0].fields.length;
    const after = reduce(base, { type: 'ADD_FIELD', sectionId, fieldType: 'email' });

    expect(after.draft.sections[0].fields).toHaveLength(before + 1);
    expect(after.draft.sections[0].fields[before].fieldType).toBe('email');
  });

  it('generates a unique fieldCode across all sections', () => {
    let state = freshState();
    // Add a field with default label ('Texto Curto') to section 0
    const sectionId = state.draft.sections[0].id;
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'short_text' });
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'short_text' });

    const codes = state.draft.sections[0].fields.map((f) => f.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});

// ── REMOVE_FIELD ──────────────────────────────────────────────────────────────

describe('REMOVE_FIELD', () => {
  it('removes a field from the section', () => {
    let state = freshState();
    const sectionId = state.draft.sections[0].id;
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'email' });
    expect(state.draft.sections[0].fields).toHaveLength(2);

    const fieldId = state.draft.sections[0].fields[1].id;
    const after = reduce(state, { type: 'REMOVE_FIELD', sectionId, fieldId });
    expect(after.draft.sections[0].fields).toHaveLength(1);
    expect(after.draft.sections[0].fields.find((f) => f.id === fieldId)).toBeUndefined();
  });

  it('does not remove if only one field remains in section', () => {
    const base = freshState();
    const sectionId = base.draft.sections[0].id;
    expect(base.draft.sections[0].fields).toHaveLength(1);
    const fieldId = base.draft.sections[0].fields[0].id;
    const after = reduce(base, { type: 'REMOVE_FIELD', sectionId, fieldId });
    expect(after.draft.sections[0].fields).toHaveLength(1);
  });

  it('maintains other sections unchanged', () => {
    let state = reduce(freshState(), { type: 'ADD_SECTION' });
    const section0Id = state.draft.sections[0].id;
    const section1Id = state.draft.sections[1].id;
    state = reduce(state, { type: 'ADD_FIELD', sectionId: section0Id, fieldType: 'email' });
    const s1FieldCount = state.draft.sections[1].fields.length;

    const fieldToRemove = state.draft.sections[0].fields[1].id;
    const after = reduce(state, {
      type: 'REMOVE_FIELD',
      sectionId: section0Id,
      fieldId: fieldToRemove,
    });
    expect(after.draft.sections.find((s) => s.id === section1Id)?.fields).toHaveLength(
      s1FieldCount,
    );
  });
});

// ── UPDATE_FIELD ──────────────────────────────────────────────────────────────

describe('UPDATE_FIELD', () => {
  it('regenerates code when label changes', () => {
    const base = freshState();
    const sectionId = base.draft.sections[0].id;
    const fieldId = base.draft.sections[0].fields[0].id;

    const after = reduce(base, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'label',
      value: 'Email Corporativo',
    });
    expect(after.draft.sections[0].fields[0].label).toBe('Email Corporativo');
    expect(after.draft.sections[0].fields[0].code).toBe('email_corporativo');
  });

  it('caps the generated code well under the backend 120-char limit, even for a long label', () => {
    // A label is often a whole question, not a word (e.g. "A granja respeita a distância
    // mínima exigida..."). Without a cap, a long label produced a code over the backend's
    // 120-char limit (CreateFormFieldDto.code), and saving the form failed outright with a
    // validation error that made no sense to someone who only typed a label, not a code.
    const base = freshState();
    const sectionId = base.draft.sections[0].id;
    const fieldId = base.draft.sections[0].fields[0].id;
    const longLabel =
      'A granja respeita a distancia minima exigida pela legislação vigente em relação a ' +
      'abatedouros, fabrica de ração, incubatorios ou granjas reprodutoras?';
    expect(longLabel.length).toBeGreaterThan(120);

    const after = reduce(base, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'label',
      value: longLabel,
    });

    const code = after.draft.sections[0].fields[0].code;
    expect(code.length).toBeLessThanOrEqual(80);
    expect(code).not.toMatch(/_$/);
  });

  it('clears options when switching from select to non-select type', () => {
    let state = freshState();
    const sectionId = state.draft.sections[0].id;
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'single_select' });
    const fieldId = state.draft.sections[0].fields[1].id;

    // Set some options first
    state = reduce(state, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'options',
      value: [
        { id: 'opt_1', internalValue: 'sim', displayLabel: 'Sim' },
        { id: 'opt_2', internalValue: 'nao', displayLabel: 'Não' },
      ],
    });
    expect(state.draft.sections[0].fields[1].options).toHaveLength(2);

    // Change type to short_text
    const after = reduce(state, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'fieldType',
      value: 'short_text',
    });
    expect(after.draft.sections[0].fields[1].options).toHaveLength(0);
    expect(after.draft.sections[0].fields[1].fieldType).toBe('short_text');
  });

  it('sets required to false for display-only field types', () => {
    const base = freshState();
    const sectionId = base.draft.sections[0].id;
    const fieldId = base.draft.sections[0].fields[0].id;
    // First set required true
    let state = reduce(base, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'required',
      value: true,
    });
    expect(state.draft.sections[0].fields[0].required).toBe(true);
    // Now switch to title type
    state = reduce(state, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'fieldType',
      value: 'title',
    });
    expect(state.draft.sections[0].fields[0].required).toBe(false);
  });

  it('marks state as dirty', () => {
    const base = freshState();
    const sectionId = base.draft.sections[0].id;
    const fieldId = base.draft.sections[0].fields[0].id;
    const after = reduce(base, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId,
      key: 'required',
      value: true,
    });
    expect(after.isDirty).toBe(true);
  });
});

// ── SET_VALIDATION_ERRORS ─────────────────────────────────────────────────────

describe('SET_VALIDATION_ERRORS', () => {
  it('stores validation errors in state', () => {
    const after = reduce(freshState(), {
      type: 'SET_VALIDATION_ERRORS',
      errors: { name: 'Required' },
    });
    expect(after.validationErrors?.name).toBe('Required');
  });

  it('can clear validation errors', () => {
    let state = reduce(freshState(), {
      type: 'SET_VALIDATION_ERRORS',
      errors: { name: 'Required' },
    });
    state = reduce(state, { type: 'SET_VALIDATION_ERRORS', errors: null });
    expect(state.validationErrors).toBeNull();
  });
});

// ── SELECT_SECTION / SELECT_FIELD ─────────────────────────────────────────────

describe('SELECT_SECTION and SELECT_FIELD', () => {
  it('sets selectedSectionId', () => {
    const sectionId = freshState().draft.sections[0].id;
    const after = reduce(freshState(), { type: 'SELECT_SECTION', sectionId });
    expect(after.selectedSectionId).toBe(sectionId);
  });

  it('sets selectedFieldId', () => {
    const fieldId = freshState().draft.sections[0].fields[0].id;
    const after = reduce(freshState(), { type: 'SELECT_FIELD', fieldId });
    expect(after.selectedFieldId).toBe(fieldId);
  });
});

// ── DUPLICATE_FIELD ───────────────────────────────────────────────────────────

describe('DUPLICATE_FIELD', () => {
  it('insere a cópia logo abaixo do original, com id e código novos', () => {
    let state = freshState();
    const sectionId = state.draft.sections[0].id;
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'single_select' });
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'number' });
    const original = state.draft.sections[0].fields[1];
    const withOption = reduce(state, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId: original.id,
      key: 'options',
      value: [{ id: 'opt-1', internalValue: 'a', displayLabel: 'A' }],
    });

    const result = reduce(withOption, {
      type: 'DUPLICATE_FIELD',
      sectionId,
      fieldId: original.id,
      newFieldId: 'copy-1',
    });
    const fields = result.draft.sections[0].fields;

    expect(fields).toHaveLength(4);
    expect(fields[2].id).toBe('copy-1');
    expect(fields[2].label).toBe(original.label);
    expect(fields[2].fieldType).toBe('single_select');
    expect(fields[2].code).not.toBe(original.code);
    expect(new Set(fields.map((f) => f.code)).size).toBe(fields.length);
    expect(fields[2].options).toHaveLength(1);
    expect(fields[2].options[0].internalValue).toBe('a');
    expect(fields[2].options[0].id).not.toBe('opt-1');
    expect(fields[3].fieldType).toBe('number');
    expect(result.isDirty).toBe(true);
  });

  it('não muda nada quando o campo não existe', () => {
    const state = freshState();
    const result = reduce(state, {
      type: 'DUPLICATE_FIELD',
      sectionId: state.draft.sections[0].id,
      fieldId: 'nope',
    });
    expect(result).toBe(state);
  });
});

describe('UPDATE_FIELD — associação da Tabela dinâmica do ERP acompanha o código', () => {
  function withTable() {
    let state = freshState();
    const sectionId = state.draft.sections[0].id;
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'number', fieldId: 'pedido' });
    state = reduce(state, { type: 'UPDATE_FIELD', sectionId, fieldId: 'pedido', key: 'label', value: 'Pedido id' });
    state = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'erp_table', fieldId: 'tabela' });
    state = reduce(state, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId: 'tabela',
      key: 'settingsJson',
      value: {
        parameterBindings: [
          { parameter: 'pedidoId', fieldCode: 'pedido_id' },
          { parameter: 'filial', fieldCode: 'outro' },
        ],
      },
    });
    return { state, sectionId };
  }
  const bindingsOf = (state: BuilderState) =>
    state.draft.sections[0].fields.find((f) => f.id === 'tabela')?.settingsJson.parameterBindings;

  it('renomear o campo do parâmetro troca o código também na associação', () => {
    const { state, sectionId } = withTable();
    const renamed = reduce(state, {
      type: 'UPDATE_FIELD',
      sectionId,
      fieldId: 'pedido',
      key: 'label',
      value: 'Número do pedido',
    });
    expect(renamed.draft.sections[0].fields.find((f) => f.id === 'pedido')?.code).toBe('numero_do_pedido');
    expect(bindingsOf(renamed)).toEqual([
      { parameter: 'pedidoId', fieldCode: 'numero_do_pedido' },
      { parameter: 'filial', fieldCode: 'outro' },
    ]);
  });

  it('mudar outra coisa do campo não mexe na associação', () => {
    const { state, sectionId } = withTable();
    const changed = reduce(state, { type: 'UPDATE_FIELD', sectionId, fieldId: 'pedido', key: 'required', value: true });
    expect(bindingsOf(changed)).toBe(bindingsOf(state));
  });
});

describe('ADD_FIELD / ADD_SECTION com id escolhido por quem dispara', () => {
  it('usa o fieldId recebido no campo novo', () => {
    const state = freshState();
    const sectionId = state.draft.sections[0].id;
    const result = reduce(state, { type: 'ADD_FIELD', sectionId, fieldType: 'email', fieldId: 'novo' });
    const fields = result.draft.sections[0].fields;
    expect(fields[fields.length - 1]).toMatchObject({ id: 'novo', fieldType: 'email' });
  });

  it('usa o sectionId recebido na seção nova', () => {
    const result = reduce(freshState(), { type: 'ADD_SECTION', sectionId: 'secao-nova' });
    expect(result.draft.sections[result.draft.sections.length - 1].id).toBe('secao-nova');
  });
});

describe('ORGANIZE_SECTION_FLOW', () => {
  it('reposiciona todas as seções sem sobreposição e marca sujo para salvar a disposição', () => {
    let state = reduce(freshState(), { type: 'ADD_SECTION' });
    state = reduce(state, { type: 'ADD_SECTION' });
    // As três empilhadas no mesmo ponto, como depois de arrastar uma para cima da outra.
    for (const section of state.draft.sections) {
      state = reduce(state, { type: 'SET_SECTION_FLOW_POSITION', sectionId: section.id, x: 50, y: 50 });
    }
    state = { ...state, isDirty: false };

    const after = reduce(state, { type: 'ORGANIZE_SECTION_FLOW' });

    const spots = after.draft.sections.map((s) => `${s.flowPositionX},${s.flowPositionY}`);
    expect(new Set(spots).size).toBe(after.draft.sections.length);
    // Seção nova não está ligada a nada (cada uma envia): fica solta, empilhada abaixo da primeira.
    expect(after.draft.sections.map((s) => [s.flowPositionX, s.flowPositionY])).toEqual([
      [0, 120],
      [0, 420],
      [0, 720],
    ]);
    expect(after.isDirty).toBe(true);
  });
});

describe('ADD_FIELD — Pontuação da seção', () => {
  it('nasce com o nome da seção, para não repetir o nome em relatórios', () => {
    const state = freshState();
    const section = state.draft.sections[0];
    const named = { ...state, draft: { ...state.draft, sections: [{ ...section, title: 'Água e Alimentação' }] } };

    const after = reduce(named, { type: 'ADD_FIELD', sectionId: section.id, fieldType: 'section_score' });

    const added = after.draft.sections[0].fields.at(-1);
    expect(added?.label).toBe('Pontuação (%) — Água e Alimentação');
    expect(added?.fieldType).toBe('calculated');
    expect(added?.settingsJson.scoreMode).toBe('section');
  });
});
