import {
  branchFieldsByCode,
  branchOrphanReason,
  buildSectionFlowGraph,
  countOrphanedRules,
  organizeSectionFlow,
  type SectionFlowNodeData,
  TERMINAL_NODE_ID,
} from '../section-flow-layout';
import type { DraftSection, DraftSectionBranch, DraftField } from '../../types';

function makeField(overrides: Partial<DraftField> = {}): DraftField {
  return {
    id: 'field-1',
    code: 'area',
    label: 'Área',
    fieldType: 'single_select',
    required: false,
    isSensitive: false,
    options: [],
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
    ...overrides,
  };
}

function makeBranch(overrides: Partial<DraftSectionBranch> = {}): DraftSectionBranch {
  return {
    id: 'branch-1',
    fieldCode: 'area',
    optionValue: 'financeiro',
    checkboxValue: null,
    targetSectionId: null,
    targetIsSubmit: true,
    ...overrides,
  };
}

function makeSection(overrides: Partial<DraftSection> = {}): DraftSection {
  return {
    id: 'section-1',
    serverId: null,
    title: 'Seção',
    description: '',
    nextSectionId: null,
    nextIsSubmit: true,
    flowPositionX: null,
    flowPositionY: null,
    branches: [],
    fields: [makeField()],
    ...overrides,
  };
}

describe('buildSectionFlowGraph', () => {
  it('creates one node per section plus a fixed terminal node', () => {
    const sections = [makeSection({ id: 's1' }), makeSection({ id: 's2' })];
    const { nodes } = buildSectionFlowGraph(sections);

    expect(nodes.map((n) => n.id)).toEqual(['s1', 's2', TERMINAL_NODE_ID]);
    expect(nodes[2].type).toBe('terminal');
  });

  it('draws a default edge to the terminal node when nextIsSubmit is true', () => {
    const sections = [makeSection({ id: 's1', nextIsSubmit: true })];
    const { edges } = buildSectionFlowGraph(sections);

    expect(edges).toContainEqual(
      expect.objectContaining({ source: 's1', target: TERMINAL_NODE_ID, data: { kind: 'default' } }),
    );
  });

  it('draws a rule edge labeled with the option display label, not its stable internal value', () => {
    const sections = [
      makeSection({
        id: 's1',
        nextIsSubmit: true,
        fields: [
          makeField({
            code: 'area',
            options: [{ id: 'o1', internalValue: 'financeiro', displayLabel: 'Financeiro' }],
          }),
        ],
        branches: [makeBranch({ targetSectionId: 's2', targetIsSubmit: false })],
      }),
      makeSection({ id: 's2' }),
    ];
    const { edges } = buildSectionFlowGraph(sections);

    expect(edges).toContainEqual(
      expect.objectContaining({
        source: 's1',
        target: 's2',
        data: { kind: 'rule', label: 'Financeiro' },
      }),
    );
  });

  it('flags a section as orphaned and excludes the edge when a branch targets a deleted section', () => {
    const sections = [
      makeSection({
        id: 's1',
        branches: [makeBranch({ targetSectionId: 'ghost-section', targetIsSubmit: false })],
      }),
    ];
    const { nodes, edges } = buildSectionFlowGraph(sections);

    expect(nodes[0].data.orphaned).toBe(true);
    expect(edges.some((e) => e.id === 'branch_branch-1')).toBe(false);
  });

  it('flags a section as orphaned when its own nextSectionId no longer resolves', () => {
    const sections = [
      makeSection({ id: 's1', nextIsSubmit: false, nextSectionId: 'ghost-section' }),
    ];
    const { nodes } = buildSectionFlowGraph(sections);

    expect(nodes[0].data.orphaned).toBe(true);
  });

  it('does not count an orphaned branch toward ruleCount', () => {
    const sections = [
      makeSection({
        id: 's1',
        fields: [
          makeField({ options: [{ id: 'o1', internalValue: 'financeiro', displayLabel: 'Financeiro' }] }),
        ],
        branches: [
          makeBranch({ id: 'b-valid', targetSectionId: 's2', targetIsSubmit: false }),
          makeBranch({ id: 'b-orphan', fieldCode: null }),
        ],
      }),
      makeSection({ id: 's2' }),
    ];
    const { nodes } = buildSectionFlowGraph(sections);

    expect(nodes[0].data.ruleCount).toBe(1);
    expect(nodes[0].data.orphaned).toBe(true);
  });
});

