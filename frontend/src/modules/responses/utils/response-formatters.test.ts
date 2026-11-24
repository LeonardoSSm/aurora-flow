import type { FormDetail } from '../../forms/types';
import type { ResponseItem } from '../types';
import {
  buildFieldMetaByCode,
  responseItemToPlainText,
  responseItemToUi,
  type ResponseFieldMeta,
} from './response-formatters';

function makeItem(overrides: Partial<ResponseItem>): ResponseItem {
  return {
    id: 'item-1',
    fieldCode: 'campo',
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    ...overrides,
  };
}

function makeFieldMeta(overrides: Partial<ResponseFieldMeta>): ResponseFieldMeta {
  return {
    label: 'Campo',
    fieldType: 'short_text',
    options: [],
    settingsJson: {},
    ...overrides,
  };
}

describe('single_select — mostra o rótulo escolhido, não o internalValue', () => {
  const field = makeFieldMeta({
    fieldType: 'single_select',
    options: [
      { id: '1', internalValue: 'opcao_1', displayLabel: 'Isabel Couto', order: 1 },
      { id: '2', internalValue: 'opcao_2', displayLabel: 'Felipe Ribeiro', order: 2 },
    ],
  });

  it('responseItemToUi resolve para o texto do rótulo', () => {
    const item = makeItem({ valueText: 'opcao_1' });
    expect(responseItemToUi(item, field)).toEqual({ type: 'text', text: 'Isabel Couto' });
  });

  it('responseItemToPlainText resolve para o texto do rótulo', () => {
    const item = makeItem({ valueText: 'opcao_2' });
    expect(responseItemToPlainText(item, field)).toBe('Felipe Ribeiro');
  });

  it('sem field (chamada legada), cai no internalValue bruto', () => {
    const item = makeItem({ valueText: 'opcao_1' });
    expect(responseItemToPlainText(item)).toBe('opcao_1');
  });

  it('opção removida do formulário: mantém o valor bruto salvo em vez de sumir', () => {
    const item = makeItem({ valueText: 'opcao_excluida' });
    expect(responseItemToPlainText(item, field)).toBe('opcao_excluida');
  });
});

describe('multi_select — mostra os rótulos escolhidos como chips', () => {
  const field = makeFieldMeta({
    fieldType: 'multi_select',
    options: [
      { id: '1', internalValue: 'financeiro', displayLabel: 'Financeiro', order: 1 },
      { id: '2', internalValue: 'rh', displayLabel: 'RH', order: 2 },
    ],
  });

  it('responseItemToUi resolve cada valor para o seu rótulo', () => {
    const item = makeItem({ valueJson: ['financeiro', 'rh'] });
    expect(responseItemToUi(item, field)).toEqual({
      type: 'chips',
      chips: ['Financeiro', 'RH'],
    });
  });

  it('responseItemToPlainText junta os rótulos com vírgula', () => {
    const item = makeItem({ valueJson: ['rh'] });
    expect(responseItemToPlainText(item, field)).toBe('RH');
  });
});

describe('calculated — formata com as casas decimais e o prefixo/sufixo configurados', () => {
  const field = makeFieldMeta({
    fieldType: 'calculated',
    settingsJson: { formulaDecimals: 2, formulaPrefix: 'R$ ' },
  });

  it('responseItemToUi formata o número calculado', () => {
    const item = makeItem({ valueNumber: 1234.5 });
    expect(responseItemToUi(item, field)).toEqual({ type: 'text', text: 'R$ 1.234,50' });
  });

  it('responseItemToPlainText formata o número calculado', () => {
    const item = makeItem({ valueNumber: 10 });
    expect(responseItemToPlainText(item, field)).toBe('R$ 10,00');
  });

  it('sem valor (ex.: origens do cálculo vazias), mostra "-"', () => {
    const item = makeItem({ valueNumber: null });
    expect(responseItemToUi(item, field)).toEqual({ type: 'text', text: '-' });
  });
});

describe('product_table — mantém a tabela com colunas dinâmicas', () => {
  const field = makeFieldMeta({ fieldType: 'product_table' });

  it('responseItemToUi monta uma tabela com as colunas usadas', () => {
    const item = makeItem({
      valueJson: [
        { produto: 'Caneta', values: { Quantidade: 10, Preço: 1.5 } },
        { produto: 'Caderno', values: { Quantidade: 2 } },
      ],
    });
    expect(responseItemToUi(item, field)).toEqual({
      type: 'table',
      columns: ['Quantidade', 'Preço'],
      rows: [
        { produto: 'Caneta', cells: ['10', '1,5'] },
        { produto: 'Caderno', cells: ['2', '-'] },
      ],
    });
  });
});

