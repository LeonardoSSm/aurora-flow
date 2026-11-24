import { parseErpTableSettings, type ErpTableSettings } from './erp-table.settings';
import {
  buildErpTableAnswerRows,
  buildErpTableSummary,
  computeErpTableHash,
  type ErpTableAnswer,
  ERP_TABLE_SUMMARY_MAX,
  projectRows,
  readErpTableSubmission,
  validateCell,
} from './erp-table.snapshot';

const SETTINGS = parseErpTableSettings({
  erpConnectorId: '11111111-1111-4111-8111-111111111111',
  fonte: 'pedidos',
  dataset: 'itens',
  parameterBindings: [{ parameter: 'pedidoId', fieldCode: 'pedido' }],
  sourceColumns: [
    { key: 'codigo', label: 'Código', type: 'text' },
    { key: 'produto', label: 'Produto', type: 'text' },
    { key: 'qtde', label: 'Qtd. pedida', type: 'number' },
  ],
  inputColumns: [
    {
      id: 'conferida',
      label: 'Qtd. conferida',
      type: 'number',
      required: true,
      min: 0,
      decimals: 3,
    },
    { id: 'obs', label: 'Observação', type: 'text', maxLength: 10 },
  ],
}) as ErpTableSettings;

const ROWS = [
  { key: 'A', values: { codigo: '101', produto: 'Produto A', qtde: 10, faturada: 9 } },
  { key: 'B', values: { codigo: '102', produto: 'Produto B', qtde: 5, faturada: 5 } },
];

describe('computeErpTableHash', () => {
  it('estável e só sobre as colunas configuradas', () => {
    const hash = computeErpTableHash(ROWS, SETTINGS.sourceColumns);
    expect(hash).toMatch(/^sha256-[0-9a-f]{64}$/);

    // Coluna que o formulário não mostra mudou: mesmo hash.
    const faturouMais = ROWS.map((row) => ({ ...row, values: { ...row.values, faturada: 0 } }));
    expect(computeErpTableHash(faturouMais, SETTINGS.sourceColumns)).toBe(hash);
  });

  it('muda com valor exibido, linha nova ou ordem diferente', () => {
    const hash = computeErpTableHash(ROWS, SETTINGS.sourceColumns);
    const outraQtde = [{ ...ROWS[0], values: { ...ROWS[0].values, qtde: 11 } }, ROWS[1]];
    expect(computeErpTableHash(outraQtde, SETTINGS.sourceColumns)).not.toBe(hash);
    expect(computeErpTableHash([ROWS[0]], SETTINGS.sourceColumns)).not.toBe(hash);
    expect(computeErpTableHash([ROWS[1], ROWS[0]], SETTINGS.sourceColumns)).not.toBe(hash);
  });
});

describe('projectRows', () => {
  it('entrega ao navegador só as colunas configuradas', () => {
    expect(projectRows(ROWS, SETTINGS.sourceColumns)[0]).toEqual({
      key: 'A',
      values: { codigo: '101', produto: 'Produto A', qtde: 10 },
    });
  });
});

describe('readErpTableSubmission', () => {
  it('aceita hash + linhas com respostas', () => {
    expect(
      readErpTableSubmission({
        sourceHash: 'sha256-x',
        rows: [{ key: 'A', answers: { obs: 'ok' } }],
      }),
    ).toEqual({ sourceHash: 'sha256-x', rows: [{ key: 'A', answers: { obs: 'ok' } }] });
  });

  it.each([null, 'texto', [], { rows: [] }, { sourceHash: 'x' }, { sourceHash: 'x', rows: [{}] }])(
    'formato inválido → null (%p)',
    (valueJson) => {
      expect(readErpTableSubmission(valueJson)).toBeNull();
    },
  );
});

