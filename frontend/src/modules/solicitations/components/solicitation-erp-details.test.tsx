import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SolicitationErpDetails } from './solicitation-erp-details';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../services/solicitations-api', () => ({
  fetchSolicitationErpDetails: (id: string) => mocks.fetch(id),
}));

function renderDetails() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SolicitationErpDetails solicitationId="sol-1" />
    </QueryClientProvider>,
  );
}

const ficha = {
  value: '1000',
  titulo: 'Pedido 1000',
  alertas: [{ tipo: 'perigo', texto: 'Pedido CANCELADO' }],
  resumo: [{ label: 'Cliente', valor: 'JOSE MARIA PACHECO' }],
  secoes: [],
  tabelas: [],
};

beforeEach(() => mocks.fetch.mockReset());

describe('SolicitationErpDetails', () => {
  it('mostra a ficha de cada "Lista do ERP" respondida', async () => {
    mocks.fetch.mockResolvedValue([
      { fieldCode: 'pedido', fieldLabel: 'Pedido', value: '1000', label: 'Pedido 1000 — JOSE MARIA', status: 'ok', details: ficha },
    ]);
    renderDetails();
    expect(await screen.findByText('Pedido (ERP)')).toBeInTheDocument();
    expect(screen.getByText('Pedido 1000 — JOSE MARIA')).toBeInTheDocument();
    expect(screen.getByText('JOSE MARIA PACHECO')).toBeInTheDocument();
    expect(screen.getByText('Pedido CANCELADO')).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith('sol-1');
  });

  it('ERP fora: mantém o nome gravado e permite consultar de novo; recolher esconde a ficha', async () => {
    mocks.fetch
      .mockResolvedValueOnce([{ fieldCode: 'pedido', fieldLabel: 'Pedido', value: '1000', label: 'Pedido 1000', status: 'indisponivel', details: null }])
      .mockResolvedValueOnce([{ fieldCode: 'pedido', fieldLabel: 'Pedido', value: '1000', label: 'Pedido 1000', status: 'ok', details: ficha }]);
    renderDetails();
    expect(await screen.findByText(/ERP indisponível agora/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Consultar de novo/ }));
    expect(await screen.findByText('JOSE MARIA PACHECO')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('JOSE MARIA PACHECO')).not.toBeInTheDocument();
  });

  it('solicitação sem campo do ERP não mostra nada', async () => {
    mocks.fetch.mockResolvedValue([]);
    const { container } = renderDetails();
    await vi.waitFor(() => expect(screen.queryByText(/Consultando o ERP/)).not.toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Dados do ERP"]')).toBeNull();
  });
});
