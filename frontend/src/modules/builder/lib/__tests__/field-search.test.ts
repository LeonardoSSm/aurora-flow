import { describe, expect, it } from 'vitest';
import { filterFieldTypeGroups, filterFieldsByQuery, summarizeFields } from '../field-search';
import { fieldTypePickerGroups } from '../../types';
import type { DraftField } from '../../types';

function makeField(id: string, label: string, overrides: Partial<DraftField> = {}): DraftField {
  return {
    id,
    code: id,
    label,
    fieldType: 'short_text',
    required: false,
    isSensitive: false,
    options: [],
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
    ...overrides,
  };
}

const fields = [
  makeField('f1', 'Identificação do item', { fieldType: 'title' }),
  makeField('f2', 'Descrição do material', { required: true }),
  makeField('f3', 'Quantidades e valores', { fieldType: 'title' }),
  makeField('f4', 'Quantidade', { fieldType: 'number', required: true }),
  makeField('f5', 'Valor unitário estimado', { fieldType: 'currency', required: true }),
  makeField('f6', 'Valor total', { fieldType: 'calculated' }),
  makeField('f7', '', { fieldType: 'divider' }),
];

describe('filterFieldsByQuery', () => {
  it('sem busca devolve todos os campos, com a posição de cada um', () => {
    const result = filterFieldsByQuery(fields, '   ');
    expect(result).toHaveLength(fields.length);
    expect(result.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('filtra pelo rótulo sem diferenciar maiúsculas nem acentos e mantém a numeração original', () => {
    const result = filterFieldsByQuery(fields, 'VALOR');
    expect(result.map(({ field }) => field.label)).toEqual([
      'Quantidades e valores',
      'Valor unitário estimado',
      'Valor total',
    ]);
    expect(result.map(({ index }) => index)).toEqual([2, 4, 5]);

    expect(filterFieldsByQuery(fields, 'identificacao').map(({ field }) => field.id)).toEqual([
      'f1',
    ]);
    expect(filterFieldsByQuery(fields, 'unitario').map(({ field }) => field.id)).toEqual(['f5']);
  });

  it('sem resultado devolve lista vazia', () => {
    expect(filterFieldsByQuery(fields, 'fornecedor')).toEqual([]);
  });
});

describe('summarizeFields', () => {
  it('conta só os campos que recebem resposta', () => {
    expect(summarizeFields(fields)).toBe('4 campos · 3 obrigatórios');
  });

  it('usa o singular quando é um só', () => {
    expect(summarizeFields([makeField('a', 'Nome', { required: true })])).toBe(
      '1 campo · 1 obrigatório',
    );
  });
});

describe('filterFieldTypeGroups', () => {
  const labels = (groups: ReturnType<typeof filterFieldTypeGroups>) =>
    groups.flatMap((group) => group.options.map((option) => option.label));

  it('sem busca devolve todos os grupos, na ordem do seletor', () => {
    const groups = filterFieldTypeGroups('', { erpTableEnabled: true });
    expect(groups.map((group) => group.group)).toEqual(
      fieldTypePickerGroups.map((group) => group.group),
    );
    expect(labels(groups)).toContain('Tabela dinâmica do ERP');
  });

  it('"Tabela dinâmica do ERP" só aparece com o ERP_TABLE_ENABLED', () => {
    const groups = filterFieldTypeGroups('', { erpTableEnabled: false });
    expect(labels(groups)).not.toContain('Tabela dinâmica do ERP');
    expect(labels(groups)).toContain('Tabela de Produtos');
  });

  it('filtra pelo nome do tipo sem diferenciar maiúsculas nem acentos; grupos vazios somem', () => {
    const groups = filterFieldTypeGroups('SUSPENSA', { erpTableEnabled: false });
    expect(groups.map((group) => group.group)).toEqual(['Seleção']);
    expect(labels(groups)).toEqual(['Lista Suspensa', 'Lista Suspensa (várias)']);

    expect(labels(filterFieldTypeGroups('monetario', { erpTableEnabled: false }))).toEqual([
      'Valor Monetário',
    ]);
  });

  it('busca pelo nome do grupo traz o grupo inteiro', () => {
    const groups = filterFieldTypeGroups('documentos', { erpTableEnabled: false });
    expect(labels(groups)).toEqual(['CPF', 'CNPJ']);

    const tables = filterFieldTypeGroups('tabela', { erpTableEnabled: true });
    expect(labels(tables)).toEqual([
      'Tabela de Produtos',
      'Tabela dinâmica do ERP',
      'Pedido de itens',
    ]);
  });

  it('sem resultado devolve lista vazia', () => {
    expect(filterFieldTypeGroups('xyz', { erpTableEnabled: true })).toEqual([]);
  });
});
