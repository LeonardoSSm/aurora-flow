import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { Node } from '@xyflow/react';
import { vi } from 'vitest';
import { FlowTestModal } from './FlowTestModal';

const mocks = vi.hoisted(() => ({ runFlowTest: vi.fn() }));

vi.mock('../services/flows-api', () => ({ runFlowTest: mocks.runFlowTest }));

const nodes = [
  { id: 'gatilho', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: { label: 'Foto da etiqueta enviada' } },
  { id: 'lops', type: 'action_ai_agent', position: { x: 0, y: 0 }, data: {} },
  { id: 'status', type: 'condition_solicitation_status', position: { x: 0, y: 0 }, data: {} },
  { id: 'aprovacao', type: 'action_create_approval', position: { x: 0, y: 0 }, data: { label: 'Criar Aprovação' } },
] as Node[];

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FlowTestModal flowId="flow-id" formId={null} nodes={nodes} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('FlowTestModal', () => {
  beforeEach(() => {
    mocks.runFlowTest.mockReset();
  });

  it('mostra cada nó pelo nome, com o que as ações simuladas fariam, avisos e falhas', async () => {
    mocks.runFlowTest.mockResolvedValue([
      { nodeId: 'gatilho', status: 'success', durationMs: 0 },
      {
        nodeId: 'lops',
        status: 'success',
        output: { dryRun: true, summary: 'Enviaria a imagem enviada ao agente "validador-de-etiquetas".' },
        durationMs: 1,
      },
      {
        nodeId: 'status',
        status: 'success',
        output: {
          dryRun: true,
          summary: 'Seguiu o caminho "Não" sem a solicitação, que vem do evento real.',
          warning: 'Na execução real o caminho pode ser outro.',
        },
        durationMs: 0,
      },
      { nodeId: 'aprovacao', status: 'failed', error: 'action_create_approval requer assignedUserIds.', durationMs: 2 },
    ]);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Executar teste/ }));

    expect(await screen.findByText('1 OK · 1 simulado(s) · 1 aviso(s) · 1 falha(s)')).toBeInTheDocument();
    expect(screen.getByText('Foto da etiqueta enviada')).toBeInTheDocument();
    // Sem label no nó, usa o nome da biblioteca — nunca o id interno.
    expect(screen.getByText('Agente de IA')).toBeInTheDocument();
    expect(screen.queryByText('lops')).not.toBeInTheDocument();
    expect(screen.getByText('Simulado')).toBeInTheDocument();
    expect(screen.getByText('Enviaria a imagem enviada ao agente "validador-de-etiquetas".')).toBeInTheDocument();
    expect(screen.getByText('Na execução real o caminho pode ser outro.')).toBeInTheDocument();
    expect(screen.getByText('action_create_approval requer assignedUserIds.')).toBeInTheDocument();
    expect(mocks.runFlowTest).toHaveBeenCalledWith('flow-id', { fieldValues: {} });
  });

  it('mostra a mensagem de erro do servidor quando o teste não roda', async () => {
    mocks.runFlowTest.mockRejectedValue(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404,
        data: { message: 'Fluxo não encontrado.' },
      } as AxiosResponse),
    );
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Executar teste/ }));

    expect(await screen.findByText('Fluxo não encontrado.')).toBeInTheDocument();
  });
});
