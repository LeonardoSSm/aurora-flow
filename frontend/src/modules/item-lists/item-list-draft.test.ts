import { describe, expect, it } from 'vitest';
import { createDraftField } from '../builder/state/draft.helpers';
import { validateDraft } from '../builder/state/draft.validators';
import { applyFieldTypeChoice, sanitizeFieldSettings, type FormDraft } from '../builder/types';
import {
  draftToSave,
  emptyListDraft,
  listDraftIssue,
  listToDraft,
  parsePastedItems,
} from './item-list-draft';
import { parseNumber } from './item-list-columns';
import type { ItemListColumn } from './item-lists-api';
import { linkOptions, linkSettings, syncLinkedOptions, visibleOptions } from './linked-options';

const list = {
  id: 'l-1',
  name: 'Fornecedores',
  description: null,
  isActive: true,
  usage: { forms: 0, phaseFields: 0 },
  items: [
    { id: 'i-1', code: 'F1', name: 'Alfa', isActive: true, order: 0 },
    { id: 'i-2', code: null, name: 'Beta', isActive: false, order: 1 },
    { id: 'i-3', code: null, name: 'Gama', isActive: true, order: 2 },
  ],
};

describe('lista de itens — rascunho da tela', () => {
  it('colar: uma coluna é o nome; duas são código e nome; ignora vazias e nomes repetidos', () => {
    const items = parsePastedItems('Alfa\nF2\tBeta\n\nG3;Gama\nalfa', [
      { key: 'x', code: '', name: 'Delta', isActive: true, values: {} },
    ]);
    expect(items.map(({ code, name }) => ({ code, name }))).toEqual([
      { code: '', name: 'Alfa' },
      { code: 'F2', name: 'Beta' },
      { code: 'G3', name: 'Gama' },
    ]);
  });

  it('salvar mantém o id dos itens salvos, apara e ignora linhas vazias', () => {
    const draft = listToDraft(list);
    draft.items.push({ key: 'novo', code: ' N ', name: ' Novo ', isActive: true, values: {} });
    draft.items.push({ key: 'vazio', code: '', name: '  ', isActive: true, values: {} });
    expect(draftToSave(draft).items).toEqual([
      { id: 'i-1', code: 'F1', name: 'Alfa', isActive: true, values: {} },
      { id: 'i-2', code: null, name: 'Beta', isActive: false, values: {} },
      { id: 'i-3', code: null, name: 'Gama', isActive: true, values: {} },
      { code: 'N', name: 'Novo', isActive: true, values: {} },
    ]);
  });

  it('o que impede salvar: sem nome, item sem nome, nome ou código repetido', () => {
    expect(listDraftIssue(emptyListDraft())).toBe('Dê um nome à lista.');
    const base = { name: 'L', description: '', columns: [] };
    expect(
      listDraftIssue({
        ...base,
        items: [{ key: 'a', code: 'X', name: '', isActive: true, values: {} }],
      }),
    ).toBe('Todo item precisa de nome.');
    expect(
      listDraftIssue({
        ...base,
        items: [
          { key: 'a', code: '', name: 'Sal', isActive: true, values: {} },
          { key: 'b', code: '', name: ' sal ', isActive: true, values: {} },
        ],
      }),
    ).toBe('Dois itens com o nome "sal".');
    expect(
      listDraftIssue({
        ...base,
        items: [
          { key: 'a', code: 'K', name: 'A', isActive: true, values: {} },
          { key: 'b', code: 'K', name: 'B', isActive: true, values: {} },
        ],
      }),
    ).toBe('Dois itens com o código "K".');
  });
});

