import { describe, expect, it } from 'vitest';
import type { ErpTableInputColumn } from '../forms/types';
import {
  buildErpTableAnswer,
  formatErpTableCell,
  getDependencyKey,
  getErpTableDependencies,
  hasFilledAnswers,
  toErpTableSubmitValue,
  validateErpTableAnswer,
  validateErpTableCell,
} from './erp-table';
import { fieldToSubmitItem, isAnswerEmpty } from './form-runtime';
import type { ErpTableAnswer, PublicFormField } from './types';

const COLUNAS: ErpTableInputColumn[] = [
  { id: 'conferida', label: 'Qtd. conferida', type: 'number', required: true, min: 0, decimals: 3 },
  { id: 'obs', label: 'Observação', type: 'text', maxLength: 10 },
  { id: 'ok', label: 'Conferido', type: 'checkbox' },
];

const FIELD: PublicFormField = {
  id: 'f-itens',
  code: 'itens',
  label: 'Itens',
  fieldType: 'erp_table',
  required: true,
  order: 2,
  settingsJson: {
    dependsOn: ['pedido'],
    sourceColumns: [{ key: 'produto', label: 'Produto', type: 'text' }],
    inputColumns: COLUNAS,
  },
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};

const CARGA = {
  sourceHash: 'sha256-abc',
  fetchedAt: '2026-10-08T15:30:00.000Z',
  rows: [
    { key: 'A', values: { produto: 'Ovos' } },
    { key: 'B', values: { produto: 'Leite' } },
  ],
};

function carregada(answers: ErpTableAnswer['answers'] = {}): ErpTableAnswer {
  const answer = buildErpTableAnswer(CARGA, '[["pedido","123"]]', COLUNAS);
  return { ...answer, answers: { ...answer.answers, ...answers } };
}

describe('dependências', () => {
  it('lê o código da Lista do ERP, texto e número; falta algum → null', () => {
    expect(getErpTableDependencies(FIELD, { pedido: { value: '123', label: 'Pedido 123' } })).toEqual(
      { pedido: '123' },
    );
    expect(getErpTableDependencies(FIELD, { pedido: 42 })).toEqual({ pedido: '42' });
    expect(getErpTableDependencies(FIELD, { pedido: '  ' })).toBeNull();
    expect(getErpTableDependencies(FIELD, {})).toBeNull();
  });

  it('chave estável, independente da ordem', () => {
    expect(getDependencyKey({ b: '2', a: '1' })).toBe(getDependencyKey({ a: '1', b: '2' }));
  });
});

describe('buildErpTableAnswer', () => {
  it('uma linha por item, com valores iniciais (checkbox desmarcado)', () => {
    const answer = carregada();
    expect(answer.rows).toHaveLength(2);
    expect(answer.answers).toEqual({ A: { ok: false }, B: { ok: false } });
    expect(answer.review).toBeNull();
    expect(hasFilledAnswers(answer, COLUNAS)).toBe(false);
  });

  it('recarga depois de 409: mantém respostas das linhas que continuam e lista novas e removidas', () => {
    const antes = carregada({ A: { conferida: 8, ok: false }, B: { conferida: 5, ok: false } });
    const depois = buildErpTableAnswer(
      {
        sourceHash: 'sha256-novo',
        fetchedAt: '',
        rows: [
          { key: 'A', values: { produto: 'Ovos' } },
          { key: 'C', values: { produto: 'Queijo' } },
        ],
      },
      antes.dependencyKey,
      COLUNAS,
      antes,
    );

    expect(depois.answers.A).toEqual({ conferida: 8, ok: false });
    expect(depois.answers.C).toEqual({ ok: false });
    expect(depois.review).toEqual({ added: ['C'], removed: [antes.rows[1]] });
  });
});

