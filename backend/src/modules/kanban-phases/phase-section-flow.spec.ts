import {
  groupPhaseSections,
  normalizePhaseSectionFlow,
  PHASE_START_SECTION,
  reachablePhaseFields,
  reachablePhaseSections,
} from './phase-section-flow';

type Field = {
  code: string;
  label: string;
  fieldType: string;
  order: number;
  optionsJson?: Array<{ value: string; label: string }> | null;
};

let order = 0;
function field(code: string, fieldType: string, extra: Partial<Field> = {}): Field {
  order += 1;
  return { code, label: code, fieldType, order, ...extra };
}

/** Cotação: tipo de compra decide entre frete nacional e importação; os dois terminam no fechamento. */
function quoteFields(): Field[] {
  order = 0;
  return [
    field('tipo', 'single_select', {
      optionsJson: [
        { value: 'nacional', label: 'Nacional' },
        { value: 'importacao', label: 'Importação' },
      ],
    }),
    field('sec_nacional', 'title'),
    field('transportadora', 'short_text'),
    field('sec_importacao', 'title'),
    field('incoterm', 'short_text'),
    field('sec_fechamento', 'title'),
    field('valor_final', 'currency'),
  ];
}

const quoteFlow = normalizePhaseSectionFlow(
  [
    {
      section: PHASE_START_SECTION,
      next: 'sec_fechamento',
      branches: [
        { fieldCode: 'tipo', optionValue: 'nacional', target: 'sec_nacional' },
        { fieldCode: 'tipo', optionValue: 'importacao', target: 'sec_importacao' },
      ],
    },
    { section: 'sec_nacional', next: 'sec_fechamento', branches: [] },
  ],
  quoteFields(),
);

function keysFor(values: Record<string, unknown>): string[] {
  return reachablePhaseSections(quoteFields(), quoteFlow, (f) => values[f.code]).map((s) => s.key);
}

describe('groupPhaseSections', () => {
  it('abre uma seção a cada título; o que vem antes é a seção de início', () => {
    const sections = groupPhaseSections(quoteFields());
    expect(sections.map((s) => s.key)).toEqual([
      PHASE_START_SECTION,
      'sec_nacional',
      'sec_importacao',
      'sec_fechamento',
    ]);
    expect(sections[1].fields.map((f) => f.code)).toEqual(['transportadora']);
  });

  it('respeita a ordem dos campos, não a do array', () => {
    const fields = quoteFields().reverse();
    expect(groupPhaseSections(fields)[0].fields.map((f) => f.code)).toEqual(['tipo']);
  });
});

describe('reachablePhaseSections', () => {
  it('sem caminho configurado mostra todas as seções', () => {
    expect(reachablePhaseSections(quoteFields(), null, () => null)).toHaveLength(4);
  });

  it('segue a ramificação que casa', () => {
    expect(keysFor({ tipo: 'importacao' })).toEqual([
      PHASE_START_SECTION,
      'sec_importacao',
      'sec_fechamento',
    ]);
    expect(keysFor({ tipo: 'nacional' })).toEqual([
      PHASE_START_SECTION,
      'sec_nacional',
      'sec_fechamento',
    ]);
  });

  it('sem resposta no campo da ramificação segue o caminho padrão', () => {
    expect(keysFor({})).toEqual([PHASE_START_SECTION, 'sec_fechamento']);
  });

  it('seção sem caminho próprio vai para a seguinte; caminho nulo termina', () => {
    const fields = quoteFields();
    const flow = normalizePhaseSectionFlow(
      [{ section: 'sec_nacional', next: null, branches: [] }],
      fields,
    );
    const keys = reachablePhaseSections(fields, flow, () => null).map((s) => s.key);
    expect(keys).toEqual([PHASE_START_SECTION, 'sec_nacional']);
  });

  it('ciclo não trava: cada seção entra uma vez', () => {
    const fields = quoteFields();
    const flow = normalizePhaseSectionFlow(
      [{ section: 'sec_fechamento', next: PHASE_START_SECTION, branches: [] }],
      fields,
    );
    expect(reachablePhaseSections(fields, flow, () => null)).toHaveLength(4);
  });

  it('caixa de seleção e lista múltipla decidem a ramificação', () => {
    order = 0;
    const fields = [
      field('urgente', 'checkbox'),
      field('canais', 'multi_select', {
        optionsJson: [
          { value: 'email', label: 'E-mail' },
          { value: 'zap', label: 'WhatsApp' },
        ],
      }),
      field('sec_urgente', 'title'),
      field('motivo', 'long_text'),
      field('sec_zap', 'title'),
      field('telefone', 'phone'),
    ];
    const flow = normalizePhaseSectionFlow(
      [
        {
          section: PHASE_START_SECTION,
          next: null,
          branches: [
            { fieldCode: 'urgente', checkboxValue: true, target: 'sec_urgente' },
            { fieldCode: 'canais', optionValue: 'zap', target: 'sec_zap' },
          ],
        },
        { section: 'sec_urgente', next: null, branches: [] },
      ],
      fields,
    );
    const keys = (values: Record<string, unknown>) =>
      reachablePhaseSections(fields, flow, (f) => values[f.code]).map((s) => s.key);
    expect(keys({ urgente: true })).toEqual([PHASE_START_SECTION, 'sec_urgente']);
    expect(keys({ urgente: false, canais: ['email', 'zap'] })).toEqual([PHASE_START_SECTION, 'sec_zap']);
    expect(keys({ urgente: false, canais: ['email'] })).toEqual([PHASE_START_SECTION]);
  });
});

