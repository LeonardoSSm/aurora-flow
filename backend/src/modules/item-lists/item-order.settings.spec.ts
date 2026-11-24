import {
  buildItemOrderAnswer,
  buildItemOrderSummary,
  ITEM_SUBTOTAL_COLUMN,
  type ItemOrderList,
  type ItemOrderSettings,
  type ItemOrderSubmission,
  listItemOrderSettingsProblems,
  parseItemOrderSettings,
  readItemOrderSubmission,
  toPublicItemOrderSettings,
} from './item-order.settings';

const LIST_ID = '11111111-1111-4111-8111-111111111111';

const list: ItemOrderList = {
  id: LIST_ID,
  name: 'Ovos',
  columns: [
    { id: 'preco', name: 'Preço', type: 'currency' },
    {
      id: 'tipo',
      name: 'Tipo',
      type: 'select',
      options: [{ id: 'o-1', label: 'Branco', color: 'gray' }],
    },
    { id: 'obs', name: 'Observação', type: 'text' },
  ],
  items: [
    {
      id: 'i-1',
      code: 'OV12',
      name: 'Ovo branco dúzia',
      isActive: true,
      valuesJson: { preco: 12.5, tipo: 'o-1', obs: 'interno' },
    },
    { id: 'i-2', code: null, name: 'Ovo caipira', isActive: true, valuesJson: { preco: 18 } },
    { id: 'i-3', code: 'OLD', name: 'Ovo de codorna', isActive: false, valuesJson: {} },
  ],
};

const quantidade = {
  id: 'quantidade',
  label: 'Quantidade',
  type: 'number',
  required: true,
  min: 1,
  decimals: 0,
};

const rawSettings = {
  itemListId: LIST_ID,
  itemColumns: ['code', 'tipo', 'preco'],
  inputColumns: [quantidade],
  totalPriceColumn: 'preco',
  totalQuantityColumn: 'quantidade',
};

describe('item-order.settings', () => {
  it('sem lista escolhida a configuração não existe', () => {
    expect(parseItemOrderSettings({ itemColumns: ['code'] })).toBeNull();
    expect(listItemOrderSettingsProblems({}, undefined)).toEqual(['escolha a lista de itens']);
  });

  it('o público recebe colunas com nome atual, só itens ativos e sem colunas não escolhidas', () => {
    const settings = toPublicItemOrderSettings(rawSettings, list);
    expect(settings.sourceColumns).toEqual([
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'tipo', label: 'Tipo', type: 'text' },
      { key: 'preco', label: 'Preço', type: 'currency' },
    ]);
    expect(settings.items).toEqual([
      {
        key: 'i-1',
        values: { name: 'Ovo branco dúzia', code: 'OV12', tipo: 'Branco', preco: 12.5 },
      },
      { key: 'i-2', values: { name: 'Ovo caipira', code: null, tipo: null, preco: 18 } },
    ]);
    expect(settings.total).toEqual({
      priceColumn: 'preco',
      quantityColumn: 'quantidade',
      type: 'currency',
    });
    expect(settings).not.toHaveProperty('itemListId');
  });

  it('monta o retrato com valores da lista, subtotal e total', () => {
    const settings = parseItemOrderSettings(rawSettings) as ItemOrderSettings;
    const submitted = readItemOrderSubmission({
      rows: [
        { key: 'i-2', answers: { quantidade: 2 } },
        { key: 'i-1', answers: { quantidade: 3 } },
      ],
    }) as ItemOrderSubmission;
    const { answer, errors } = buildItemOrderAnswer(settings, list, submitted);
    expect(errors).toEqual([]);
    expect(answer.rows).toEqual([
      {
        key: 'i-2',
        sourceValues: { name: 'Ovo caipira', code: null, tipo: null, preco: 18 },
        answers: { quantidade: 2, [ITEM_SUBTOTAL_COLUMN]: 36 },
      },
      {
        key: 'i-1',
        sourceValues: {
          name: 'Ovo branco dúzia',
          code: 'OV12',
          tipo: 'Branco',
          preco: 12.5,
        },
        answers: { quantidade: 3, [ITEM_SUBTOTAL_COLUMN]: 37.5 },
      },
    ]);
    expect(answer.total).toBe(73.5);
    expect(answer.columns.input.map((column) => column.label)).toEqual(['Quantidade', 'Subtotal']);
    expect(answer.source).toEqual({ kind: 'item_list', itemListId: LIST_ID, listName: 'Ovos' });
    // O Intl separa "R$" do valor com espaço sem quebra.
    expect(buildItemOrderSummary(answer).replace(/ /g, ' ').split('\n')).toEqual([
      'Ovo caipira | Preço: R$ 18,00 | Quantidade: 2 | Subtotal: R$ 36,00',
      'Ovo branco dúzia - OV12 | Tipo: Branco | Preço: R$ 12,50 | Quantidade: 3 | Subtotal: R$ 37,50',
      'Total: R$ 73,50',
    ]);
  });

  it('recusa item inativo, inexistente, repetido e quantidade abaixo do mínimo', () => {
    const settings = parseItemOrderSettings(rawSettings) as ItemOrderSettings;
    const { errors } = buildItemOrderAnswer(settings, list, {
      rows: [
        { key: 'i-1', answers: { quantidade: 0 } },
        { key: 'i-1', answers: { quantidade: 1 } },
        { key: 'i-3', answers: { quantidade: 1 } },
        { key: 'sumiu', answers: { quantidade: 1 } },
        { key: 'i-2', answers: {} },
      ],
    });
    expect(errors).toEqual([
      'Ovo branco dúzia: Quantidade — mínimo 1.',
      'O item "Ovo branco dúzia" foi adicionado duas vezes.',
      'O item "Ovo de codorna" não está mais disponível. Remova-o e envie de novo.',
      'O item 4 não existe mais na lista. Remova-o e envie de novo.',
      'Ovo caipira: Quantidade — obrigatório.',
    ]);
  });

  it('aponta o que falta para publicar', () => {
    expect(listItemOrderSettingsProblems(rawSettings, null)).toEqual([
      'a lista de itens escolhida não existe mais',
    ]);
    expect(listItemOrderSettingsProblems(rawSettings, list)).toEqual([]);
    expect(
      listItemOrderSettingsProblems(
        {
          itemListId: LIST_ID,
          itemColumns: ['obs'],
          inputColumns: [],
          totalPriceColumn: 'preco',
        },
        list,
      ),
    ).toEqual([
      'adicione pelo menos uma coluna para preencher (ex.: Quantidade)',
      'para o total, escolha uma coluna de número ou valor da lista que apareça',
      'para o total, escolha uma coluna preenchida de número ou valor',
    ]);
  });

  it('formato inválido do envio vira null', () => {
    expect(readItemOrderSubmission({ rows: [{ key: '' }] })).toBeNull();
    expect(readItemOrderSubmission([])).toBeNull();
    expect(readItemOrderSubmission({ rows: [{ key: 'i-1' }] })).toEqual({
      rows: [{ key: 'i-1', answers: {} }],
    });
  });
});
