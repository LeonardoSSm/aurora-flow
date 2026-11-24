import { describe, expect, it } from 'vitest';
import {
  PHASE_SECTION_AUTO,
  PHASE_SECTION_END,
  type DraftKanbanPhase,
  type DraftKanbanPhaseField,
  type KanbanPhase,
  type KanbanPhaseField,
} from '../types';
import { draftSaveIssue, toDraft, toSavePayload } from './phase-draft';
import {
  PHASE_START_SECTION,
  phaseSectionFlowIssue,
  phaseSectionsForCanvas,
  reachablePhaseFieldIds,
  removeSectionFromFlow,
  setSectionRoute,
} from './phase-section-flow';

/** Cotação: o tipo decide entre importação e direto para o fechamento. */
function serverFields(): KanbanPhaseField[] {
  return [
    {
      id: 'f-tipo',
      code: 'tipo',
      label: 'Tipo',
      fieldType: 'single_select',
      required: true,
      order: 0,
      settingsJson: null,
      optionsJson: [
        { value: 'nacional', label: 'Nacional' },
        { value: 'importacao', label: 'Importação' },
      ],
    },
    { id: 'f-sec-imp', code: 'sec_importacao', label: 'Importação', fieldType: 'title', required: false, order: 1, settingsJson: null, optionsJson: null },
    { id: 'f-incoterm', code: 'incoterm', label: 'Incoterm', fieldType: 'short_text', required: true, order: 2, settingsJson: null, optionsJson: null },
    { id: 'f-sec-fim', code: 'sec_fechamento', label: 'Fechamento', fieldType: 'title', required: false, order: 3, settingsJson: null, optionsJson: null },
    { id: 'f-valor', code: 'valor', label: 'Valor', fieldType: 'currency', required: true, order: 4, settingsJson: null, optionsJson: null },
  ];
}

const serverFlow = [
  {
    section: PHASE_START_SECTION,
    next: 'sec_fechamento',
    branches: [{ fieldCode: 'tipo', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' }],
  },
];

function serverPhase(overrides: Partial<KanbanPhase> = {}): KanbanPhase {
  return {
    id: 'p-cot',
    formId: 'form-1',
    key: 'cotacao',
    label: 'Cotação',
    color: 'blue',
    description: null,
    order: 1,
    isTerminal: false,
    actorRoleCode: null,
    requiresApproval: false,
    approverRoleCode: null,
    fields: serverFields(),
    sectionFlow: serverFlow,
    ...overrides,
  };
}

function draftPhase(): DraftKanbanPhase {
  return toDraft([serverPhase()])[0];
}

describe('caminho do formulário da fase — rascunho', () => {
  it('vem do servidor por id e volta pelo código, igual', () => {
    const draft = draftPhase();
    expect(draft.sectionFlow).toEqual({
      'sem-titulo': {
        next: 'f-sec-fim',
        branches: [{ fieldId: 'f-tipo', optionValue: 'importacao', checkboxValue: null, target: 'f-sec-imp' }],
      },
    });
    expect(toSavePayload([draft])[0].sectionFlow).toEqual(serverFlow);
  });

  it('renomear o código do título não quebra a seta', () => {
    const draft = draftPhase();
    draft.fields = draft.fields.map((field) => (field.id === 'f-sec-fim' ? { ...field, code: 'fechamento' } : field));
    expect(toSavePayload([draft])[0].sectionFlow?.[0].next).toBe('fechamento');
  });

  it('sem nada além do padrão vai como null', () => {
    const draft = { ...draftPhase(), sectionFlow: {} };
    expect(toSavePayload([draft])[0].sectionFlow).toBeNull();
  });

  it('caminho padrão sem ramificação some do rascunho', () => {
    const flow = setSectionRoute({}, 'f-sec-imp', { next: PHASE_SECTION_AUTO, branches: [] });
    expect(flow).toEqual({});
    expect(setSectionRoute({}, 'f-sec-imp', { next: PHASE_SECTION_END, branches: [] })).toEqual({
      'f-sec-imp': { next: PHASE_SECTION_END, branches: [] },
    });
  });

  it('remover uma seção tira as setas que chegavam nela', () => {
    const draft = draftPhase();
    expect(removeSectionFromFlow(draft.sectionFlow, 'f-sec-imp')).toEqual({
      'sem-titulo': { next: 'f-sec-fim', branches: [] },
    });
    expect(removeSectionFromFlow(draft.sectionFlow, 'f-sec-fim')).toEqual({
      'sem-titulo': {
        next: PHASE_SECTION_AUTO,
        branches: [{ fieldId: 'f-tipo', optionValue: 'importacao', checkboxValue: null, target: 'f-sec-imp' }],
      },
    });
  });

  it('acusa regra quebrada antes de salvar', () => {
    const draft = draftPhase();
    expect(phaseSectionFlowIssue(draft)).toBeNull();

    const semOpcao = {
      ...draft,
      fields: draft.fields.map((field): DraftKanbanPhaseField =>
        field.id === 'f-tipo' ? { ...field, options: [{ value: 'nacional', label: 'Nacional' }] } : field,
      ),
    };
    expect(phaseSectionFlowIssue(semOpcao)).toMatch(/opção que não existe mais no campo "Tipo"/);
    expect(draftSaveIssue([semOpcao])).toMatch(/opção que não existe mais/);

    const semSecao = { ...draft, sectionFlow: { 'sem-titulo': { next: 'sumiu', branches: [] } } };
    expect(phaseSectionFlowIssue(semSecao)).toMatch(/seção "Início" leva a uma seção que não existe mais/);
  });
});

describe('caminho do formulário da fase — card', () => {
  const visible = (values: Record<string, unknown>) =>
    [...reachablePhaseFieldIds(serverPhase(), (field) => values[field.code])];

  it('mostra só as seções do caminho escolhido', () => {
    expect(visible({ tipo: 'importacao' })).toEqual(['f-tipo', 'f-sec-imp', 'f-incoterm', 'f-sec-fim', 'f-valor']);
    expect(visible({ tipo: 'nacional' })).toEqual(['f-tipo', 'f-sec-fim', 'f-valor']);
    expect(visible({})).toEqual(['f-tipo', 'f-sec-fim', 'f-valor']);
  });

  it('sem caminho configurado mostra tudo', () => {
    const ids = reachablePhaseFieldIds(serverPhase({ sectionFlow: null }), () => null);
    expect(ids.size).toBe(5);
  });
});

describe('caminho do formulário da fase — mapa', () => {
  it('vira seções do canvas com o caminho padrão resolvido e a ramificação', () => {
    const sections = phaseSectionsForCanvas(draftPhase());
    expect(sections.map((s) => [s.title, s.nextSectionId, s.nextIsSubmit])).toEqual([
      ['Início', 'f-sec-fim', false],
      ['Importação', 'f-sec-fim', false],
      ['Fechamento', null, true],
    ]);
    // Importação é desvio: fica numa coluna entre o Início e o Fechamento, uma linha abaixo do
    // caminho padrão (Início → Fechamento), para a seta não passar por trás dela.
    expect(sections.map((s) => [s.flowPositionX, s.flowPositionY])).toEqual([
      [0, 120],
      [350, 420],
      [700, 120],
    ]);
    expect(sections[0].branches).toEqual([
      expect.objectContaining({ fieldCode: 'tipo', optionValue: 'importacao', targetSectionId: 'f-sec-imp' }),
    ]);
  });
});
