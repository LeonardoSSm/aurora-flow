import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { PhaseApprovalBlock } from '../lib/phase-approval-block';
import { PhaseApprovalBlockDialog } from './phase-approval-block-dialog';

const mocks = vi.hoisted(() => ({ request: vi.fn(), pending: false }));

vi.mock('../../solicitations/hooks/use-solicitation-attachments', () => ({
  useRequestPhaseApprovalMutation: () => ({ mutateAsync: mocks.request, isPending: mocks.pending }),
}));

const required: PhaseApprovalBlock = {
  code: 'phase_approval_required',
  message: 'A fase atual ("Aprovação") exige aprovação antes de avançar.',
  phaseId: 'p-aprov',
  phaseLabel: 'Aprovação',
  approvers: ['Diretora Ana', 'perfil Financeiro'],
  canRequest: true,
};

function renderDialog(block: PhaseApprovalBlock, onClose = vi.fn()) {
  render(
    <ToastProvider>
      <PhaseApprovalBlockDialog block={block} solicitationId="sol-1" cardTitle="Compra de notebook" onClose={onClose} />
    </ToastProvider>,
  );
  return onClose;
}

describe('PhaseApprovalBlockDialog', () => {
  beforeEach(() => {
    mocks.request.mockReset().mockResolvedValue({});
  });

  it('diz quem aprova e pede a aprovação ao confirmar; o card fica na fase', async () => {
    const onClose = renderDialog(required);
    expect(screen.getByRole('dialog', { name: 'Esta fase precisa de aprovação' })).toBeInTheDocument();
    expect(screen.getByText('Diretora Ana ou perfil Financeiro')).toBeInTheDocument();
    expect(screen.getByText(/O card fica travado nesta fase, pendente da autorização/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar aprovação' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('cancelar não pede nada', () => {
    const onClose = renderDialog(required);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('falha ao pedir mantém o pop-up aberto', async () => {
    mocks.request.mockRejectedValue(new Error('falhou'));
    const onClose = renderDialog(required);
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar aprovação' }));
    await waitFor(() => expect(screen.getByText('Não foi possível solicitar a aprovação')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('quem não pode pedir só é avisado', () => {
    renderDialog({ ...required, canRequest: false });
    expect(screen.queryByRole('button', { name: 'Solicitar aprovação' })).not.toBeInTheDocument();
    expect(screen.getByText('Peça a quem atua nesta fase para solicitar a aprovação.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
  });

  it('com aprovação já pendente mostra a mensagem do servidor, sem pedir outra', () => {
    renderDialog({
      ...required,
      code: 'phase_approval_pending',
      message: 'A fase atual ("Aprovação") tem uma aprovação pendente. Aguarde a decisão para avançar.',
      canRequest: false,
    });
    expect(screen.getByRole('dialog', { name: 'Aguardando aprovação' })).toBeInTheDocument();
    expect(screen.getByText(/tem uma aprovação pendente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solicitar aprovação' })).not.toBeInTheDocument();
  });
});