describe('buildErpTableAnswerRows', () => {
  const server = projectRows(ROWS, SETTINGS.sourceColumns);

  it('monta o retrato com os valores do servidor, nunca os do navegador', () => {
    const { rows, errors } = buildErpTableAnswerRows(SETTINGS, server, {
      sourceHash: 'x',
      rows: [
        { key: 'B', answers: { conferida: 5 } },
        { key: 'A', answers: { conferida: 8, obs: ' avaria ' } },
      ],
    });

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        key: 'A',
        sourceValues: { codigo: '101', produto: 'Produto A', qtde: 10 },
        answers: { conferida: 8, obs: 'avaria' },
      },
      {
        key: 'B',
        sourceValues: { codigo: '102', produto: 'Produto B', qtde: 5 },
        answers: { conferida: 5, obs: null },
      },
    ]);
  });

  it.each([
    ['linha a menos', [{ key: 'A', answers: { conferida: 1 } }]],
    [
      'chave inventada',
      [
        { key: 'A', answers: { conferida: 1 } },
        { key: 'Z', answers: { conferida: 1 } },
      ],
    ],
    [
      'chave repetida',
      [
        { key: 'A', answers: { conferida: 1 } },
        { key: 'A', answers: { conferida: 1 } },
      ],
    ],
  ])('%s → linhas não conferem', (_caso, rows) => {
    const result = buildErpTableAnswerRows(SETTINGS, server, { sourceHash: 'x', rows });
    expect(result.errors).toEqual(['As linhas enviadas não conferem com o ERP.']);
  });

  it('erros por célula e coluna desconhecida', () => {
    const { errors } = buildErpTableAnswerRows(SETTINGS, server, {
      sourceHash: 'x',
      rows: [
        { key: 'A', answers: { obs: 'texto longo demais' } },
        { key: 'B', answers: { conferida: 1, qtde: 999 } },
      ],
    });
    expect(errors).toEqual([
      'Item 1 (101): Qtd. conferida — obrigatório.',
      'Item 1 (101): Observação — até 10 caracteres.',
      'Item 2: coluna desconhecida (qtde).',
    ]);
  });
});

describe('validateCell', () => {
  const coluna = SETTINGS.inputColumns[0];

  it('número: tipo, mínimo, casas decimais', () => {
    expect(validateCell(coluna, 1.5)).toEqual({ value: 1.5 });
    expect(validateCell(coluna, '1')).toEqual({ error: 'deve ser um número.' });
    expect(validateCell(coluna, -1)).toEqual({ error: 'mínimo 0.' });
    expect(validateCell(coluna, 1.2345)).toEqual({ error: 'até 3 casa(s) decimal(is).' });
    expect(validateCell(coluna, Number.NaN)).toEqual({ error: 'deve ser um número.' });
  });

  it('data, seleção e checkbox', () => {
    const base = { ...coluna, required: false, min: null, max: null, decimals: null };
    expect(validateCell({ ...base, type: 'date' }, '2026-02-30')).toEqual({
      error: 'data inválida.',
    });
    expect(validateCell({ ...base, type: 'date' }, '2026-02-28')).toEqual({ value: '2026-02-28' });
    expect(validateCell({ ...base, type: 'select', options: ['OK'] }, 'X')).toEqual({
      error: 'opção inválida.',
    });
    expect(validateCell({ ...base, type: 'checkbox' }, undefined)).toEqual({ value: false });
    expect(validateCell({ ...base, type: 'checkbox', required: true }, false)).toEqual({
      error: 'obrigatório.',
    });
  });
});

describe('buildErpTableSummary', () => {
  const answer: ErpTableAnswer = {
    schemaVersion: 1,
    source: { dataset: 'itens', dependencies: { pedido: '1' }, fetchedAt: '', sourceHash: '' },
    columns: {
      source: SETTINGS.sourceColumns,
      input: SETTINGS.inputColumns.map(({ id, label, type, decimals }) => ({
        id,
        label,
        type,
        decimals,
      })),
    },
    rows: [
      {
        key: 'A',
        sourceValues: { codigo: '101', produto: 'Produto A', qtde: 10 },
        answers: { conferida: 8, obs: 'Duas caixas avariadas' },
      },
    ],
  };

  it('formato da §11', () => {
    expect(buildErpTableSummary(answer)).toBe(
      '101 - Produto A | Qtd. pedida: 10 | Qtd. conferida: 8 | Observação: Duas caixas avariadas',
    );
  });

  it('corta antes do limite de célula do Google Sheets', () => {
    const rows = Array.from({ length: 600 }, (_, index) => ({
      ...answer.rows[0],
      key: String(index),
      answers: { conferida: 8, obs: 'x'.repeat(100) },
    }));
    const summary = buildErpTableSummary({ ...answer, rows });
    expect(summary.length).toBeLessThanOrEqual(ERP_TABLE_SUMMARY_MAX + 30);
    expect(summary).toMatch(/… \(\+\d+ itens\)$/);
  });
});
