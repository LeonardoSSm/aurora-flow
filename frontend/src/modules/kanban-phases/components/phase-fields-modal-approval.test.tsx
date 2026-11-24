import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type * as SolicitationsApi from '../../solicitations/services/solicitations-api';
import type { Approval, ApprovalStep, ApprovalStepWithContext, KanbanCard } from '../../solicitations/types';
import type { KanbanPhase } from '../types';
import { PhaseFieldsModal } from './phase-fields-modal';

const mocks = vi.hoisted(() => ({
  approvals: [] as unknown[],
  myPending: [] as unknown[],
  decide: vi.fn(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-sup', role: 'supervisor' },
    hasPermission: () => false,
    can: () => false,
    processesFullAccess: false,
  }),
}));
vi.mock('../hooks/use-kanban-phases-query', () => ({
  useKanbanPhasesQuery: () => ({ data: [approvalPhase] }),
}));
vi.mock('../../approvals/hooks/use-solicitation-approvals-query', () => ({
  useSolicitationApprovalsQuery: () => ({ data: mocks.approvals }),
}));
vi.mock('../../approvals/hooks/use-my-pending-approvals-query', () => ({
  useMyPendingApprovalsQuery: () => ({ data: mocks.myPending }),
}));
vi.mock('../../approvals/hooks/use-decide-approval-step-mutation', () => ({
  useDecideApprovalStepMutation: () => ({ mutate: mocks.decide, isPending: false }),
}));
vi.mock('../../solicitations/hooks/use-solicitation-attachments', () => ({
  useSolicitationAttachmentsQuery: () => ({ data: [] }),
  useRequestPhaseApprovalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadPhaseAttachmentMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../solicitations/hooks/use-move-kanban-phase-mutation', () => ({
  useMoveKanbanPhaseMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../solicitations/services/solicitations-api', async (importOriginal) => ({
  ...(await importOriginal<typeof SolicitationsApi>()),
  fetchPhaseFieldValues: () => Promise.resolve([]),
}));
vi.mock('../../solicitations/components/solicitation-erp-details', () => ({
  SolicitationErpDetails: () => null,
}));
vi.mock('./phase-timeline', () => ({ PhaseTimeline: () => null }));

const approvalPhase: KanbanPhase = {
  id: 'phase-validar',
  formId: 'form-1',
  key: 'validar',
  label: 'Validar etiqueta',
  color: 'blue',
  description: null,
  order: 1,
  isTerminal: false,
  actorRoleCode: 'operador',
  requiresApproval: true,
  approverRoleCode: 'supervisor',
  fields: [],
};

const card = {
  id: 'sol-1',
  formId: 'form-1',
  phaseId: 'phase-validar',
  phaseEnteredAt: '2026-10-29T10:00:00.000Z',
  title: 'Datar Embalagens',
} as unknown as KanbanCard;

function step(overrides: Partial<ApprovalStep> & { id: string }): ApprovalStep {
  return {
    approvalId: 'appr-1',
    assignedUserId: null,
    assignedUser: null,
    assignedRoleCode: 'supervisor',
    assignedRole: { code: 'supervisor', name: 'Supervisor' },
    status: 'pending',
    order: 1,
    decidedAt: null,
    decision: null,
    ...overrides,
  };
}

function approval(overrides: Partial<Approval> & { id: string }): Approval {
  return {
    solicitationId: 'sol-1',
    status: 'pending',
    mode: 'parallel',
    title: 'Aprovação da fase "Validar etiqueta"',
    description: null,
    requiredDecisions: 1,
    completedAt: null,
    cancelledAt: null,
    createdBy: null,
    phaseId: 'phase-validar',
    createdAt: '2026-10-29T10:05:00.000Z',
    updatedAt: '2026-10-29T10:05:00.000Z',
    steps: [step({ id: 'step-1', approvalId: overrides.id })],
    ...overrides,
  };
}

function pendingFor(item: Approval, stepId: string): ApprovalStepWithContext {
  const found = item.steps.find((s) => s.id === stepId);
  if (!found) throw new Error(`etapa ${stepId} não está na aprovação ${item.id}`);
  return {
    ...found,
    approval: {
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      solicitationId: item.solicitationId,
      createdAt: item.createdAt,
    },
  };
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PhaseFieldsModal card={card} onClose={onClose} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return onClose;
}

describe('PhaseFieldsModal — aprovação dentro do card', () => {
  beforeEach(() => {
    mocks.decide.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('quem aprova vê o aviso, os aprovadores e decide na própria fase', () => {
    const phaseApproval = approval({ id: 'appr-1' });
    mocks.approvals = [phaseApproval];
    mocks.myPending = [pendingFor(phaseApproval, 'step-1')];
    mocks.decide.mockImplementation((_vars, options) => options.onSuccess());
    const onClose = renderModal();

    expect(screen.getByText('Aguardando a sua aprovação')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a decisão' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(within(screen.getByRole('list', { name: 'Aprovadores' })).getByText('Perfil: Supervisor')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Comentário'), { target: { value: ' ok ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(mocks.decide).toHaveBeenCalledWith(
      { stepId: 'step-1', dto: { decision: 'approved', comment: 'ok' } },
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('reprovar sem comentário não envia e pede o motivo', () => {
    const phaseApproval = approval({ id: 'appr-1' });
    mocks.approvals = [phaseApproval];
    mocks.myPending = [pendingFor(phaseApproval, 'step-1')];
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Reprovar' }));

    expect(mocks.decide).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva o motivo para reprovar.');

    fireEvent.change(screen.getByLabelText('Comentário'), { target: { value: 'Etiqueta ilegível' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reprovar' }));
    expect(mocks.decide).toHaveBeenCalledWith(
      { stepId: 'step-1', dto: { decision: 'rejected', comment: 'Etiqueta ilegível' } },
      expect.anything(),
    );
  });

  it('quem não é aprovador vê só o andamento, sem botões de decisão', () => {
    mocks.approvals = [approval({ id: 'appr-1' })];
    mocks.myPending = [];
    renderModal();

    expect(screen.getByText('Aguardando aprovação')).toBeInTheDocument();
    expect(screen.getByText('Perfil: Supervisor')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando a sua aprovação')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('aprovação pedida por um fluxo (sem fase) também é decidida no card', () => {
    const flowApproval = approval({ id: 'appr-flow', phaseId: null, title: 'Aprovar compra', description: 'Valor acima de R$ 5 mil' });
    mocks.approvals = [flowApproval];
    mocks.myPending = [pendingFor(flowApproval, 'step-1')];
    renderModal();

    expect(screen.getByText('Aprovação pendente')).toBeInTheDocument();
    expect(screen.getByText('Aprovar compra')).toBeInTheDocument();
    expect(screen.getByText('Valor acima de R$ 5 mil')).toBeInTheDocument();
    // A da fase continua "não solicitada": a pendência é a do fluxo.
    expect(screen.getByText('Aprovação não solicitada')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Aprovar' })).toHaveLength(1);
  });

  it('ignora pendências de outras solicitações', () => {
    const other = approval({ id: 'appr-x', solicitationId: 'sol-2' });
    mocks.approvals = [];
    mocks.myPending = [pendingFor(other, 'step-1')];
    renderModal();

    expect(screen.queryByText('Aguardando a sua aprovação')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });
});
