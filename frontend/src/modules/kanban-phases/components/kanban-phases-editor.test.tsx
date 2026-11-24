import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { KanbanPhase } from '../types';
import { KanbanPhasesEditor } from './kanban-phases-editor';

const mocks = vi.hoisted(() => ({
  phases: [] as unknown[],
  save: vi.fn(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({ hasPermission: () => false, can: () => false, processesFullAccess: false }),
}));
vi.mock('../hooks/use-kanban-phases-query', () => ({
  useKanbanPhasesQuery: () => ({ data: mocks.phases, isLoading: false }),
}));
vi.mock('../hooks/use-save-kanban-phases-mutation', () => ({
  useSaveKanbanPhasesMutation: () => ({ mutateAsync: mocks.save, isPending: false }),
}));
vi.mock('../../admin/hooks/use-roles', () => ({
  useRoleOptionsQuery: () => ({ data: [{ code: 'logistica', name: 'Logística' }] }),
}));

function phase(overrides: Partial<KanbanPhase> & { id: string }): KanbanPhase {
  return {
    formId: 'form-1',
    key: overrides.id,
    label: overrides.id,
    color: 'blue',
    description: null,
    order: 0,
    isTerminal: false,
    actorRoleCode: null,
    requiresApproval: false,
    approverRoleCode: null,
    fields: [],
    ...overrides,
  };
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <KanbanPhasesEditor formId="form-1" />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.save.mockReset().mockImplementation(async (payload: unknown) =>
    (payload as Array<Record<string, unknown>>).map((p, index) => ({
      ...phase({ id: (p.id as string) ?? `novo-${index}` }),
      ...p,
      id: (p.id as string) ?? `novo-${index}`,
      fields: [],
    })),
  );
  mocks.phases = [
    phase({ id: 'solicitado', label: 'Solicitado', order: 0 }),
    phase({
      id: 'logistica',
      label: 'Logística',
      order: 1,
      actorRoleCode: 'logistica',
      fields: [
        {
          id: 'f1',
          code: 'retirado_de_rota',
          label: 'Retirado de rota',
          fieldType: 'checkbox',
          required: true,
          order: 0,
          settingsJson: null,
          optionsJson: null,
        },
      ],
    }),
  ];
});

describe('KanbanPhasesEditor', () => {
  it('o card resume a fase: quem atua e os campos com obrigatório', () => {
    renderEditor();
    expect(screen.getByText('Atua: Logística')).toBeInTheDocument();
    expect(screen.getByText('1 campo · 1 obrigatório')).toBeInTheDocument();
    expect(screen.getByText('Retirado de rota')).toBeInTheDocument();
  });

  it('a engrenagem abre a configuração; aplicar marca "não salvo" e "Salvar fases" grava tudo', async () => {
    renderEditor();
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configurar fase Logística' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Configurar fase · 2 de 2')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Nome da fase'), {
      target: { value: 'Logística: retirar de rota' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Logística: retirar de rota')).toBeInTheDocument();
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar fases' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const payload = mocks.save.mock.calls[0][0] as Array<{ id: string; label: string }>;
    expect(payload.map((p) => [p.id, p.label])).toEqual([
      ['solicitado', 'Solicitado'],
      ['logistica', 'Logística: retirar de rota'],
    ]);
    await waitFor(() => expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument());
  });

  it('cancelar no modal não muda o rascunho', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar fase Logística' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nome da fase'), { target: { value: 'Outro nome' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByDisplayValue('Logística')).toBeInTheDocument();
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();
  });

  it('"Editar campos" abre a configuração já na aba de campos', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Editar campos' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Adicionar campo' })).toBeInTheDocument();
  });

  it('adicionar fase já abre a configuração completa da fase nova', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar fase/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Configurar fase · 3 de 3')).toBeInTheDocument();
    expect(within(dialog).getByText('Nova fase')).toBeInTheDocument();
  });
});