describe('validateErpTableCell', () => {
  it('número: obrigatório, mínimo, casas decimais', () => {
    expect(validateErpTableCell(COLUNAS[0], null)).toBe('Obrigatório.');
    expect(validateErpTableCell(COLUNAS[0], -1)).toBe('Mínimo 0.');
    expect(validateErpTableCell(COLUNAS[0], 1.2345)).toBe('Até 3 casa(s) decimal(is).');
    expect(validateErpTableCell(COLUNAS[0], 1.5)).toBeNull();
  });

  it('texto, data, seleção e checkbox obrigatório', () => {
    expect(validateErpTableCell(COLUNAS[1], 'texto longo demais')).toBe('Até 10 caracteres.');
    expect(validateErpTableCell({ id: 'd', label: 'D', type: 'date' }, '2026-02-30')).toBe(
      'Data inválida.',
    );
    expect(
      validateErpTableCell({ id: 's', label: 'S', type: 'select', options: ['OK'] }, 'X'),
    ).toBe('Opção inválida.');
    expect(validateErpTableCell({ id: 'c', label: 'C', type: 'checkbox', required: true }, false)).toBe(
      'Obrigatório.',
    );
  });
});

describe('validateErpTableAnswer', () => {
  it('obrigatória sem carregar, recarga pendente, troca de pedido e revisão bloqueiam', () => {
    expect(validateErpTableAnswer(FIELD, null)).toBe('Carregue a tabela do ERP antes de enviar.');
    expect(validateErpTableAnswer(FIELD, { ...carregada(), stale: true })).toBe(
      'Carregue a tabela do ERP antes de enviar.',
    );
    expect(validateErpTableAnswer(FIELD, { ...carregada(), outdated: true })).toMatch(/registro mudou/);
    expect(
      validateErpTableAnswer(FIELD, { ...carregada(), review: { added: [], removed: [] } }),
    ).toMatch(/Confira a tabela/);
  });

  it('conta as células com erro; tudo certo → null', () => {
    expect(validateErpTableAnswer(FIELD, carregada())).toBe('Corrija 2 células da tabela.');
    expect(
      validateErpTableAnswer(
        FIELD,
        carregada({ A: { conferida: 1, ok: false }, B: { conferida: 2, ok: true } }),
      ),
    ).toBeNull();
  });

  it('obrigatória sem itens no ERP; opcional sem carregar passa', () => {
    expect(validateErpTableAnswer(FIELD, buildErpTableAnswer({ ...CARGA, rows: [] }, 'k', COLUNAS))).toBe(
      'O registro não tem itens no ERP.',
    );
    expect(validateErpTableAnswer({ ...FIELD, required: false }, null)).toBeNull();
  });
});

describe('envio', () => {
  it('manda hash, todas as linhas e só as colunas preenchíveis com valor', () => {
    const answer = carregada({ A: { conferida: 8, obs: ' avaria ', ok: true }, B: { conferida: 5, ok: false } });
    expect(toErpTableSubmitValue(FIELD, answer)).toEqual({
      sourceHash: 'sha256-abc',
      rows: [
        { key: 'A', answers: { conferida: 8, obs: 'avaria', ok: true } },
        { key: 'B', answers: { conferida: 5, ok: false } },
      ],
    });
  });

  it('fieldToSubmitItem: só valueJson; não envia tabela pendente de recarga ou de outro pedido', () => {
    const answer = carregada({ A: { conferida: 1 }, B: { conferida: 2 } });
    expect(fieldToSubmitItem(FIELD, answer)).toEqual({
      fieldId: 'f-itens',
      fieldCode: 'itens',
      valueJson: toErpTableSubmitValue(FIELD, answer),
    });
    expect(fieldToSubmitItem(FIELD, { ...answer, stale: true })).toBeNull();
    expect(fieldToSubmitItem(FIELD, { ...answer, outdated: true })).toBeNull();
    expect(isAnswerEmpty(answer)).toBe(false);
    expect(isAnswerEmpty({ ...answer, stale: true })).toBe(true);
  });
});

describe('formatErpTableCell', () => {
  it('número, moeda, data, booleano e vazio', () => {
    expect(formatErpTableCell(1234.5, 'number')).toBe('1.234,5');
    expect(formatErpTableCell(10, 'currency')).toMatch(/R\$\s10,00/);
    expect(formatErpTableCell('2026-06-20', 'date')).toBe('20/06/2026');
    expect(formatErpTableCell(true, 'boolean')).toBe('Sim');
    expect(formatErpTableCell(null, 'text')).toBe('—');
  });
});
