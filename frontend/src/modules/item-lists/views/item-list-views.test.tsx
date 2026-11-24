import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import { ItemListPage } from '../../../pages/item-list-page';
import { ItemListSource } from '../item-list-source';
import type { ItemListDetail, ItemListSummary } from '../item-lists-api';
import type * as ItemListsApi from '../item-lists-api';
import { ItemListsListView } from './item-lists-list-view';

const mocks = vi.hoisted(() => ({
  list: [] as ItemListSummary[],
  detail: null as ItemListDetail | null,
  save: vi.fn(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock('../item-lists-api', async (importActual) => ({
  ...(await importActual<typeof ItemListsApi>()),
  // O hook real chama a função interna do módulo, que o mock não alcança.
  useItemListsQuery: (archived = false) =>
    useQuery({ queryKey: ['item-lists', 'list', archived], queryFn: async () => mocks.list }),
  fetchItemList: async () => mocks.detail,
  saveItemList: mocks.save,
}));

const summary = (overrides: Partial<ItemListSummary>): ItemListSummary => ({
  id: 'l-1',
  name: 'Fornecedores',
  description: null,
  isActive: true,
  itemCount: 3,
  usage: { forms: 0, phaseFields: 0 },
  updatedAt: '2026-10-10T12:00:00Z',
  ...overrides,
});

const fornecedores: ItemListDetail = {
  id: 'l-1',
  name: 'Fornecedores',
  description: null,
  isActive: true,
  usage: { forms: 2, phaseFields: 1 },
  items: [
    { id: 'i-1', code: 'F1', name: 'Alfa', isActive: true, order: 0 },
    { id: 'i-2', code: null, name: 'Beta', isActive: false, order: 1 },
  ],
};

function providers(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/listas-de-itens', element: <ItemListsListView /> },
      { path: '/listas-de-itens/nova', element: <ItemListPage isNew /> },
      { path: '/listas-de-itens/:listId', element: <ItemListPage /> },
    ],
    { initialEntries: [path] },
  );
  render(providers(<RouterProvider router={router} />));
  return router;
}

// jsdom e o fetch do Node têm AbortSignal diferentes: o Request de verdade rejeita o do jsdom ao
// navegar com o roteador de dados. Sem loaders, basta um Request mínimo.
class TestRequest {
  url: string;
  method: string;
  signal?: AbortSignal;
  constructor(url: string | URL, init?: { method?: string; signal?: AbortSignal }) {
    this.url = String(url);
    this.method = init?.method ?? 'GET';
    this.signal = init?.signal;
  }
}

beforeEach(() => {
  vi.stubGlobal('Request', TestRequest);
  mocks.list = [];
  mocks.detail = fornecedores;
  mocks.save.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Listas de itens — lista', () => {
  it('mostra as listas em cards, com onde são usadas, e busca sem diferenciar acento', async () => {
    mocks.list = [
      summary({ id: 'l-1', name: 'Fornecedores', usage: { forms: 2, phaseFields: 1 } }),
      summary({ id: 'l-2', name: 'Matéria-prima', itemCount: 12 }),
    ];
    renderAt('/listas-de-itens');

    expect(await screen.findByRole('heading', { name: 'Matéria-prima' })).toBeInTheDocument();
    const card = screen.getByRole('link', { name: /Fornecedores/ });
    expect(card).toHaveAttribute('href', '/listas-de-itens/l-1');
    expect(card).toHaveTextContent('Usada em 2 formulários e 1 campo de fase');
    expect(screen.getByRole('link', { name: /Matéria-prima/ })).toHaveTextContent(
      'Não usada ainda',
    );

    fireEvent.change(screen.getByLabelText('Buscar lista de itens'), {
      target: { value: 'materia' },
    });
    expect(screen.queryByRole('heading', { name: 'Fornecedores' })).not.toBeInTheDocument();
    expect(screen.getByText('1 lista')).toBeInTheDocument();
  });

  it('sem listas, convida a criar a primeira', async () => {
    renderAt('/listas-de-itens');
    expect(await screen.findByText('Nenhuma lista de itens ainda')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Nova lista/ })[0]).toHaveAttribute(
      'href',
      '/listas-de-itens/nova',
    );
  });
});