describe('lista de itens — colunas próprias', () => {
  const columns: ItemListColumn[] = [
    { id: 'prazo', name: 'Prazo', type: 'number' },
    { id: 'limite', name: 'Limite', type: 'currency' },
    { id: 'desde', name: 'Desde', type: 'date' },
    { id: 'ok', name: 'Homologado', type: 'checkbox' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'ap', label: 'Aprovado', color: 'green' }],
    },
  ];
  const withColumns = {
    ...list,
    columns,
    items: [
      {
        ...list.items[0],
        values: { prazo: 30, limite: 1500.5, desde: '2024-03-01', ok: true, status: 'ap' },
      },
    ],
  };

  it('carrega os valores salvos nas células e salva de volta no tipo de cada coluna', () => {
    const draft = listToDraft(withColumns);
    expect(draft.items[0].values).toEqual({
      prazo: '30',
      limite: '1.500,50',
      desde: '2024-03-01',
      ok: true,
      status: 'ap',
    });
    draft.items[0].values = { ...draft.items[0].values, limite: '2.000,75', ok: false };
    expect(draftToSave(draft)).toMatchObject({
      columns,
      items: [{ values: { prazo: 30, limite: 2000.75, desde: '2024-03-01', status: 'ap' } }],
    });
  });

  it('números no jeito brasileiro: vírgula decimal e ponto de milhar', () => {
    expect(parseNumber('1.500,50')).toBe(1500.5);
    expect(parseNumber('R$ 2.000')).toBe(2000);
    expect(parseNumber('1.250.000')).toBe(1250000);
    expect(parseNumber('1500.5')).toBe(1500.5);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('trinta')).toBeNull();
  });

  it('colar: da terceira célula em diante vai para as colunas, na ordem', () => {
    const [item] = parsePastedItems(
      'F9\tÔmega\t45\tR$ 1.200,00\t05/02/2023\tsim\taprovado',
      [],
      columns,
    );
    expect(item.values).toEqual({
      prazo: '45',
      limite: 'R$ 1.200,00',
      desde: '2023-02-05',
      ok: true,
      status: 'ap',
    });
    expect(
      draftToSave({ ...emptyListDraft(), name: 'L', columns, items: [item] }).items[0].values,
    ).toEqual({ prazo: 45, limite: 1200, desde: '2023-02-05', ok: true, status: 'ap' });
  });

  it('o que impede salvar: coluna sem nome ou repetida, número ou data inválidos', () => {
    const base = { name: 'L', description: '', items: [] };
    expect(listDraftIssue({ ...base, columns: [{ id: 'a', name: ' ', type: 'text' }] })).toBe(
      'Toda coluna precisa de nome.',
    );
    expect(listDraftIssue({ ...base, columns: [{ id: 'a', name: 'nome', type: 'text' }] })).toBe(
      'Já existe uma coluna chamada "nome".',
    );
    const item = { key: 'a', code: '', name: 'Sal', isActive: true, values: { prazo: 'trinta' } };
    expect(listDraftIssue({ ...base, columns, items: [item] })).toBe(
      '"Prazo" do item "Sal" precisa ser um número.',
    );
    expect(
      listDraftIssue({ ...base, columns, items: [{ ...item, values: { desde: '31/02/2024' } }] }),
    ).toBe('"Desde" do item "Sal" precisa ser uma data.');
  });
});

describe('campo de seleção ligado a uma lista', () => {
  it('itens ativos viram opções; o que já estava salvo e saiu fica escondido', () => {
    expect(linkOptions([{ value: 'antiga', label: 'Opção antiga' }], list)).toEqual({
      options: [
        { value: 'i-1', label: 'Alfa' },
        { value: 'i-3', label: 'Gama' },
        { value: 'antiga', label: 'Opção antiga' },
      ],
      hidden: ['antiga'],
    });
    // Item renomeado/desativado depois: rótulo atualiza, inativo vai para as escondidas.
    expect(
      syncLinkedOptions([{ value: 'i-2', label: 'Beta velho' }], list.items).options,
    ).toContainEqual({
      value: 'i-2',
      label: 'Beta',
    });
  });

  it('configuração: liga, guarda as escondidas, desliga sem sobrar nada', () => {
    const linked = linkSettings({ displayAs: 'dropdown' as const }, 'l-1', ['antiga']);
    expect(linked).toEqual({
      displayAs: 'dropdown',
      itemListId: 'l-1',
      hiddenOptionValues: ['antiga'],
    });
    expect(linkSettings(linked, null)).toEqual({ displayAs: 'dropdown' });
    expect(visibleOptions([{ v: 'i-1' }, { v: 'antiga' }], linked, (o) => o.v)).toEqual([
      { v: 'i-1' },
    ]);
  });

  it('o vínculo sobrevive a trocar entre lista suspensa, botões, única e múltipla — e ao salvar', () => {
    const settings = {
      displayAs: 'dropdown' as const,
      itemListId: 'l-1',
      hiddenOptionValues: ['x'],
    };
    expect(sanitizeFieldSettings('single_select', settings)).toEqual(settings);
    expect(applyFieldTypeChoice('multi_select', settings).settingsJson).toEqual({
      itemListId: 'l-1',
      hiddenOptionValues: ['x'],
    });
    expect(sanitizeFieldSettings('short_text', settings)).not.toHaveProperty('itemListId');
  });

  it('formulário: campo ligado precisa de pelo menos um item ativo (escondidas não contam)', () => {
    const field = {
      ...createDraftField([], 'single_select'),
      label: 'Fornecedor',
      options: [{ id: 'o', internalValue: 'antiga', displayLabel: 'Opção antiga' }],
      settingsJson: { itemListId: 'l-1', hiddenOptionValues: ['antiga'] },
    };
    const draft = {
      name: 'F',
      description: 'D',
      sections: [{ id: 's', title: 'S', description: '', fields: [field] }],
    } as unknown as FormDraft;
    expect(validateDraft(draft)?.options).toBe(
      'O campo "Fornecedor" precisa de pelo menos uma opção.',
    );
    const ok = {
      ...field,
      options: [...field.options, { id: 'p', internalValue: 'i-1', displayLabel: 'Alfa' }],
    };
    expect(
      validateDraft({ ...draft, sections: [{ ...draft.sections[0], fields: [ok] }] } as FormDraft),
    ).toBeNull();
  });
});
