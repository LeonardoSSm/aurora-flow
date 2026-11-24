import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { KanbanPhaseCardVisibility } from '../types';
import { PhaseCardFilterModal } from './phase-card-filter-modal';

const mocks = vi.hoisted(() => ({
  cardVisibility: null as KanbanPhaseCardVisibility | null,
  save: vi.fn(),
}));

vi.mock('../services/kanban-phases-api', () => ({
  fetchKanbanPhases: () =>
    Promise.resolve([
      {
        id: 'phase-triagem',
        formId: 'form-1',
        label: 'Triagem',
        color: 'blue',
        fields: [{ id: 'pf', code: 'urgente', label: 'Urgente?', fieldType: 'checkbox', optionsJson: null }],
        cardVisibility: mocks.cardVisibility,
      },
    ]),
  saveKanbanPhaseCardVisibility: (_formId: string, _phaseId: string, payload: KanbanPhaseCardVisibility) => {
    mocks.save(payload);
    return Promise.resolve({});
  },
}));
vi.mock('../../forms/services/forms-api', () => ({
  fetchFormById: () =>
    Promise.resolve({
      id: 'form-1',
      versions: [
        {
          sections: [
            {
              fields: [
                {
                  code: 'filial',
                  label: 'Filial',
                  fieldType: 'single_select',
                  options: [
                    { internalValue: 'sp', displayLabel: 'São Paulo' },
                    { internalValue: 'rj', displayLabel: 'Rio de Janeiro' },
                  ],
                },
                { code: 'obs', label: 'Observação', fieldType: 'long_text', options: [] },
                { code: 'cidade', label: 'Cidade', fieldType: 'short_text', options: [] },
              ],
            },
          ],
        },
      ],
    }),
}));
vi.mock('../../admin/hooks/use-roles', () => ({
  useRoleOptionsQuery: () => ({ data: [{ code: 'comercial', name: 'Comercial' }] }),
}));
vi.mock('../../users/services/users-api', () => ({
  fetchAssignableUsers: () =>
    Promise.resolve([{ id: 'u-maria', fullName: 'Maria Souza', email: 'maria@x.com', role: 'comercial' }]),
}));

function renderModal() {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PhaseCardFilterModal formId="form-1" phaseId="phase-triagem" onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

const box = (title: string, scope: HTMLElement = document.body) =>
  within(scope).getByText(title, { selector: 'span' }).closest('div.grid') as HTMLElement;

describe('PhaseCardFilterModal', () => {
  beforeEach(() => {
    mocks.save.mockClear();
    mocks.cardVisibility = null;
  });

  it('sem regras explica que todos veem; só oferece campos de lista, caixa e texto curto', async () => {
    renderModal();
    expect(await screen.findByText(/Sem regras: todos que veem a fase/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar regra/ }));
    const select = screen.getByLabelText('Campo da regra 1') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      'Escolha um campo…',
      'Filial',
      'Cidade',
      'Urgente? (fase Triagem)',
    ]);
  });

  it('monta a regra (campo, respostas, perfil e usuário) e grava o filtro', async () => {
    const { onClose } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar regra/ }));

    // Regra incompleta não grava: diz o que falta.
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o campo.');
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Campo da regra 1'), { target: { value: 'filial' } });
    const respostas = box('Respostas');
    fireEvent.click(within(respostas).getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(within(respostas).getByRole('option', { name: /São Paulo/ }));

    const perfis = box('Perfis');
    fireEvent.click(within(perfis).getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(within(perfis).getByRole('option', { name: /Comercial/ }));
    const usuarios = box('Usuários');
    fireEvent.click(within(usuarios).getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(await within(usuarios).findByRole('option', { name: /Maria Souza/ }));

    expect(screen.getByText('Cards com “Filial” = “São Paulo”.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Não vê nenhum card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        rules: [{ fieldCode: 'filial', values: ['sp'], roleCodes: ['comercial'], userIds: ['u-maria'] }],
        othersSeeAll: false,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('campo de texto curto: respostas digitadas viram chips', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar regra/ }));
    fireEvent.change(screen.getByLabelText('Campo da regra 1'), { target: { value: 'cidade' } });
    const input = screen.getByLabelText('Nova resposta');
    fireEvent.change(input, { target: { value: 'Campinas' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'campinas' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getAllByText('Campinas')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Campinas' }));
    expect(screen.queryByText('Campinas')).not.toBeInTheDocument();
  });

  it('abre com o filtro salvo e remover a última regra desliga o filtro', async () => {
    mocks.cardVisibility = {
      rules: [{ fieldCode: 'urgente', values: ['true'], roleCodes: ['comercial'], userIds: [] }],
      othersSeeAll: true,
    };
    renderModal();
    expect(await screen.findByText('Cards com “Urgente?” = “Marcado (Sim)”.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remover regra 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ rules: [], othersSeeAll: true }));
  });
});
