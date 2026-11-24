import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type * as SolicitationsApi from '../../solicitations/services/solicitations-api';
import type { KanbanCard } from '../../solicitations/types';
import type { KanbanPhase } from '../types';
import { PhaseFieldsModal } from './phase-fields-modal';

const mocks = vi.hoisted(() => ({
  role: 'supervisor',
  hasManageAll: false,
  phases: [] as unknown[],
  values: [] as unknown[],
  save: vi.fn(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: mocks.role },
    hasPermission: (code: string) => mocks.hasManageAll && code === 'solicitations.manage',
    // "Gerenciar tudo" agora é o acesso total aos processos.
    processesFullAccess: mocks.hasManageAll,
    can: () => true,
  }),
}));
vi.mock('../hooks/use-kanban-phases-query', () => ({
  useKanbanPhasesQuery: () => ({ data: mocks.phases }),
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
  useMoveKanbanPhaseMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../solicitations/services/solicitations-api', async (importOriginal) => ({
  ...(await importOriginal<typeof SolicitationsApi>()),
  fetchPhaseFieldValues: () => Promise.resolve(mocks.values),
  savePhaseFieldValues: (...args: unknown[]) => mocks.save(...args),
}));

vi.mock('../../item-lists/item-lists-api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchItemList: () =>
    Promise.resolve({
      id: 'list-1',
      name: 'Embalagens',
      description: null,
      isActive: true,
      columns: [],
      items: [
        { id: 'item-caixa', code: 'CX', name: 'Caixa', isActive: true, order: 0, values: {} },
        { id: 'item-fita', code: 'FT', name: 'Fita', isActive: true, order: 1, values: {} },
      ],
      usage: { forms: 0, phaseFields: 0 },
    }),
}));

const quantityPhase: KanbanPhase = {
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

const sentQuantity = {
  id: 'val-1',
  solicitationId: 'sol-1',
  phaseFieldId: 'fld-qtd',
  fieldCode: 'quantidade',
  valueText: null,
  valueNumber: 120,
  valueBoolean: null,
  valueJson: null,
};

const card = {
  id: 'sol-1',
  formId: 'form-1',
  phaseId: 'phase-qtd',
  title: 'Solicitacao - Datar Embalagens de Frango',
} as unknown as KanbanCard;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PhaseFieldsModal card={card} onClose={() => {}} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PhaseFieldsModal — valores enviados na fase atual', () => {
  beforeEach(() => {
    mocks.phases = [quantityPhase];
    mocks.values = [sentQuantity];
    mocks.hasManageAll = false;
  });

  it('o aprovador (que não preenche a fase) vê a quantidade enviada em destaque, sem o campo esmaecido', async () => {
    mocks.role = 'supervisor';

    renderModal();

    const summary = await screen.findByRole('region', { name: 'Dados enviados nesta fase' });
    expect(summary).toHaveTextContent('Quantidade produzida');
    expect(summary).toHaveTextContent('120');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText(/Apenas o perfil "operador" pode preencher/)).toBeInTheDocument();
  });

  it('o operador (que preenche a fase) continua vendo o campo editável com o valor, sem o resumo', async () => {
    mocks.role = 'operador';

    renderModal();

    const input = await screen.findByRole('spinbutton');
    await waitFor(() => expect(input).toHaveValue(120));
    expect(screen.queryByRole('region', { name: 'Dados enviados nesta fase' })).not.toBeInTheDocument();
  });

  it('quem tem permissão de gerenciar tudo também edita o campo, sem o resumo', async () => {
    mocks.role = 'supervisor';
    mocks.hasManageAll = true;

    renderModal();

    expect(await screen.findByRole('spinbutton')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dados enviados nesta fase' })).not.toBeInTheDocument();
  });

  it('enquanto o operador ainda não enviou nada, o aprovador mantém o formulário (sem resumo vazio)', async () => {
    mocks.role = 'supervisor';
    mocks.values = [];

    renderModal();

    expect(await screen.findByRole('spinbutton')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dados enviados nesta fase' })).not.toBeInTheDocument();
  });
});

describe('PhaseFieldsModal — legibilidade em telas pequenas e no tema escuro', () => {
  beforeEach(() => {
    mocks.phases = [quantityPhase];
    mocks.values = [sentQuantity];
    mocks.hasManageAll = false;
    mocks.role = 'operador';
  });

  // Motivo: brandCssVars fixa as cores do formulário público (tema claro). Dentro do modal, que
  // segue o tema do app, o rótulo (--tf-text escuro) ficava escuro sobre escuro no tema escuro.
  it('mapeia os neutros do campo para os tokens do tema, para o rótulo não sumir no tema escuro', async () => {
    renderModal();

    const input = await screen.findByRole('spinbutton');
    const fields = input.closest('div.grid-cols-1.gap-5') as HTMLElement | null;

    expect(fields).not.toBeNull();
    // jsdom não expõe custom properties via .style; confere o atributo serializado.
    expect(fields?.getAttribute('style')).toMatch(/--tf-text:\s*var\(--text-primary\)/);
    expect(fields?.getAttribute('style')).toMatch(/--tf-text-muted:\s*var\(--text-secondary\)/);
  });

  it('quebra linha em títulos longos de solicitação em vez de cortá-los com reticências', async () => {
    renderModal();

    const heading = await screen.findByRole('heading', { name: card.title });

    expect(heading.className).toContain('break-words');
    expect(heading.className).not.toContain('truncate');
  });
});