describe('Listas de itens — página da lista', () => {
  it('cria a lista com itens colados e vai para a página dela', async () => {
    mocks.save.mockResolvedValue({ ...fornecedores, id: 'l-nova', name: 'Motivos' });
    const router = renderAt('/listas-de-itens/nova');

    expect(screen.getByRole('heading', { name: 'Nova lista de itens' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Motivos' } });
    fireEvent.click(screen.getByRole('button', { name: /Colar da planilha/ }));
    fireEvent.change(screen.getByLabelText('Itens colados da planilha'), {
      target: { value: 'Cliente desistiu\nM2\tErro de digitação' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar itens' }));
    expect(screen.getByRole('heading', { name: 'Itens (2)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar lista' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/listas-de-itens/l-nova'));
    const [id, payload] = mocks.save.mock.calls[0];
    expect(id).toBeNull();
    expect(payload).toEqual({
      name: 'Motivos',
      description: null,
      columns: [],
      items: [
        { code: null, name: 'Cliente desistiu', isActive: true, values: {} },
        { code: 'M2', name: 'Erro de digitação', isActive: true, values: {} },
      ],
    });
  });

  it('adiciona uma coluna de seleção com opção colorida, preenche no item e salva', async () => {
    mocks.save.mockResolvedValue(fornecedores);
    renderAt('/listas-de-itens/l-1');
    await screen.findByRole('button', { name: 'Salvar alterações' });

    fireEvent.click(screen.getByRole('button', { name: /Coluna/ }));
    fireEvent.change(screen.getByLabelText('Nome da coluna'), { target: { value: 'Status' } });
    fireEvent.change(screen.getByLabelText('Tipo da coluna'), { target: { value: 'select' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar opção/ }));
    fireEvent.change(screen.getByLabelText('Nome da opção 1'), { target: { value: 'Aprovado' } });
    fireEvent.change(screen.getByLabelText('Cor da opção Aprovado'), {
      target: { value: 'green' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));

    expect(screen.getByRole('button', { name: 'Editar coluna Status' })).toBeInTheDocument();
    const cell = screen.getByLabelText('Status do item 1');
    fireEvent.change(cell, { target: { value: (cell as HTMLSelectElement).options[1].value } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const [, payload] = mocks.save.mock.calls[0];
    const [column] = payload.columns;
    expect(column).toEqual({
      id: expect.any(String),
      name: 'Status',
      type: 'select',
      options: [{ id: expect.any(String), label: 'Aprovado', color: 'green' }],
    });
    expect(payload.items[0].values).toEqual({ [column.id]: column.options[0].id });
    expect(payload.items[1].values).toEqual({});
  });

  it('mostra onde é usada, marca alterações não salvas e pergunta antes de sair', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = renderAt('/listas-de-itens/l-1');

    const save = await screen.findByRole('button', { name: 'Salvar alterações' });
    expect(screen.getByText(/usada em 2 formulários e 1 campo de fase/)).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nome do item 1'), { target: { value: 'Alfa Ltda' } });
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    expect(save).toBeEnabled();

    fireEvent.click(screen.getByRole('link', { name: /Listas de itens/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/listas-de-itens/l-1');
  });
});

describe('Origem das opções no campo de seleção', () => {
  it('escolher uma lista liga o campo; voltar a digitar desliga', async () => {
    mocks.list = [summary({ id: 'l-1', name: 'Fornecedores', itemCount: 1 })];
    const onLink = vi.fn();
    const onUnlink = vi.fn();
    const { rerender } = render(
      providers(
        <ItemListSource
          listId={null}
          visibleLabels={[]}
          hiddenCount={0}
          onLink={onLink}
          onUnlink={onUnlink}
        >
          <p>editor das opções digitadas</p>
        </ItemListSource>,
      ),
    );
    expect(screen.getByText('editor das opções digitadas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Usar lista salva' }));
    const select = screen.getByLabelText('Lista de itens');
    await screen.findByRole('option', { name: 'Fornecedores (1 item)' });
    fireEvent.change(select, { target: { value: 'l-1' } });
    await waitFor(() => expect(onLink).toHaveBeenCalledWith(fornecedores));

    rerender(
      providers(
        <ItemListSource
          listId="l-1"
          visibleLabels={['Alfa']}
          hiddenCount={1}
          onLink={onLink}
          onUnlink={onUnlink}
        >
          <p>editor das opções digitadas</p>
        </ItemListSource>,
      ),
    );
    expect(screen.queryByText('editor das opções digitadas')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Opções vindas da lista' })).toHaveTextContent('Alfa');
    expect(screen.getByText(/1 item\(ns\) fora da lista ficam guardados/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Digitar opções' }));
    expect(onUnlink).toHaveBeenCalled();
  });
});