describe('buildSectionFlowGraph — posição no canvas', () => {
  it('sem posição salva, cai na linha reta pela ordem', () => {
    const sections = [makeSection({ id: 's1' }), makeSection({ id: 's2' })];
    const { nodes } = buildSectionFlowGraph(sections);

    expect(nodes[0].position).toEqual({ x: 0, y: 120 });
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x);
  });

  it('com posição salva, usa exatamente ela — não recalcula a linha reta', () => {
    const sections = [
      makeSection({ id: 's1', flowPositionX: 500, flowPositionY: 340 }),
      makeSection({ id: 's2' }),
    ];
    const { nodes } = buildSectionFlowGraph(sections);

    expect(nodes[0].position).toEqual({ x: 500, y: 340 });
  });

  it('uma seção sem posição ao lado de outra com posição não quebra — cada uma resolve a sua', () => {
    const sections = [
      makeSection({ id: 's1', flowPositionX: 500, flowPositionY: 340 }),
      makeSection({ id: 's2', flowPositionX: null, flowPositionY: null }),
    ];
    const { nodes } = buildSectionFlowGraph(sections);

    expect(nodes[0].position).toEqual({ x: 500, y: 340 });
    expect(nodes[1].position).toEqual({ x: 350, y: 120 });
  });
});

describe('countOrphanedRules', () => {
  it('returns 0 for a form with no branches and every fallback resolving to submit', () => {
    const sections = [makeSection({ id: 's1' }), makeSection({ id: 's2' })];
    expect(countOrphanedRules(sections)).toBe(0);
  });

  it('counts both a dangling nextSectionId and a dangling branch target', () => {
    const sections = [
      makeSection({
        id: 's1',
        nextIsSubmit: false,
        nextSectionId: 'ghost',
        branches: [makeBranch({ targetSectionId: 'ghost-2', targetIsSubmit: false })],
      }),
    ];
    expect(countOrphanedRules(sections)).toBe(2);
  });
});

describe('branchOrphanReason — mesma conta do backend (hasOrphanedSectionRules)', () => {
  const ids = new Set(['s1', 's2']);
  const sections = [
    makeSection({
      id: 's1',
      fields: [
        makeField({ code: 'area', options: [{ id: 'o1', internalValue: 'financeiro', displayLabel: 'Financeiro' }] }),
        makeField({ id: 'f2', code: 'veiculo', fieldType: 'checkbox' }),
        makeField({ id: 'f3', code: 'nome', fieldType: 'short_text' }),
      ],
    }),
    makeSection({ id: 's2', fields: [] }),
  ];
  const fields = branchFieldsByCode(sections);

  it('regra válida de lista e de checkbox', () => {
    expect(branchOrphanReason(makeBranch(), ids, fields)).toBeNull();
    expect(
      branchOrphanReason(makeBranch({ fieldCode: 'veiculo', optionValue: null, checkboxValue: false }), ids, fields),
    ).toBeNull();
  });

  it('checkbox sem Sim/Não — o caso da Prestação de Contas em produção', () => {
    expect(
      branchOrphanReason(makeBranch({ fieldCode: 'veiculo', optionValue: null, checkboxValue: null }), ids, fields),
    ).toBe('missing_value');
  });

  it('campo que virou checkbox mas a regra ainda aponta para uma opção da lista antiga', () => {
    expect(
      branchOrphanReason(makeBranch({ fieldCode: 'veiculo', optionValue: 'opcao_1', checkboxValue: null }), ids, fields),
    ).toBe('missing_value');
  });

  it('opção apagada da lista', () => {
    expect(branchOrphanReason(makeBranch({ optionValue: 'opcao_apagada' }), ids, fields)).toBe('missing_option');
  });

  it('campo removido ou que não ramifica', () => {
    expect(branchOrphanReason(makeBranch({ fieldCode: 'sumiu' }), ids, fields)).toBe('missing_field');
    expect(branchOrphanReason(makeBranch({ fieldCode: 'nome' }), ids, fields)).toBe('not_branchable');
  });

  it('destino apagado', () => {
    expect(
      branchOrphanReason(makeBranch({ targetSectionId: 'fantasma', targetIsSubmit: false }), ids, fields),
    ).toBe('missing_target');
  });

  it('countOrphanedRules já conta a regra de opção apagada (antes só aparecia depois de salvar)', () => {
    const withGhostOption = sections.map((section, index) =>
      index === 0 ? { ...section, branches: [makeBranch({ optionValue: 'opcao_apagada' })] } : section,
    );
    expect(countOrphanedRules(withGhostOption)).toBe(1);
  });
});

