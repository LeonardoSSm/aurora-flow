import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchItemList } from '../../item-lists/item-lists-api';
import type * as ItemListsApi from '../../item-lists/item-lists-api';
import type { PublicAnswerValue, PublicFormField } from '../types';
import { ItemOrderField } from './item-order-field';

vi.mock('../../item-lists/item-lists-api', async (importOriginal) => {
  const original = await importOriginal<typeof ItemListsApi>();
  return { ...original, fetchItemList: vi.fn() };
});
const fetchList = vi.mocked(fetchItemList);
beforeEach(() => fetchList.mockReset());

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
      { key: 'preco', label: 'Preço', type: 'currency' },
    ],
    inputColumns: [
      { id: 'quantidade', label: 'Quantidade', type: 'number', required: true, min: 1, decimals: 0 },
    ],
    items: [
      { key: 'i-1', values: { name: 'Ovo branco dúzia', preco: 12.5 } },
      { key: 'i-2', values: { name: 'Ovo caipira', preco: 18 } },
      { key: 'i-3', values: { name: 'Leite', preco: 5 } },
    ],
    total: { priceColumn: 'preco', quantityColumn: 'quantidade', type: 'currency' },
  },
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};

/** O formulário de verdade guarda a resposta no hook; aqui um estado local faz o papel. */
function Harness({ field = FIELD, formId = 'form-1' }: { field?: PublicFormField; formId?: string }) {
  const [value, setValue] = useState<PublicAnswerValue>(null);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <ItemOrderField field={field} value={value} formId={formId || undefined} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </QueryClientProvider>
  );
}

const search = () => screen.getByRole('combobox', { name: /Pesquisar item/ });
const value = () => JSON.parse(screen.getByTestId('value').textContent ?? 'null');
// O item aparece no cartão (celular) e na tabela; nos testes vale a tabela.
const table = () => screen.getByRole('table');
const nbsp = (text: string | null) => (text ?? '').replace(/ /g, ' ');

describe('ItemOrderField', () => {
  it('não mostra a lista inteira: só o que a pesquisa encontra', () => {
    render(<Harness />);
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText(/Nenhum item adicionado/)).toBeTruthy();

    fireEvent.change(search(), { target: { value: 'ovo' } });
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Ovo branco dúzia'),
      expect.stringContaining('Ovo caipira'),
    ]);
  });

  it('adiciona pelo clique com a quantidade mínima e soma o total', () => {
    render(<Harness />);
    fireEvent.change(search(), { target: { value: 'caipira' } });
    fireEvent.click(screen.getByRole('option', { name: /Ovo caipira/ }));

    expect(value()).toEqual({ kind: 'item_order', rows: [{ key: 'i-2', answers: { quantidade: 1 } }] });
    expect((search() as HTMLInputElement).value).toBe('');

    const quantity = within(table()).getByRole('spinbutton', { name: 'Quantidade — Ovo caipira' });
    fireEvent.change(quantity, { target: { value: '3' } });
    expect(nbsp(screen.getByText(/^Total:/).textContent)).toBe('Total: R$ 54,00');
  });

  it('Enter adiciona o item destacado; repetir não duplica', () => {
    render(<Harness />);
    fireEvent.change(search(), { target: { value: 'leite' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    fireEvent.change(search(), { target: { value: 'leite' } });
    expect(screen.getByRole('option', { name: /Leite/ }).textContent).toContain('No pedido');
    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(value().rows).toEqual([{ key: 'i-3', answers: { quantidade: 1 } }]);
  });

  it('remove o item; sem itens a resposta volta a vazia', () => {
    render(<Harness />);
    fireEvent.change(search(), { target: { value: 'leite' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    fireEvent.click(within(table()).getByRole('button', { name: 'Remover Leite' }));
    expect(value()).toBeNull();
    expect(screen.getByText(/Nenhum item adicionado/)).toBeTruthy();
  });

  it('quantidade abaixo do mínimo mostra o erro na célula', () => {
    render(<Harness />);
    fireEvent.change(search(), { target: { value: 'leite' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    fireEvent.change(within(table()).getByRole('spinbutton', { name: 'Quantidade — Leite' }), {
      target: { value: '0' },
    });
    expect(within(table()).getByText('Mínimo 1.')).toBeTruthy();
  });

  it('na pré-visualização do construtor carrega a lista e a pesquisa funciona', async () => {
    fetchList.mockResolvedValue({
      id: 'l-1',
      name: 'Ovos',
      description: null,
      isActive: true,
      columns: [{ id: 'preco', name: 'Preço', type: 'currency' }],
      items: [
        { id: 'i-1', code: 'OV12', name: 'Ovo branco dúzia', isActive: true, order: 0, values: { preco: 12.5 } },
        { id: 'i-9', code: null, name: 'Ovo inativo', isActive: false, order: 1, values: {} },
      ],
      usage: { forms: 1, phaseFields: 0 },
    });
    render(
      <Harness
        formId=""
        field={{
          ...FIELD,
          settingsJson: {
            itemListId: 'l-1',
            itemColumns: ['preco'],
            inputColumns: FIELD.settingsJson.inputColumns,
            totalPriceColumn: 'preco',
            totalQuantityColumn: 'quantidade',
          },
        }}
      />,
    );
    await waitFor(() => expect(search()).toBeTruthy());
    expect(fetchList).toHaveBeenCalledWith('l-1');
    fireEvent.change(search(), { target: { value: 'ovo' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('Ovo branco dúzia'),
    ]);
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(nbsp(screen.getByText(/^Total:/).textContent)).toBe('Total: R$ 12,50');
  });

  it('sem lista escolhida, pede para escolher nas configurações', () => {
    render(
      <Harness formId="" field={{ ...FIELD, settingsJson: { inputColumns: FIELD.settingsJson.inputColumns } }} />,
    );
    expect(screen.getByText('Escolha a lista de itens nas configurações do campo.')).toBeTruthy();
    expect(fetchList).not.toHaveBeenCalled();
  });
});
