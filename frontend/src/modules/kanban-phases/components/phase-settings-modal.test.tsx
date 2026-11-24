import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { DraftKanbanPhase } from '../types';
import { PhaseSettingsModal, type PhaseSettingsTab } from './phase-settings-modal';

const mocks = vi.hoisted(() => ({
  flows: [] as unknown[],
  permissions: new Set<string>(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({
    hasPermission: (code: string) => mocks.permissions.has(code),
    can: (code: string) => mocks.permissions.has(code),
  }),
}));
vi.mock('../../users/services/users-api', () => ({
  fetchAssignableUsers: () =>
    Promise.resolve([{ id: 'u-ana', fullName: 'Ana Gerente', email: 'ana@x.com', role: 'manager' }]),
}));
vi.mock('../../flows/services/flows-api', () => ({
  fetchFlows: () => Promise.resolve(mocks.flows),
}));

const ROLES = [
  { code: 'logistica', name: 'Logística' },
  { code: 'financeiro', name: 'Financeiro' },
];

function logistica(overrides: Partial<DraftKanbanPhase> = {}): DraftKanbanPhase {
  return {
    id: 'logistica',
    serverId: 'logistica',
    key: 'logistica',
    label: 'Logística',
    color: 'amber',
    description: '',
    isTerminal: false,
    actors: { roleCodes: ['logistica'], userIds: [] },
    requiresApproval: false,
    approvers: { roleCodes: [], userIds: [] },
    approvalMode: 'any',
    approvalRequest: 'manual',
    approvalOnApproved: 'stay',
    approvalOnRejected: 'stay',
    restrictVisibility: false,
    visibleTo: { roleCodes: [], areaIds: [], userIds: [] },
    slaHours: null,
    slaBusinessHours: false,
    slaWarningPercent: null,
    fields: [
      {
        id: 'f1',
        serverId: 'f1',
        code: 'retirado_de_rota',
        label: 'Retirado de rota',
        fieldType: 'checkbox',
        required: true,
        settingsJson: {},
        options: [],
      },
    ],
    sectionFlow: {},
    ...overrides,
  };
}

function renderModal(
  phase = logistica(),
  options: { onApply?: (next: DraftKanbanPhase) => void; initialTab?: PhaseSettingsTab } = {},
) {
  const onApply = vi.fn(options.onApply);
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <PhaseSettingsModal
            formId="form-1"
            phase={phase}
            position={2}
            total={4}
            roleOptions={ROLES}
            initialTab={options.initialTab}
            onApply={onApply}
            onClose={onClose}
          />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onApply, onClose };
}

beforeEach(() => {
  mocks.permissions = new Set(['flows.view']);
  mocks.flows = [];
});

