import {
  ERP_TABLE_MAX_ROWS,
  listErpTableSettingsProblems,
  parseErpTableSettings,
  toPublicErpTableSettings,
} from './erp-table.settings';

const VALIDA = {
  erpConnectorId: '11111111-1111-4111-8111-111111111111',
  fonte: 'pedidos',
  dataset: 'itens',
  parameterBindings: [{ parameter: 'pedidoId', fieldCode: 'pedido' }],
  sourceColumns: [{ key: 'produto', label: 'Produto', type: 'text' }],
  inputColumns: [{ id: 'conferida', label: 'Qtd. conferida', type: 'number', required: true }],
};

describe('parseErpTableSettings', () => {
  it('sem conector, lista ou tabela → null', () => {
    expect(parseErpTableSettings({})).toBeNull();
    expect(parseErpTableSettings({ ...VALIDA, erpConnectorId: 'x' })).toBeNull();
    expect(parseErpTableSettings({ ...VALIDA, dataset: ' ' })).toBeNull();
  });

  it('aplica padrões: máximo de linhas, moeda com 2 casas, texto até 1.000', () => {
    const settings = parseErpTableSettings({
      ...VALIDA,
      maxRows: 99999,
      inputColumns: [
        { id: 'valor', label: 'Valor', type: 'currency' },
        { id: 'obs', type: 'text', maxLength: 5000 },
      ],
    });
    expect(settings?.maxRows).toBe(ERP_TABLE_MAX_ROWS);
    expect(settings?.exigirLogin).toBe(false);
    expect(settings?.inputColumns[0]).toMatchObject({ decimals: 2, required: false });
    expect(settings?.inputColumns[1]).toMatchObject({ label: 'obs', maxLength: 1000 });
  });
});

describe('listErpTableSettingsProblems', () => {
  it('configuração válida → sem problemas', () => {
    expect(listErpTableSettingsProblems(VALIDA)).toEqual([]);
  });

  it('acusa coluna faltando, IDs repetidos, seleção sem opções e tipo desconhecido', () => {
    expect(
      listErpTableSettingsProblems({
        ...VALIDA,
        sourceColumns: [],
        inputColumns: [
          { id: 'a', type: 'select' },
          { id: 'a', type: 'number', min: 5, max: 1 },
          { id: 'b', type: 'formula' },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'escolha pelo menos uma coluna do ERP para mostrar',
        'há coluna preenchível sem identificador ou com tipo desconhecido',
        'há colunas preenchíveis com o mesmo identificador',
        'a coluna "a" precisa de opções',
        'na coluna "a", o mínimo é maior que o máximo',
      ]),
    );
  });

  it('identificador que colide com coluna do ERP ou fora do padrão', () => {
    expect(
      listErpTableSettingsProblems({
        ...VALIDA,
        inputColumns: [
          { id: 'produto', type: 'text' },
          { id: '1x', type: 'text' },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'coluna preenchível não pode ter o mesmo identificador de uma coluna do ERP',
        'o identificador "1x" deve começar com letra e ter só letras, números e _',
      ]),
    );
  });
});

describe('toPublicErpTableSettings', () => {
  it('não entrega conector, lista, tabela nem nome de parâmetro', () => {
    const publico = toPublicErpTableSettings(VALIDA);
    expect(publico).toEqual({
      dependsOn: ['pedido'],
      sourceColumns: VALIDA.sourceColumns,
      inputColumns: [expect.objectContaining({ id: 'conferida' })],
      maxRows: 500,
      exigirLogin: false,
    });
    expect(JSON.stringify(publico)).not.toMatch(/erpConnectorId|pedidos|itens|pedidoId/);
  });
});
