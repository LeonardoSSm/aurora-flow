import { describe, expect, it } from 'vitest';
import { fieldToSubmitItem, isAnswerEmpty, validateFieldValue } from './form-runtime';
import {
  computeItemOrderTotals,
  newItemOrderAnswers,
  searchItemOrderItems,
  toItemOrderSubmitValue,
} from './item-order';
import type { ItemOrderAnswer, PublicFormField } from './types';

const FIELD: PublicFormField = {
  id: 'f-pedido',
  code: 'pedido',
  label: 'Pedido',
  fieldType: 'item_order',
  required: true,
  order: 1,
  settingsJson: {
    sourceColumns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'preco', label: 'Preço', type: 'currency' },
    ],
    inputColumns: [
      { id: 'quantidade', label: 'Quantidade', type: 'number', required: true, min: 1, decimals: 0 },
      { id: 'obs', label: 'Observação', type: 'text' },
    ],
    items: [
      { key: 'i-1', values: { name: 'Ovo branco dúzia', code: 'OV12', preco: 12.5 } },
      { key: 'i-2', values: { name: 'Ovo caipira', code: null, preco: 18 } },
      { key: 'i-3', values: { name: 'Pão de ovo', code: 'P1', preco: 7 } },
    ],
    total: { priceColumn: 'preco', quantityColumn: 'quantidade', type: 'currency' },
  },
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};
const ITEMS = FIELD.settingsJson.items ?? [];

const answer = (rows: ItemOrderAnswer['rows']): ItemOrderAnswer => ({ kind: 'item_order', rows });

describe('Pedido de itens no formulário', () => {
  it('pesquisa sem acento, por nome ou código, quem começa com o termo primeiro', () => {
    expect(searchItemOrderItems(ITEMS, '')).toEqual([]);
    expect(searchItemOrderItems(ITEMS, 'ovo').map((item) => item.key)).toEqual(['i-1', 'i-2', 'i-3']);
    expect(searchItemOrderItems(ITEMS, 'pao').map((item) => item.key)).toEqual(['i-3']);
    expect(searchItemOrderItems(ITEMS, 'caipira ovo').map((item) => item.key)).toEqual(['i-2']);
    expect(searchItemOrderItems(ITEMS, 'ov12').map((item) => item.key)).toEqual(['i-1']);
  });

  it('item novo já vem com a quantidade mínima', () => {
    expect(newItemOrderAnswers(FIELD.settingsJson.inputColumns ?? [])).toEqual({ quantidade: 1 });
  });

  it('calcula subtotal e total com o preço da lista', () => {
    const totals = computeItemOrderTotals(
      FIELD,
      answer([
        { key: 'i-1', answers: { quantidade: 3 } },
        { key: 'i-2', answers: { quantidade: null } },
      ]),
    );
    expect(totals).toEqual({ subtotals: { 'i-1': 37.5, 'i-2': null }, total: 37.5 });
    expect(computeItemOrderTotals({ ...FIELD, settingsJson: { ...FIELD.settingsJson, total: null } }, null)).toBeNull();
  });

  it('obrigatório pede um item; células seguem as regras da coluna', () => {
    expect(validateFieldValue(FIELD, null)).toBe('Adicione pelo menos um item.');
    expect(validateFieldValue({ ...FIELD, required: false }, null)).toBeNull();
    expect(validateFieldValue(FIELD, answer([{ key: 'i-1', answers: { quantidade: 0 } }]))).toBe(
      'Corrija 1 campo do pedido.',
    );
    expect(validateFieldValue(FIELD, answer([{ key: 'i-1', answers: { quantidade: 2 } }]))).toBeNull();
    expect(isAnswerEmpty(answer([]))).toBe(true);
  });

  it('envia só a chave do item e o que foi preenchido', () => {
    const value = answer([
      { key: 'i-2', answers: { quantidade: 2, obs: '  sem casca  ' } },
      { key: 'i-1', answers: { quantidade: 1, obs: '' } },
    ]);
    expect(toItemOrderSubmitValue(FIELD, value)).toEqual({
      rows: [
        { key: 'i-2', answers: { quantidade: 2, obs: 'sem casca' } },
        { key: 'i-1', answers: { quantidade: 1 } },
      ],
    });
    expect(fieldToSubmitItem(FIELD, value)).toEqual({
      fieldId: 'f-pedido',
      fieldCode: 'pedido',
      valueJson: toItemOrderSubmitValue(FIELD, value),
    });
    expect(fieldToSubmitItem(FIELD, answer([]))).toBeNull();
  });
});