describe('PhaseSettingsModal', () => {
  it('resume a fase no topo: campos, quem atua e automações', async () => {
    mocks.flows = [
      {
        id: 'flow-1',
        name: 'Cancelamento: logística concluiu',
        isActive: true,
        nodes: [{ id: 't', type: 'trigger_phase_field_saved', data: { phaseId: 'logistica' } }],
        edges: [],
      },
    ];
    renderModal();

    expect(screen.getByText('Configurar fase · 2 de 4')).toBeInTheDocument();
    expect(screen.getByText('1 campo · 1 obrigatório')).toBeInTheDocument();
    expect(screen.getByText('Atua: Logística')).toBeInTheDocument();
    expect(await screen.findByText('1 automação')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Integrações e automações' }));
    expect(screen.getByText('Cancelamento: logística concluiu')).toBeInTheDocument();
    expect(screen.getByText('Dispara quando os campos desta fase são salvos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir/ })).toHaveAttribute('href', '/flows/flow-1');
  });

  it('aplica a fase editada ao rascunho (sem gravar) e fecha', () => {
    const { onApply, onClose } = renderModal();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome da fase'), { target: { value: 'Logística: retirar de rota' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'logistica',
        label: 'Logística: retirar de rota',
        actors: { roleCodes: ['logistica'], userIds: [] },
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('abre direto na aba pedida e permite adicionar campo', () => {
    const { onApply } = renderModal(logistica(), { initialTab: 'campos' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    // O campo novo já abre, com o seletor de tipo e o nome em foco.
    fireEvent.click(screen.getByRole('option', { name: /Texto longo/ }));
    fireEvent.change(screen.getByLabelText('Nome do campo'), { target: { value: 'Observação da logística' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const fields = onApply.mock.calls[0][0].fields;
    expect(fields).toHaveLength(2);
    expect(fields[1]).toMatchObject({ label: 'Observação da logística', code: 'observacao_da_logistica', fieldType: 'long_text' });
  });

  it('quem atua e quem aprova aceitam vários perfis e usuários (com busca)', async () => {
    const { onApply } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Acesso e aprovação' }));

    const atua = screen.getByRole('group', { name: 'Quem atua nesta fase' });
    const perfisAtua = within(atua).getByText('Perfis').closest('div.grid') as HTMLElement;
    fireEvent.click(within(perfisAtua).getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(within(perfisAtua).getByRole('option', { name: /Financeiro/ }));
    const usuariosAtua = within(atua).getByText('Usuários').closest('div.grid') as HTMLElement;
    fireEvent.click(within(usuariosAtua).getByRole('button', { name: /Adicionar/ }));
    fireEvent.change(within(usuariosAtua).getByLabelText('Buscar por nome ou e-mail'), { target: { value: 'ana' } });
    fireEvent.click(await within(usuariosAtua).findByRole('option', { name: /Ana Gerente/ }));

    // Quem aprova: janela com abas Perfis/Usuários, marca vários; regra "Todos".
    fireEvent.click(screen.getByRole('checkbox', { name: /Exige aprovação para avançar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Escolher aprovadores' }));
    const janela = screen.getByRole('dialog', { name: 'Escolher aprovadores' });
    fireEvent.click(within(janela).getByRole('option', { name: /Financeiro/ }));
    fireEvent.click(within(janela).getByRole('tab', { name: /Usuários/ }));
    fireEvent.click(await within(janela).findByRole('option', { name: /Ana Gerente/ }));
    fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Regra da aprovação' })).getByRole('radio', { name: /^Todos/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: { roleCodes: ['logistica', 'financeiro'], userIds: ['u-ana'] },
        requiresApproval: true,
        approvers: expect.objectContaining({ roleCodes: ['financeiro'], userIds: ['u-ana'] }),
        approvalMode: 'all',
      }),
    );
    expect(screen.queryByText('Atua: Logística, Financeiro +1 usuário')).not.toBeNull();
  });

  it('com aprovação, escolhe quando pedir e o que fazer depois da decisão', () => {
    const { onApply } = renderModal(
      logistica({ requiresApproval: true, approvers: { roleCodes: ['financeiro'], userIds: [] } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Acesso e aprovação' }));
    // Fase 2 de 4: "formulário completo" é o da fase; há anterior e próxima.
    expect(screen.getByRole('option', { name: 'Quando salvarem o formulário da fase' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Volta sozinho para a fase anterior' })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quando pedir a aprovação'), { target: { value: 'on_complete' } });
    fireEvent.change(screen.getByLabelText('Se aprovarem'), { target: { value: 'next' } });
    fireEvent.change(screen.getByLabelText('Se reprovarem'), { target: { value: 'close' } });

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ approvalRequest: 'on_complete', approvalOnApproved: 'next', approvalOnRejected: 'close' }),
    );
  });

  it('não aplica exigindo aprovação sem perfil aprovador', async () => {
    const { onApply } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Acesso e aprovação' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Exige aprovação para avançar/ }));
    expect(screen.getByText('Escolha pelo menos um perfil ou usuário para aprovar.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText(/ninguém foi escolhido para aprovar/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('mantém todas as abas montadas (o tamanho não muda ao trocar); só a ativa fica acessível', () => {
    renderModal();
    const visible = () => screen.getAllByRole('tabpanel').map((panel) => panel.getAttribute('aria-label'));
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(4);
    expect(visible()).toEqual(['Geral']);

    fireEvent.click(screen.getByRole('button', { name: 'Formulário' }));
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(4);
    expect(visible()).toEqual(['Formulário']);
  });

  it('com alteração pendente, Esc não fecha', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.change(screen.getByLabelText('Nome da fase'), { target: { value: 'X' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fase nova (ainda não salva) não consulta fluxos e explica por quê', () => {
    renderModal(logistica({ id: 'phase_tmp', serverId: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Integrações e automações' }));
    expect(screen.getByText('Fase nova: salve as fases para poder usá-la num fluxo.')).toBeInTheDocument();
  });

  it('sem acesso aos fluxos, a aba explica em vez de consultar', () => {
    mocks.permissions = new Set();
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Integrações e automações' }));
    expect(screen.getByText('Seu perfil não tem acesso aos fluxos.')).toBeInTheDocument();
  });
});
