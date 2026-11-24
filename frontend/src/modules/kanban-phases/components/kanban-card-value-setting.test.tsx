import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import { KanbanCardValueSetting } from './kanban-card-value-setting';

const mocks = vi.hoisted(() => ({
  settings: { cardValueField: 'numero_cupom' as string | null },
  save: vi.fn(),
}));

vi.mock('../services/kanban-phases-api', () => ({
  fetchKanbanSettings: () => Promise.resolve(mocks.settings),
  saveKanbanSettings: (_formId: string, settings: { cardValueField: string | null }) => {
    mocks.save(settings);
    return Promise.resolve(settings);
  },
}));
vi.mock('../../flows/hooks/use-flow-form-fields', () => ({
  useFlowFormFields: () => ({
    isLoading: false,
    data: [
      { code: 'loja', label: 'Loja', fieldType: 'text' },
      { code: 'numero_cupom', label: 'Numero do Cupom', fieldType: 'number', phaseLabel: 'Gerar pedido' },
      { code: 'valor_total', label: 'Valor total do Pedido', fieldType: 'currency', phaseLabel: 'Gerar pedido' },
      // "Total de horas" é cálculo, mas em horas: não vira R$ no card.
      { code: 'total_horas', label: 'Total de horas', fieldType: 'calculated', formulaFormat: 'hours' },
    ],
  }),
}));

function renderSetting() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <KanbanCardValueSetting formId="form-1" compact />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('KanbanCardValueSetting', () => {
  beforeEach(() => mocks.save.mockClear());

  it('mostra o campo gravado, só campos de valor (sem o Total de horas), com a fase de cada um', async () => {
    renderSetting();
    const select = screen.getByLabelText('Valor do card') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('numero_cupom'));
    const labels = Array.from(select.options).map((option) => option.text);
    expect(labels).toEqual([
      'Nenhum (card sem valor)',
      'Numero do Cupom (fase Gerar pedido)',
      'Valor total do Pedido (fase Gerar pedido)',
    ]);
  });

  it('grava o campo escolhido na hora', async () => {
    renderSetting();
    const select = screen.getByLabelText('Valor do card') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('numero_cupom'));
    fireEvent.change(select, { target: { value: 'valor_total' } });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ cardValueField: 'valor_total' }));
    await waitFor(() => expect(select.value).toBe('valor_total'));
  });
});
