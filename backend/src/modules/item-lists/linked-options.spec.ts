import {
  readHiddenOptionValues,
  readItemListId,
  syncLinkedOptions,
  visibleOptions,
  withHiddenOptions,
} from './linked-options';

const items = [
  { id: 'i-1', name: 'Farinha', isActive: true },
  { id: 'i-2', name: 'Açúcar', isActive: false },
  { id: 'i-3', name: 'Sal', isActive: true },
];

describe('opções de campo ligado a uma lista de itens', () => {
  it('itens ativos viram as opções, na ordem da lista (valor = id do item)', () => {
    expect(syncLinkedOptions([], items)).toEqual({
      options: [
        { value: 'i-1', label: 'Farinha' },
        { value: 'i-3', label: 'Sal' },
      ],
      hidden: [],
    });
  });

  it('item renomeado atualiza o rótulo; o que saiu da lista fica escondido com o último nome', () => {
    const existing = [
      { value: 'i-1', label: 'Farinha antiga' },
      { value: 'i-2', label: 'Açúcar' },
      { value: 'apagado', label: 'Item apagado' },
      { value: 'digitada', label: 'Opção digitada antes' },
    ];
    expect(syncLinkedOptions(existing, items)).toEqual({
      options: [
        { value: 'i-1', label: 'Farinha' },
        { value: 'i-3', label: 'Sal' },
        { value: 'i-2', label: 'Açúcar' },
        { value: 'apagado', label: 'Item apagado' },
        { value: 'digitada', label: 'Opção digitada antes' },
      ],
      hidden: ['i-2', 'apagado', 'digitada'],
    });
  });

  it('item reativado volta a aparecer', () => {
    const synced = syncLinkedOptions(
      [{ value: 'i-2', label: 'Açúcar' }],
      items.map((item) => ({ ...item, isActive: true })),
    );
    expect(synced.hidden).toEqual([]);
    expect(synced.options.map((o) => o.value)).toEqual(['i-1', 'i-2', 'i-3']);
  });

  it('configuração: lê a lista, grava/limpa as escondidas e filtra o que quem preenche vê', () => {
    expect(readItemListId({ itemListId: 'l-1' })).toBe('l-1');
    expect(readItemListId({ itemListId: '' })).toBeNull();
    expect(readItemListId(null)).toBeNull();

    const settings = withHiddenOptions({ displayAs: 'dropdown', itemListId: 'l-1' }, ['i-2']);
    expect(settings).toEqual({
      displayAs: 'dropdown',
      itemListId: 'l-1',
      hiddenOptionValues: ['i-2'],
    });
    expect(withHiddenOptions(settings, [])).toEqual({ displayAs: 'dropdown', itemListId: 'l-1' });
    expect([...readHiddenOptionValues(settings)]).toEqual(['i-2']);

    const options = [{ v: 'i-1' }, { v: 'i-2' }];
    expect(visibleOptions(options, settings, (o) => o.v)).toEqual([{ v: 'i-1' }]);
    expect(visibleOptions(options, {}, (o) => o.v)).toEqual(options);
  });
});