describe('PhaseFieldsModal — validação antes de salvar', () => {
  beforeEach(() => {
    mocks.phases = [quantityPhase];
    mocks.values = [];
    mocks.hasManageAll = false;
    mocks.role = 'operador';
    mocks.save.mockReset().mockResolvedValue([]);
  });

  it('não salva com obrigatório vazio e mostra o erro no campo; preencher limpa o erro e salva', async () => {
    renderModal();
    const input = await screen.findByRole('spinbutton');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar campos' }));
    expect(await screen.findByText('Este campo é obrigatório.')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '80' } });
    expect(screen.queryByText('Este campo é obrigatório.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar campos' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1]).toEqual([
      expect.objectContaining({ phaseFieldId: 'fld-qtd', fieldCode: 'quantidade', valueNumber: 80 }),
    ]);
  });

  it('título/descrição da fase não vão no envio', async () => {
    mocks.phases = [
      {
        ...quantityPhase,
        fields: [
          { id: 'fld-tit', code: 'titulo', label: 'Instruções', fieldType: 'title', required: false, order: 0, settingsJson: null, optionsJson: null },
          { ...quantityPhase.fields[0], order: 1 },
        ],
      },
    ];
    mocks.values = [sentQuantity];
    renderModal();
    const input = await screen.findByRole('spinbutton');
    await waitFor(() => expect(input).toHaveValue(120));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar campos' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1].map((item: { fieldCode: string }) => item.fieldCode)).toEqual(['quantidade']);
  });
});

describe('PhaseFieldsModal — quem atua (perfis e usuários)', () => {
  beforeEach(() => {
    mocks.values = [];
    mocks.hasManageAll = false;
    mocks.role = 'supervisor';
  });

  it('usuário escolhido preenche mesmo sem ter o perfil', async () => {
    mocks.phases = [{ ...quantityPhase, actors: { roleCodes: ['operador'], userIds: ['user-1'] } }];
    renderModal();
    expect(await screen.findByRole('spinbutton')).toBeInTheDocument();
    expect(screen.queryByText(/pode(m)? preencher/)).not.toBeInTheDocument();
  });

  it('fora da lista vê o aviso (vários escolhidos: mensagem genérica)', async () => {
    mocks.phases = [{ ...quantityPhase, actors: { roleCodes: ['operador', 'logistica'], userIds: [] } }];
    renderModal();
    expect(
      await screen.findByText('Apenas os perfis e usuários escolhidos para esta fase podem preencher os campos.'),
    ).toBeInTheDocument();
  });
});

describe('PhaseFieldsModal — "Pedido de itens" na fase', () => {
  const orderPhase: KanbanPhase = {
    ...quantityPhase,
    fields: [
      {
        id: 'fld-pedido',
        code: 'pedido',
        label: 'Embalagens',
        fieldType: 'item_order',
        required: true,
        order: 0,
        settingsJson: {
          itemListId: 'list-1',
          itemColumns: [],
          inputColumns: [{ id: 'quantidade', label: 'Quantidade', type: 'number', required: true, min: 1, decimals: 0 }],
        },
        optionsJson: null,
      },
    ],
  };

  beforeEach(() => {
    mocks.phases = [orderPhase];
    mocks.hasManageAll = false;
    mocks.role = 'operador';
    mocks.save.mockReset().mockResolvedValue([]);
    // O que o servidor gravou: o retrato, com colunas e valores da lista.
    mocks.values = [
      {
        id: 'val-pedido',
        solicitationId: 'sol-1',
        phaseFieldId: 'fld-pedido',
        fieldCode: 'pedido',
        valueText: 'Caixa — Quantidade: 3',
        valueNumber: null,
        valueBoolean: null,
        valueJson: {
          schemaVersion: 1,
          source: { kind: 'item_list', itemListId: 'list-1', listName: 'Embalagens' },
          columns: { source: [{ key: 'name', label: 'Item', type: 'text' }], input: [] },
          rows: [{ key: 'item-caixa', sourceValues: { name: 'Caixa' }, answers: { quantidade: 3 } }],
          total: null,
        },
      },
    ];
  });

  it('abre com o pedido salvo, aceita mais um item e manda só chave e respostas', async () => {
    renderModal();
    const table = await screen.findByRole('table');
    expect(table).toHaveTextContent('Caixa');

    fireEvent.change(screen.getByRole('combobox', { name: /Pesquisar item/ }), { target: { value: 'fita' } });
    fireEvent.click(screen.getByRole('option', { name: /Fita/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar campos' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1]).toEqual([
      {
        phaseFieldId: 'fld-pedido',
        fieldCode: 'pedido',
        valueJson: {
          rows: [
            { key: 'item-caixa', answers: { quantidade: 3 } },
            { key: 'item-fita', answers: { quantidade: 1 } },
          ],
        },
      },
    ]);
  });

  it('obrigatório sem nenhum item não salva', async () => {
    mocks.values = [];
    renderModal();
    await screen.findByRole('combobox', { name: /Pesquisar item/ });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar campos' }));
    expect(await screen.findByText('Adicione pelo menos um item.')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('opcional sem itens manda o pedido vazio (o servidor limpa o valor)', async () => {
    mocks.values = [];
    mocks.phases = [{ ...orderPhase, fields: orderPhase.fields.map((field) => ({ ...field, required: false })) }];
    renderModal();
    await screen.findByRole('combobox', { name: /Pesquisar item/ });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar campos' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1]).toEqual([
      { phaseFieldId: 'fld-pedido', fieldCode: 'pedido', valueJson: { rows: [] } },
    ]);
  });
});
