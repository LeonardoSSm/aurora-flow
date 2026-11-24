import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  buildHandoffAnswers,
  convertAnswer,
  type HandoffSourceAnswer,
  type HandoffTargetField,
} from './process-handoff.answers';

function source(partial: Partial<HandoffSourceAnswer>): HandoffSourceAnswer {
  return {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    fieldType: FormFieldType.SHORT_TEXT,
    options: [],
    ...partial,
  };
}

function target(code: string, fieldType: FormFieldType, extra: Partial<HandoffTargetField> = {}): HandoffTargetField {
  return {
    id: `f-${code}`,
    code,
    label: code.toUpperCase(),
    fieldType,
    required: false,
    options: [],
    settingsJson: null,
    ...extra,
  };
}

const PRIORIDADE_ORIGEM = [
  { value: 'alta', label: 'Alta' },
  { value: 'baixa', label: 'Baixa' },
];

describe('buildHandoffAnswers', () => {
  it('copia pelo mesmo código, com o tipo, sem precisar mapear', () => {
    const itens = { rows: [{ key: '1', values: { Quantidade: 2 } }], columns: [] };
    const plan = buildHandoffAnswers({
      targetFields: [
        target('nome', FormFieldType.SHORT_TEXT),
        target('idade', FormFieldType.NUMBER),
        target('aceite', FormFieldType.CHECKBOX),
        target('pedido', FormFieldType.ITEM_ORDER),
        target('sem_origem', FormFieldType.SHORT_TEXT),
      ],
      sourceAnswers: new Map([
        ['nome', source({ valueText: 'Maria' })],
        ['idade', source({ fieldType: FormFieldType.NUMBER, valueNumber: 42 })],
        ['aceite', source({ fieldType: FormFieldType.CHECKBOX, valueBoolean: true })],
        ['pedido', source({ fieldType: FormFieldType.ITEM_ORDER, valueJson: itens })],
      ]),
      mappings: [],
      autoMatchByCode: true,
    });

    expect(plan.items).toEqual([
      expect.objectContaining({ fieldId: 'f-nome', fieldCode: 'nome', valueText: 'Maria' }),
      expect.objectContaining({ fieldCode: 'idade', valueNumber: 42 }),
      expect.objectContaining({ fieldCode: 'aceite', valueBoolean: true }),
      expect.objectContaining({ fieldCode: 'pedido', valueJson: itens }),
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('sem o automático, só vai o que foi mapeado', () => {
    const plan = buildHandoffAnswers({
      targetFields: [target('nome', FormFieldType.SHORT_TEXT), target('cliente', FormFieldType.SHORT_TEXT)],
      sourceAnswers: new Map([
        ['nome', source({ valueText: 'Maria' })],
        ['razao', source({ valueText: 'ACME' })],
      ]),
      mappings: [{ targetFieldCode: 'cliente', sourceFieldCode: 'razao' }],
      autoMatchByCode: false,
    });

    expect(plan.items.map((item) => [item.fieldCode, item.valueText])).toEqual([['cliente', 'ACME']]);
  });

  it('o mapeamento vale mais que o mesmo código, e aceita texto (template já resolvido)', () => {
    const plan = buildHandoffAnswers({
      targetFields: [target('nome', FormFieldType.SHORT_TEXT), target('obs', FormFieldType.LONG_TEXT)],
      sourceAnswers: new Map([
        ['nome', source({ valueText: 'Maria' })],
        ['apelido', source({ valueText: 'Mari' })],
      ]),
      mappings: [
        { targetFieldCode: 'nome', sourceFieldCode: 'apelido' },
        { targetFieldCode: 'obs', text: '  Veio da lista de espera  ' },
      ],
      autoMatchByCode: true,
    });

    expect(plan.items.map((item) => [item.fieldCode, item.valueText])).toEqual([
      ['nome', 'Mari'],
      ['obs', 'Veio da lista de espera'],
    ]);
  });

  it('seleção casa pelo valor e, se não houver, pelo rótulo da opção', () => {
    const plan = buildHandoffAnswers({
      targetFields: [
        target('prioridade', FormFieldType.SINGLE_SELECT, {
          options: [
            { value: 'p1', label: 'Alta' },
            { value: 'p2', label: 'Baixa' },
          ],
        }),
        target('urgencia', FormFieldType.SINGLE_SELECT, { options: [{ value: 'alta', label: 'Urgente' }] }),
      ],
      sourceAnswers: new Map([
        ['prioridade', source({ fieldType: FormFieldType.SINGLE_SELECT, valueText: 'alta', options: PRIORIDADE_ORIGEM })],
        ['urgencia', source({ fieldType: FormFieldType.SINGLE_SELECT, valueText: 'alta', options: PRIORIDADE_ORIGEM })],
      ]),
      mappings: [],
      autoMatchByCode: true,
    });

    expect(plan.items.map((item) => [item.fieldCode, item.valueText])).toEqual([
      ['prioridade', 'p1'],
      ['urgencia', 'alta'],
    ]);
  });

  it('opção que não existe no destino fica de fora, com o motivo', () => {
    const plan = buildHandoffAnswers({
      targetFields: [target('prioridade', FormFieldType.SINGLE_SELECT, { options: [{ value: 'm', label: 'Média' }] })],
      sourceAnswers: new Map([
        ['prioridade', source({ fieldType: FormFieldType.SINGLE_SELECT, valueText: 'alta', options: PRIORIDADE_ORIGEM })],
      ]),
      mappings: [],
      autoMatchByCode: true,
    });

    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([
      { fieldCode: 'prioridade', label: 'PRIORIDADE', reason: '"Alta" não é opção deste campo' },
    ]);
  });

  it('múltipla escolha leva só as opções que existem no destino', () => {
    const plan = buildHandoffAnswers({
      targetFields: [
        target('cores', FormFieldType.MULTI_SELECT, {
          options: [
            { value: 'az', label: 'Azul' },
            { value: 'vd', label: 'Verde' },
          ],
        }),
      ],
      sourceAnswers: new Map([
        [
          'cores',
          source({
            fieldType: FormFieldType.MULTI_SELECT,
            valueJson: ['azul', 'roxo'],
            options: [
              { value: 'azul', label: 'Azul' },
              { value: 'roxo', label: 'Roxo' },
            ],
          }),
        ],
      ]),
      mappings: [],
      autoMatchByCode: true,
    });

    expect(plan.items).toEqual([expect.objectContaining({ fieldCode: 'cores', valueJson: ['az'] })]);
  });

  it('refaz o cálculo do destino com as respostas copiadas', () => {
    const plan = buildHandoffAnswers({
      targetFields: [
        target('qtd', FormFieldType.NUMBER),
        target('preco', FormFieldType.NUMBER),
        target('total', FormFieldType.CALCULATED, { settingsJson: { formula: '{qtd} * {preco}' } }),
      ],
      sourceAnswers: new Map([
        ['qtd', source({ fieldType: FormFieldType.NUMBER, valueNumber: 3 })],
        ['preco', source({ fieldType: FormFieldType.NUMBER, valueNumber: 2.5 })],
        ['total', source({ fieldType: FormFieldType.CALCULATED, valueNumber: 999 })],
      ]),
      mappings: [],
      autoMatchByCode: true,
    });

    expect(plan.items.find((item) => item.fieldCode === 'total')).toEqual(
      expect.objectContaining({ fieldId: 'f-total', valueNumber: 7.5 }),
    );
  });

  it('avisa o obrigatório que ficou vazio e não trata arquivo como resposta', () => {
    const plan = buildHandoffAnswers({
      targetFields: [
        target('cpf', FormFieldType.CPF, { required: true }),
        target('doc', FormFieldType.FILE_UPLOAD, { required: true }),
        target('titulo', FormFieldType.TITLE, { required: true }),
      ],
      sourceAnswers: new Map([['doc', source({ fieldType: FormFieldType.FILE_UPLOAD, valueText: 'arquivo.pdf' })]]),
      mappings: [],
      autoMatchByCode: true,
    });

    expect(plan.items).toEqual([]);
    expect(plan.missingRequired).toEqual([{ fieldCode: 'cpf', label: 'CPF' }]);
    expect(plan.skipped).toEqual([
      { fieldCode: 'doc', label: 'DOC', reason: 'arquivos vão como anexos do card' },
    ]);
  });
});

describe('convertAnswer', () => {
  const field = (fieldType: FormFieldType) => ({ fieldType, options: [], label: 'X' });

  it('texto vira número, moeda e sim/não', () => {
    expect(convertAnswer(source({ valueText: '1.500,50' }), field(FormFieldType.NUMBER))).toEqual(
      expect.objectContaining({ valueNumber: 1500.5 }),
    );
    expect(convertAnswer(source({ fieldType: FormFieldType.NUMBER, valueNumber: 10 }), field(FormFieldType.CURRENCY))).toEqual(
      expect.objectContaining({ valueNumber: 10, valueText: expect.stringContaining('10,00') }),
    );
    expect(convertAnswer(source({ valueText: 'Sim' }), field(FormFieldType.CHECKBOX))).toEqual(
      expect.objectContaining({ valueBoolean: true }),
    );
    expect(convertAnswer(source({ valueText: 'talvez' }), field(FormFieldType.CHECKBOX))).toEqual({
      reason: 'o valor não é sim/não',
    });
  });

  it('para texto vai o que a pessoa leria: rótulo da opção, Sim/Não, nome do ERP', () => {
    expect(
      convertAnswer(
        source({ fieldType: FormFieldType.SINGLE_SELECT, valueText: 'alta', options: PRIORIDADE_ORIGEM }),
        field(FormFieldType.SHORT_TEXT),
      ),
    ).toEqual(expect.objectContaining({ valueText: 'Alta' }));
    expect(
      convertAnswer(source({ fieldType: FormFieldType.CHECKBOX, valueBoolean: false }), field(FormFieldType.SHORT_TEXT)),
    ).toEqual(expect.objectContaining({ valueText: 'Não' }));
    expect(
      convertAnswer(
        source({
          fieldType: FormFieldType.ERP_LOOKUP,
          valueText: 'ACME LTDA',
          valueJson: { value: '001', label: 'ACME LTDA', fonte: 'clientes' },
        }),
        field(FormFieldType.SHORT_TEXT),
      ),
    ).toEqual(expect.objectContaining({ valueText: 'ACME LTDA' }));
  });

  it('retrato (ERP, itens) só passa para um campo do mesmo tipo', () => {
    expect(convertAnswer(source({ valueText: 'ACME' }), field(FormFieldType.ERP_LOOKUP))).toEqual({
      reason: 'só recebe valor de um campo do mesmo tipo',
    });
    expect(
      convertAnswer(source({ fieldType: FormFieldType.ITEM_ORDER, valueJson: { rows: [] } }), field(FormFieldType.LONG_TEXT)),
    ).toEqual({ reason: 'a origem não tem texto para este campo' });
  });

  it('data e hora vira só a data num campo de data', () => {
    expect(
      convertAnswer(source({ fieldType: FormFieldType.DATETIME, valueText: '2026-11-16T10:30' }), field(FormFieldType.DATE)),
    ).toEqual(expect.objectContaining({ valueText: '2026-11-16' }));
  });
});
