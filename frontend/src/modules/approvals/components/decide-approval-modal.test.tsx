import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { KanbanPhase } from '../../kanban-phases/types';
import type { PhaseFieldValue } from '../../solicitations/services/solicitations-api';
import { DecideApprovalModal, type DecideApprovalTarget } from './decide-approval-modal';

const mocks = vi.hoisted(() => ({
  approval: null as unknown,
  phases: [] as unknown[],
  fetchPhaseFieldValues: vi.fn(),
}));

vi.mock('../hooks/use-solicitation-approvals-query', () => ({
  useSolicitationApprovalsQuery: () => ({ data: mocks.approval ? [mocks.approval] : [] }),
}));
vi.mock('../hooks/use-decide-approval-step-mutation', () => ({
  useDecideApprovalStepMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../solicitations/hooks/use-solicitation-attachments', () => ({
  usePhaseAttachmentsQuery: () => ({ data: [] }),
}));
vi.mock('../../kanban-phases/hooks/use-kanban-phases-query', () => ({
  useKanbanPhasesQuery: () => ({ data: mocks.phases }),
}));
vi.mock('../../solicitations/services/solicitations-api', () => ({
  fetchPhaseFieldValues: mocks.fetchPhaseFieldValues,
  fetchSolicitationById: vi.fn(),
}));

const phase: KanbanPhase = {
  id: 'phase-qtd',
  formId: 'form-1',
  key: 'quantidade_produzida',
  label: 'Quantidade produzida',
  color: 'blue',
  description: null,
  order: 2,
  isTerminal: false,
  actorRoleCode: 'operador',
  requiresApproval: true,
  approverRoleCode: 'supervisor',
  fields: [
    {
      id: 'fld-qtd',
      code: 'quantidade',
      label: 'Quantidade produzida',
      fieldType: 'number',
      required: true,
      order: 0,
      settingsJson: null,
      optionsJson: null,
    },
  ],
};

const quantityValue: PhaseFieldValue = {
  id: 'val-1',
  solicitationId: 'sol-1',
  phaseFieldId: 'fld-qtd',
  fieldCode: 'quantidade',
  valueText: null,
  valueNumber: 120,
  valueBoolean: null,
  valueJson: null,
};

const target: DecideApprovalTarget = {
  stepId: 'step-1',
  approvalId: 'appr-1',
  solicitationId: 'sol-1',
  approvalTitle: 'Aprovar quantidade',
  solicitation: {
    id: 'sol-1',
    title: 'Solicitacao - Datar Embalagens de Frango',
    formId: 'form-1',
    form: { name: 'Datar Embalagens de Frango' },
  } as never,
};

function renderModal(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('DecideApprovalModal — dados enviados pelo operador', () => {
  beforeEach(() => {
    mocks.fetchPhaseFieldValues.mockReset();
    mocks.phases = [phase];
  });

  it('mostra a quantidade produzida enviada pelo operador para o aprovador decidir', async () => {
    mocks.approval = { id: 'appr-1', title: 'Aprovar quantidade', description: null, phaseId: 'phase-qtd' };
    mocks.fetchPhaseFieldValues.mockResolvedValue([quantityValue]);

    renderModal(<DecideApprovalModal target={target} onClose={() => {}} />);

    const summary = await screen.findByRole('region', { name: 'Dados enviados nesta fase' });
    expect(summary).toHaveTextContent('Quantidade produzida');
    expect(summary).toHaveTextContent('120');
    expect(mocks.fetchPhaseFieldValues).toHaveBeenCalledWith('sol-1');
  });

  it('não busca nem mostra valores quando a aprovação não é de uma fase', () => {
    mocks.approval = { id: 'appr-1', title: 'Aprovar compra', description: null, phaseId: null };

    renderModal(<DecideApprovalModal target={target} onClose={() => {}} />);

    expect(screen.queryByRole('region', { name: 'Dados enviados nesta fase' })).not.toBeInTheDocument();
    expect(mocks.fetchPhaseFieldValues).not.toHaveBeenCalled();
  });

  it('não mostra a seção enquanto o operador não preencheu nada na fase', async () => {
    mocks.approval = { id: 'appr-1', title: 'Aprovar foto', description: null, phaseId: 'phase-qtd' };
    mocks.fetchPhaseFieldValues.mockResolvedValue([]);

    renderModal(<DecideApprovalModal target={target} onClose={() => {}} />);

    await waitFor(() => expect(mocks.fetchPhaseFieldValues).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Dados enviados nesta fase' })).not.toBeInTheDocument();
  });
});
