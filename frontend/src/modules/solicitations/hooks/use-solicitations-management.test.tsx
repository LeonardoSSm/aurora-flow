import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UNAVAILABLE_SOLICITATION_NOTICE, useSolicitationsManagement } from './use-solicitations-management';

const mocks = vi.hoisted(() => ({ list: vi.fn(), byId: vi.fn(), history: vi.fn() }));
vi.mock('../services/solicitations-api', () => ({
  fetchSolicitations: () => mocks.list(),
  fetchSolicitationById: (id: string) => mocks.byId(id),
  fetchSolicitationHistory: (id: string) => mocks.history(id),
  createSolicitation: vi.fn(),
}));

function httpError(status: number) {
  return new AxiosError('falhou', String(status), undefined, undefined, { status } as AxiosResponse);
}

function renderManagement(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return renderHook(() => useSolicitationsManagement(), { wrapper });
}

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue({
    data: [{ id: 'sol-a' }, { id: 'sol-b' }],
    total: 2,
    page: 1,
    limit: 12,
    totalPages: 1,
  });
  mocks.byId.mockReset().mockImplementation((id: string) =>
    id === 'sol-bloqueada' ? Promise.reject(httpError(403)) : Promise.resolve({ id, formId: null }),
  );
  mocks.history.mockReset().mockResolvedValue([]);
});

describe('useSolicitationsManagement — link direto', () => {
  it('card sem acesso: avisa, não tenta de novo e abre o primeiro da lista', async () => {
    const { result } = renderManagement('/solicitacoes?solicitationId=sol-bloqueada');

    await waitFor(() => expect(result.current.notice).toBe(UNAVAILABLE_SOLICITATION_NOTICE));
    await waitFor(() => expect(result.current.selectedSolicitationId).toBe('sol-a'));
    expect(mocks.byId.mock.calls.filter(([id]) => id === 'sol-bloqueada')).toHaveLength(1);

    // Escolher outro card na lista tira o aviso.
    act(() => result.current.setSelectedSolicitationId('sol-b'));
    expect(result.current.notice).toBeNull();
    expect(result.current.selectedSolicitationId).toBe('sol-b');
  });

  it('card que abre normalmente não mostra aviso', async () => {
    const { result } = renderManagement('/solicitacoes?solicitationId=sol-b');
    await waitFor(() => expect(result.current.selectedSolicitation).toEqual({ id: 'sol-b', formId: null }));
    expect(result.current.notice).toBeNull();
  });

  it('erro que não é de acesso (servidor fora) não troca o card nem avisa', async () => {
    mocks.byId.mockImplementation(() => Promise.reject(httpError(500)));
    const { result } = renderManagement('/solicitacoes?solicitationId=sol-b');
    await waitFor(() => expect(mocks.byId).toHaveBeenCalledWith('sol-b'));
    // Erro de servidor ainda tenta mais uma vez (≈1 s) antes de desistir.
    await waitFor(() => expect(mocks.byId).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(result.current.loadingDetail).toBe(false));
    expect(result.current.selectedSolicitationId).toBe('sol-b');
    expect(result.current.notice).toBeNull();
  });
});