describe('buildSectionFlowGraph — prévia de campos do nó', () => {
  const fields: DraftField[] = [
    makeField({ id: 'f-title', code: 'titulo', label: 'Identificação', fieldType: 'title' }),
    makeField({ id: 'f1', code: 'nome', label: 'Nome', fieldType: 'short_text', required: true }),
    makeField({ id: 'f-div', code: 'div', label: '', fieldType: 'divider' }),
    makeField({
      id: 'f2',
      code: 'unidade',
      label: 'Unidade',
      fieldType: 'single_select',
      settingsJson: { displayAs: 'dropdown' },
    }),
    makeField({ id: 'f3', code: 'qtd', label: 'Quantidade', fieldType: 'number' }),
    makeField({ id: 'f4', code: 'obs', label: 'Observações', fieldType: 'long_text' }),
    makeField({ id: 'f5', code: 'anexo', label: 'Anexo', fieldType: 'file_upload' }),
    makeField({ id: 'f6', code: 'data', label: 'Data', fieldType: 'date' }),
  ];

  it('mostra os 4 primeiros campos que recebem resposta e conta o resto, sem os decorativos', () => {
    const { nodes } = buildSectionFlowGraph([makeSection({ id: 's1', fields })]);
    const data = nodes[0].data as SectionFlowNodeData;

    expect(data.previewFields.map((field) => field.label)).toEqual([
      'Nome',
      'Unidade',
      'Quantidade',
      'Observações',
    ]);
    expect(data.previewFields[0].required).toBe(true);
    // A lista suspensa aparece como ela mesma, não como "Seleção Única".
    expect(data.previewFields[1].fieldType).toBe('dropdown_single');
    expect(data.remainingFieldCount).toBe(2);
    // O chip de campos conta todos, decorativos inclusive.
    expect(data.fieldCount).toBe(8);
  });

  it('marca como selecionado só o nó da seção aberta no modal e repassa a descrição', () => {
    const sections = [
      makeSection({ id: 's1', description: '  Quem pede.  ' }),
      makeSection({ id: 's2' }),
    ];
    const { nodes } = buildSectionFlowGraph(sections, {}, 's2');

    expect((nodes[0].data as SectionFlowNodeData).selected).toBe(false);
    expect((nodes[1].data as SectionFlowNodeData).selected).toBe(true);
    expect((nodes[0].data as SectionFlowNodeData).description).toBe('Quem pede.');
  });
});

describe('organizeSectionFlow (botão Organizar)', () => {
  // Formato do checklist de biossegurança: a 1ª seção ramifica; o caminho padrão (a → b → c) e o
  // de postura (p1 → p2) terminam cada um no envio.
  function checklist(): DraftSection[] {
    return [
      makeSection({
        id: 'inicio',
        nextSectionId: 'a',
        nextIsSubmit: false,
        branches: [makeBranch({ targetSectionId: 'p1', targetIsSubmit: false })],
      }),
      makeSection({ id: 'a', nextSectionId: 'b', nextIsSubmit: false }),
      makeSection({ id: 'b', nextSectionId: 'c', nextIsSubmit: false }),
      makeSection({ id: 'c' }),
      makeSection({ id: 'p1', nextSectionId: 'p2', nextIsSubmit: false }),
      makeSection({ id: 'p2' }),
    ].map((section) => ({ ...section, flowPositionX: 40, flowPositionY: 40 }));
  }

  it('põe o caminho padrão na linha de cima e o ramo na de baixo, coluna a coluna', () => {
    const positions = organizeSectionFlow(checklist());
    expect(Object.fromEntries(positions)).toEqual({
      inicio: { x: 0, y: 120 },
      a: { x: 350, y: 120 },
      b: { x: 700, y: 120 },
      c: { x: 1050, y: 120 },
      p1: { x: 350, y: 420 },
      p2: { x: 700, y: 420 },
    });
  });

  it('nunca deixa duas seções na mesma posição', () => {
    const positions = [...organizeSectionFlow(checklist()).values()].map(({ x, y }) => `${x},${y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('dois desvios na mesma coluna ficam um embaixo do outro', () => {
    const sections = [
      makeSection({
        id: 'inicio',
        nextSectionId: 'fim',
        nextIsSubmit: false,
        branches: [
          makeBranch({ id: 'b1', targetSectionId: 'x', targetIsSubmit: false }),
          makeBranch({ id: 'b2', targetSectionId: 'y', targetIsSubmit: false }),
        ],
      }),
      makeSection({ id: 'x', nextSectionId: 'fim', nextIsSubmit: false }),
      makeSection({ id: 'y', nextSectionId: 'fim', nextIsSubmit: false }),
      makeSection({ id: 'fim' }),
    ];
    const positions = organizeSectionFlow(sections);
    expect(positions.get('x')).toEqual({ x: 350, y: 420 });
    expect(positions.get('y')).toEqual({ x: 350, y: 720 });
    expect(positions.get('fim')).toEqual({ x: 700, y: 120 });
  });

  it('seta para trás (volta a uma seção anterior) não empurra coluna nem trava', () => {
    const sections = [
      makeSection({ id: 's1', nextSectionId: 's2', nextIsSubmit: false }),
      makeSection({ id: 's2', nextSectionId: 's1', nextIsSubmit: false }),
    ];
    expect(Object.fromEntries(organizeSectionFlow(sections))).toEqual({
      s1: { x: 0, y: 120 },
      s2: { x: 350, y: 120 },
    });
  });

  it('o envio fica uma coluna depois da seção mais à direita', () => {
    const positions = organizeSectionFlow(checklist());
    const organized = checklist().map((section) => ({
      ...section,
      flowPositionX: positions.get(section.id)?.x ?? null,
      flowPositionY: positions.get(section.id)?.y ?? null,
    }));
    const terminal = buildSectionFlowGraph(organized).nodes.find((node) => node.id === TERMINAL_NODE_ID);
    expect(terminal?.position).toEqual({ x: 1400, y: 120 });
  });
});
