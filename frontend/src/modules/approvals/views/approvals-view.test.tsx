import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalsView } from './approvals-view';

const mocks = vi.hoisted(() => ({ steps: [] as unknown[] }));

vi.mock('../hooks/use-my-pending-approvals-query', () => ({
  useMyPendingApprovalsQuery: () => ({ data: mocks.steps, isLoading: false, isError: false }),
}));
vi.mock('../components/decide-approval-modal', () => ({
  DecideApprovalModal: ({ target }: { target: { approvalTitle: string } }) => (
    <div role="dialog">Decidir: {target.approvalTitle}</div>
  ),
}));

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ApprovalsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.steps = [
    {
      id: 'step-1',
      status: 'pending',
      order: 1,
      approval: { id: 'approval-1', title: 'Retirar de rota: pedido 123', description: null, solicitationId: 'sol-12345678', createdAt: '2026-10-13T12:00:00Z' },
    },
  ];
});

describe('ApprovalsView — link do e-mail', () => {
  it('/aprovacoes?id=<aprovação> abre a decisão direto', () => {
    renderAt('/aprovacoes?id=approval-1');
    expect(screen.getByRole('dialog')).toHaveTextContent('Decidir: Retirar de rota: pedido 123');
  });

  it('aprovação que não está mais na fila mostra aviso', () => {
    renderAt('/aprovacoes?id=outra');
    expect(screen.getByRole('status')).toHaveTextContent('não está mais pendente para você');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
