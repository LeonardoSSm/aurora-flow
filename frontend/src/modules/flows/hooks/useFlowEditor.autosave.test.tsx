import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flow } from '../types/flow.types';
import { useFlowEditor } from './useFlowEditor';

const FLOW: Flow = {
  id: 'flow-1',
  name: 'Cancelamento de pedido',
  isActive: true,
  nodes: [
    { id: 'n1', type: 'trigger_form_submitted', position: { x: 0, y: 0 }, data: { label: 'A' } },
    { id: 'n2', type: 'action_move_phase', position: { x: 200, y: 0 }, data: { label: 'B' } },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  viewport: { x: 0, y: 0, zoom: 1 },
} as unknown as Flow;

const updateFlow = vi.fn();

vi.mock('../services/flows-api', () => ({
  fetchFlow: vi.fn(() => Promise.resolve(FLOW)),
  updateFlow: (...args: unknown[]) => updateFlow(...args),
  createFlow: vi.fn(),
}));

// Nós mínimos não passariam na validação; aqui só interessa o gatilho do salvamento.
vi.mock('../lib/flow-validation', () => ({ validateFlow: () => [] }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // StrictMode como no main.tsx: os efeitos rodam duas vezes antes de o GET voltar — era assim
  // que um salvamento ficava agendado e gravava o fluxo recém-aberto.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
  return renderHook(() => useFlowEditor('flow-1'), { wrapper });
}

/** Espera o carregamento e passa da guarda de 200 ms do hook. */
async function loaded(result: ReturnType<typeof setup>['result']) {
  await waitFor(() => expect(result.current.nodes).toHaveLength(2));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('useFlowEditor — salvamento automático', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateFlow.mockReset();
    updateFlow.mockImplementation((_id: string, dto: Partial<Flow>) =>
      Promise.resolve({ ...FLOW, ...dto }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('só abrir o fluxo não grava (nem pelo salvamento agendado antes da carga)', async () => {
    const { result } = setup();
    await loaded(result);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(updateFlow).not.toHaveBeenCalled();
  });

  it('abrir o fluxo e o React Flow medir/selecionar os nós não grava nada', async () => {
    const { result } = setup();
    await loaded(result);

    act(() => {
      result.current.onNodesChange([
        { id: 'n1', type: 'dimensions', dimensions: { width: 180, height: 60 } },
        { id: 'n2', type: 'dimensions', dimensions: { width: 180, height: 60 } },
        { id: 'n1', type: 'select', selected: true },
      ]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(updateFlow).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(false);
  });

  it('mover um nó grava depois da pausa', async () => {
    const { result } = setup();
    await loaded(result);

    act(() => {
      result.current.onNodesChange([{ id: 'n2', type: 'position', position: { x: 320, y: 40 } }]);
    });
    expect(result.current.isDirty).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(updateFlow).toHaveBeenCalledTimes(1);
    const dto = updateFlow.mock.calls[0][1] as { nodes: Array<{ id: string; position: unknown }> };
    expect(dto.nodes.find((n) => n.id === 'n2')?.position).toEqual({ x: 320, y: 40 });
  });

  it('mexer e desfazer antes da pausa não grava', async () => {
    const { result } = setup();
    await loaded(result);

    act(() => {
      result.current.onNodesChange([{ id: 'n2', type: 'position', position: { x: 999, y: 0 } }]);
    });
    act(() => {
      result.current.onNodesChange([{ id: 'n2', type: 'position', position: { x: 200, y: 0 } }]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(updateFlow).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(false);
  });
});