describe('tipos sem tratamento especial continuam funcionando como antes', () => {
  it('checkbox vira badge Sim/Não', () => {
    const item = makeItem({ valueBoolean: true });
    expect(responseItemToUi(item, makeFieldMeta({ fieldType: 'checkbox' }))).toEqual({
      type: 'badge',
      text: 'Sim',
      className: 'bg-emerald-100 text-emerald-800',
    });
  });

  it('short_text mostra o texto puro', () => {
    const item = makeItem({ valueText: 'Observação livre' });
    expect(responseItemToPlainText(item, makeFieldMeta({ fieldType: 'short_text' }))).toBe(
      'Observação livre',
    );
  });

  it('number mostra o número formatado em pt-BR', () => {
    const item = makeItem({ valueNumber: 1500 });
    expect(responseItemToPlainText(item, makeFieldMeta({ fieldType: 'number' }))).toBe('1.500');
  });
});

describe('buildFieldMetaByCode', () => {
  function makeForm(): FormDetail {
    return {
      id: 'form-1',
      name: 'Formulário',
      description: null,
      status: 'published',
      category: null,
      area: null,
      createdAt: '',
      createdBy: '',
      createdByUser: { id: '', fullName: '', email: '', role: '' },
      assignees: [],
      googleSheetsEnabled: false,
      googleSheetsAutoCreate: false,
      googleSpreadsheetId: null,
      googleSpreadsheetUrl: null,
      googleSheetTitle: null,
      googleLinkedUserId: null,
      googleLastSyncedAt: null,
      googleLastError: null,
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          titleDisplay: '',
          descriptionDisplay: null,
          isPublished: false,
          publishedAt: null,
          createdAt: '',
          settingsJson: {},
          sections: [
            {
              id: 's1',
              title: '',
              description: null,
              order: 1,
              nextSectionId: null,
              nextIsSubmit: true,
              flowPositionX: null,
              flowPositionY: null,
              branches: [],
              fields: [
                {
                  id: 'f-old',
                  code: 'supervisor',
                  label: 'Supervisor (antigo)',
                  fieldType: 'single_select',
                  required: true,
                  isSensitive: false,
                  order: 1,
                  settingsJson: {},
                  conditionsJson: {},
                  visibilityRules: null,
                  options: [],
                },
              ],
            },
          ],
        },
        {
          id: 'v2',
          versionNumber: 2,
          titleDisplay: '',
          descriptionDisplay: null,
          isPublished: true,
          publishedAt: null,
          createdAt: '',
          settingsJson: {},
          sections: [
            {
              id: 's2',
              title: '',
              description: null,
              order: 1,
              nextSectionId: null,
              nextIsSubmit: true,
              flowPositionX: null,
              flowPositionY: null,
              branches: [],
              fields: [
                {
                  id: 'f-new',
                  code: 'supervisor',
                  label: 'Nome do Supervisor/Gerente',
                  fieldType: 'single_select',
                  required: true,
                  isSensitive: false,
                  order: 1,
                  settingsJson: {},
                  conditionsJson: {},
                  visibilityRules: null,
                  options: [
                    { id: '1', internalValue: 'opcao_1', displayLabel: 'Isabel Couto', order: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('usa a versão mais recente do formulário, não a primeira', () => {
    const map = buildFieldMetaByCode(makeForm());
    expect(map.supervisor.label).toBe('Nome do Supervisor/Gerente');
    expect(map.supervisor.options).toEqual([
      { id: '1', internalValue: 'opcao_1', displayLabel: 'Isabel Couto', order: 1 },
    ]);
  });

  it('formulário nulo devolve um mapa vazio', () => {
    expect(buildFieldMetaByCode(null)).toEqual({});
  });
});

describe('responseItemToUi — Tabela dinâmica do ERP', () => {
  it('desenha o retrato gravado com os rótulos do envio, sem depender do campo atual', () => {
    const item = makeItem({
      valueText: 'Ovos | Qtd. conferida: 8',
      valueJson: {
        schemaVersion: 1,
        source: { dataset: 'itens', dependencies: { pedido: '1' }, fetchedAt: '', sourceHash: '' },
        columns: {
          source: [
            { key: 'produto', label: 'Produto', type: 'text' },
            { key: 'total', label: 'Total', type: 'currency' },
          ],
          input: [{ id: 'conferida', label: 'Qtd. conferida', type: 'number', decimals: null }],
        },
        rows: [
          { key: 'A', sourceValues: { produto: 'Ovos', total: 10 }, answers: { conferida: 8 } },
        ],
      },
    });

    const ui = responseItemToUi(item);

    expect(ui.type).toBe('erp_table');
    if (ui.type !== 'erp_table') return;
    expect(ui.columns).toEqual([
      { label: 'Produto', fromErp: true, numeric: false },
      { label: 'Total', fromErp: true, numeric: true },
      { label: 'Qtd. conferida', fromErp: false, numeric: true },
    ]);
    expect(ui.rows[0].cells[0]).toBe('Ovos');
    expect(ui.rows[0].cells[1]).toMatch(/R\$\s10,00/);
    expect(ui.rows[0].cells[2]).toBe('8');
    // Texto puro (exportação, lista) usa o resumo gravado em value_text.
    expect(responseItemToPlainText(item)).toBe('Ovos | Qtd. conferida: 8');
  });
});