describe('reachablePhaseFields', () => {
  it('inclui os títulos das seções do caminho e deixa de fora as outras', () => {
    const fields = quoteFields();
    const reachable = reachablePhaseFields(fields, quoteFlow, (f) =>
      f.code === 'tipo' ? 'nacional' : null,
    );
    expect([...reachable].map((f) => f.code)).toEqual([
      'tipo',
      'sec_nacional',
      'transportadora',
      'sec_fechamento',
      'valor_final',
    ]);
  });
});

describe('normalizePhaseSectionFlow', () => {
  it('sem caminho ou só com o padrão vira nulo', () => {
    expect(normalizePhaseSectionFlow(null, quoteFields())).toBeNull();
    expect(
      normalizePhaseSectionFlow([{ section: 'sec_nacional', branches: [] }], quoteFields()),
    ).toBeNull();
  });

  it('guarda só o que difere do padrão', () => {
    expect(quoteFlow).toEqual([
      {
        section: PHASE_START_SECTION,
        next: 'sec_fechamento',
        branches: [
          { fieldCode: 'tipo', optionValue: 'nacional', checkboxValue: null, target: 'sec_nacional' },
          { fieldCode: 'tipo', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' },
        ],
      },
      { section: 'sec_nacional', next: 'sec_fechamento', branches: [] },
    ]);
  });

  it.each([
    [{ section: 'nao_existe', branches: [] }, /seção que não existe/],
    [{ section: 'sec_nacional', next: 'nao_existe', branches: [] }, /leva a uma seção que não existe/],
    [{ section: 'sec_nacional', next: 'sec_nacional', branches: [] }, /leva a ela mesma/],
    [
      { section: 'sec_nacional', branches: [{ fieldCode: 'tipo', optionValue: 'nacional', target: null }] },
      /campo que não está nela/,
    ],
    [
      { section: 'sec_nacional', branches: [{ fieldCode: 'transportadora', optionValue: 'x', target: null }] },
      /não decide ramificação/,
    ],
    [
      { section: PHASE_START_SECTION, branches: [{ fieldCode: 'tipo', optionValue: 'aereo', target: null }] },
      /opção que não existe/,
    ],
  ])('recusa referência inválida %#', (route, message) => {
    expect(() => normalizePhaseSectionFlow([route], quoteFields())).toThrow(message);
  });

  it('caixa de seleção precisa de Sim ou Não', () => {
    order = 0;
    const fields = [field('ok', 'checkbox'), field('sec_b', 'title')];
    expect(() =>
      normalizePhaseSectionFlow(
        [{ section: PHASE_START_SECTION, branches: [{ fieldCode: 'ok', target: 'sec_b' }] }],
        fields,
      ),
    ).toThrow(/Sim ou Não/);
  });

  it('recusa seção repetida no caminho', () => {
    expect(() =>
      normalizePhaseSectionFlow(
        [
          { section: 'sec_nacional', next: null, branches: [] },
          { section: 'sec_nacional', next: null, branches: [] },
        ],
        quoteFields(),
      ),
    ).toThrow(/duas vezes/);
  });
});
