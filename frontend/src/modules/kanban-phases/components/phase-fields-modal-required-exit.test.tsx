import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type * as SolicitationsApi from '../../solicitations/services/solicitations-api';
import type { KanbanCard } from '../../solicitations/types';
import type { KanbanPhase, KanbanPhaseField } from '../types';
import { PhaseFieldsModal } from './phase-fields-modal';

const mocks = vi.hoisted(() => ({
  saved: [] as unknown[],
  requireFieldsToExit: true,
  requireAssigneeToExit: false,
  responsibleUserId: null as string | null,
  move: vi.fn(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-op', role: 'operador' },
    hasPermission: () => false,
    can: () => true,
    processesFullAccess: false,
  }),
}));
vi.mock('../hooks/use-kanban-phases-query', () => ({
  useKanbanPhasesQuery: () => ({
    data: [
      triagem,
      { ...conferencia, requireFieldsToExit: mocks.requireFieldsToExit, requireAssigneeToExit: mocks.requireAssigneeToExit },
      expedicao,
    ],
  }),
}));
vi.mock('../../approvals/hooks/use-solicitation-approvals-query', () => ({
  useSolicitationApprovalsQuery: () => ({ data: [] }),
}));
vi.mock('../../approvals/hooks/use-my-pending-approvals-query', () => ({
  useMyPendingApprovalsQuery: () => ({ data: [] }),
}));
vi.mock('../../solicitations/hooks/use-solicitation-attachments', () => ({
  useSolicitationAttachmentsQuery: () => ({ data: [] }),
  useRequestPhaseApprovalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadPhaseAttachmentMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../solicitations/hooks/use-move-kanban-phase-mutation', () => ({
  useMoveKanbanPhaseMutation: () => ({ mutate: mocks.move, isPending: false }),
}));
vi.mock('../../solicitations/services/solicitations-api', async (importOriginal) => ({
  ...(await importOriginal<typeof SolicitationsApi>()),
  fetchPhaseFieldValues: () => Promise.resolve(mocks.saved),
}));
vi.mock('../../solicitations/components/solicitation-erp-details', () => ({
  SolicitationErpDetails: () => null,
}));
vi.mock('./phase-timeline', () => ({ PhaseTimeline: () => null }));

function field(id: string, label: string, overrides: Partial<KanbanPhaseField> = {}): KanbanPhaseField {
  return {
    id,
    code: id,
    label,
    fieldType: 'short_text',
    required: true,
    order: 0,
    settingsJson: null,
    optionsJson: null,
    ...overrides,
  };
}

function phase(id: string, label: string, order: number, fields: KanbanPhaseField[] = []): KanbanPhase {
  return {
    id,
    formId: 'form-1',
    key: id,
    label,
    color: 'blue',
    description: null,
    order,
    isTerminal: false,
    actorRoleCode: null,
    requiresApproval: false,
    approverRoleCode: null,
    fields,
  };
}

const triagem = phase('p-triagem', 'Triagem', 0);
const conferencia = phase('p-conf', 'Conferência', 1, [
  field('nota', 'Nota fiscal', { order: 0 }),
  field('conferido', 'Conferido', { fieldType: 'checkbox', order: 1 }),
]);
const expedicao = phase('p-exped', 'Expedição', 2);

const card = {
  id: 'sol-1',
  formId: 'form-1',
  phaseId: 'p-conf',
  phaseEnteredAt: '2026-11-06T10:00:00.000Z',
  title: 'Pedido 123',
} as unknown as KanbanCard;

function value(phaseFieldId: string, patch: object) {
  return { id: `v-${phaseFieldId}`, solicitationId: 'sol-1', phaseFieldId, fieldCode: phaseFieldId, valueText: null, valueNumber: null, valueBoolean: null, valueJson: null, ...patch };
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PhaseFieldsModal card={{ ...card, responsibleUserId: mocks.responsibleUserId }} onClose={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PhaseFieldsModal — só avançar com os obrigatórios preenchidos', () => {
  beforeEach(() => {
    mocks.move.mockReset();
    mocks.requireFieldsToExit = true;
    mocks.requireAssigneeToExit = false;
    mocks.responsibleUserId = null;
  });

  it('diz quais campos faltam e só deixa escolher fase anterior', async () => {
    mocks.saved = [value('nota', { valueText: 'NF 1' })];
    renderModal();

    // Antes dos valores salvos chegarem, os dois campos aparecem: espera a lista final.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Para avançar, preencha e salve o campo obrigatório: “Conferido”. Voltar para uma fase anterior continua livre.',
      ),
    );
    expect(screen.getByRole('option', { name: 'Expedição' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Triagem' })).not.toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-triagem' } });
    expect(mocks.move).toHaveBeenCalledWith({ id: 'sol-1', phaseId: 'p-triagem' }, expect.anything());
  });

  it('com tudo salvo, o card avança normalmente', async () => {
    mocks.saved = [value('nota', { valueText: 'NF 1' }), value('conferido', { valueBoolean: true })];
    renderModal();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Expedição' })).not.toBeDisabled());
    expect(screen.queryByText(/Para avançar, preencha/)).not.toBeInTheDocument();
  });

  it('sem a trava na fase, nada muda', async () => {
    mocks.requireFieldsToExit = false;
    mocks.saved = [];
    renderModal();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Expedição' })).not.toBeDisabled());
    expect(screen.queryByText(/Para avançar, preencha/)).not.toBeInTheDocument();
  });

  it('fase que exige responsável: card sem ninguém atribuído não avança, e o aviso junta tudo', async () => {
    mocks.requireAssigneeToExit = true;
    mocks.saved = [value('nota', { valueText: 'NF 1' })];
    renderModal();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Para avançar, atribua um responsável ao card e preencha e salve o campo obrigatório: “Conferido”.',
      ),
    );
    expect(screen.getByRole('option', { name: 'Expedição' })).toBeDisabled();
  });

  it('com responsável atribuído e campos salvos, avança', async () => {
    mocks.requireAssigneeToExit = true;
    mocks.responsibleUserId = 'user-op';
    mocks.saved = [value('nota', { valueText: 'NF 1' }), value('conferido', { valueBoolean: true })];
    renderModal();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Expedição' })).not.toBeDisabled());
    expect(screen.queryByText(/Para avançar/)).not.toBeInTheDocument();
  });
});
