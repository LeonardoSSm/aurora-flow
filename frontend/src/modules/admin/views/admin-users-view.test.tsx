import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import { AdminBackgroundContext } from '../admin-route';
import type { AdminUser } from '../services/admin-api';
import { AdminModal } from './admin-layout-view';
import { AdminUsersView } from './admin-users-view';

const mocks = vi.hoisted(() => ({
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  sendUserInvite: vi.fn(),
  deactivateUser: vi.fn(),
  fetchSettings: vi.fn(),
  fetchRoles: vi.fn(),
  fetchAreas: vi.fn(),
  closeAdmin: vi.fn(),
}));

vi.mock('../services/admin-api', () => ({
  fetchUsers: mocks.fetchUsers,
  createUser: mocks.createUser,
  updateUser: mocks.updateUser,
  sendUserInvite: mocks.sendUserInvite,
  deactivateUser: mocks.deactivateUser,
  fetchSettings: mocks.fetchSettings,
  updateSetting: vi.fn(),
  bulkUpdateSettings: vi.fn(),
}));
vi.mock('../services/roles-api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRoles: mocks.fetchRoles,
}));
vi.mock('../services/areas-api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAreas: mocks.fetchAreas,
}));
vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({ hasPermission: () => true, user: { fullName: 'Helena Admin' } }),
}));

const NOW = '2026-11-06T12:00:00.000Z';

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u1',
    fullName: 'Ana Souza',
    email: 'ana@tijucaalimentos.com',
    role: 'editor',
    isActive: true,
    hasPassword: true,
    lastLoginAt: NOW,
    areaId: 'a1',
    areaName: 'Qualidade',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const ROLES = [
  { code: 'admin', name: 'Admin', description: 'Acesso total', color: 'red' },
  { code: 'editor', name: 'Editor', description: 'Cria e edita formulários', color: 'blue' },
  { code: 'gestor', name: 'Gestor', description: 'Aprova solicitações', color: 'green' },
].map((r) => ({
  ...r,
  isSystem: true,
  permissions: {},
  userCount: 0,
  activeUserCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
}));

const AREAS = [
  {
    id: 'a1',
    name: 'Qualidade',
    code: 'QLD',
    description: null,
    parentId: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

function renderUsers() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AdminBackgroundContext.Provider value={{ background: null, close: mocks.closeAdmin }}>
          <MemoryRouter initialEntries={['/administracao/usuarios']}>
            <Routes>
              <Route path="/administracao" element={<AdminModal />}>
                <Route path="usuarios" element={<AdminUsersView />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AdminBackgroundContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function pressEscape() {
  fireEvent.keyDown(window, { key: 'Escape' });
}

async function openCreatePanel() {
  fireEvent.click(await screen.findByRole('button', { name: 'Convidar Usuário' }));
  return screen.findByRole('region', { name: 'Convidar usuário' });
}


beforeEach(() => {
  vi.clearAllMocks();
  // jsdom não implementa scroll em elementos (o AdminModal rola o corpo ao trocar de seção).
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  // Movimento reduzido: o painel sai sem esperar os 520 ms da animação.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  mocks.fetchUsers.mockResolvedValue({
    data: [
      user(),
      user({ id: 'u2', fullName: 'Bruno Lima', email: 'bruno@x.com', lastLoginAt: null }),
    ],
    total: 2,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  mocks.fetchRoles.mockResolvedValue(ROLES);
  mocks.fetchAreas.mockResolvedValue(AREAS);
  mocks.fetchSettings.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminUsersView — painel de convidar/editar', () => {
  it('abre o painel no lugar da lista e volta com "Voltar para usuários"', async () => {
    renderUsers();
    const opener = await screen.findByRole('button', { name: 'Convidar Usuário' });
    expect(opener).toHaveClass('whitespace-nowrap');
    fireEvent.click(opener);

    const panel = await screen.findByRole('region', { name: 'Convidar usuário' });
    // Não é modal: nada de segundo aria-modal além do da Administração.
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    // A lista (cabeçalho do modal incluso) sai da árvore acessível e fica inerte.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Usuários' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Ana Souza').closest('[inert]')).not.toBeNull();
    await waitFor(() =>
      expect(within(panel).getByPlaceholderText('Ex: João da Silva')).toHaveFocus(),
    );

    fireEvent.click(within(panel).getByRole('button', { name: /Voltar para usuários/ }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Convidar usuário' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Usuários' })).toBeInTheDocument();
    expect(screen.getByText('Ana Souza').closest('[inert]')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Convidar Usuário' })).toHaveFocus(),
    );
  });

  it('Esc fecha o dropdown de perfil, depois o painel e por fim a Administração', async () => {
    renderUsers();
    const panel = await openCreatePanel();
    await waitFor(() => expect(panel).not.toHaveAttribute('aria-hidden'));

    fireEvent.click(within(panel).getByRole('button', { name: /Perfil/ }));
    const listbox = await screen.findByRole('listbox', { name: 'Perfil' });
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
    expect(within(listbox).getByRole('option', { name: /Editor/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    pressEscape();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Convidar usuário' })).toBeInTheDocument();
    expect(mocks.closeAdmin).not.toHaveBeenCalled();

    pressEscape();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Convidar usuário' })).not.toBeInTheDocument(),
    );
    expect(mocks.closeAdmin).not.toHaveBeenCalled();

    pressEscape();
    expect(mocks.closeAdmin).toHaveBeenCalledTimes(1);
  });

  it('escolher uma opção do perfil troca o badge do gatilho', async () => {
    renderUsers();
    const panel = await openCreatePanel();
    fireEvent.click(within(panel).getByRole('button', { name: /Perfil/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Gestor/ }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Perfil/ })).toHaveTextContent('Gestor');
    expect(within(panel).getByRole('button', { name: /Perfil/ })).toHaveTextContent(
      'Aprova solicitações',
    );
  });

  it('valida nome, e-mail e senha antes de liberar o botão', async () => {
    renderUsers();
    const panel = await openCreatePanel();
    const submit = () => within(panel).getByRole('button', { name: 'Enviar convite' });
    expect(submit()).toBeDisabled();

    fireEvent.change(within(panel).getByPlaceholderText('Ex: João da Silva'), {
      target: { value: 'Carla Dias' },
    });
    const email = within(panel).getByPlaceholderText('joao@empresa.com');
    fireEvent.change(email, { target: { value: 'carla@' } });
    expect(within(panel).queryByText('Informe um e-mail válido.')).not.toBeInTheDocument();
    fireEvent.blur(email);
    expect(within(panel).getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeDisabled();

    fireEvent.change(email, { target: { value: 'carla@tijuca.com' } });
    expect(within(panel).queryByText('Informe um e-mail válido.')).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();

    fireEvent.click(within(panel).getByRole('radio', { name: /Definir uma senha agora/ }));
    const cadastrar = within(panel).getByRole('button', { name: 'Cadastrar usuário' });
    expect(cadastrar).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText('Senha'), { target: { value: 'Abc1234' } });
    expect(cadastrar).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText('Senha'), { target: { value: 'Abc12345' } });
    expect(cadastrar).toBeEnabled();
  });

  it('a coluna lateral troca a prévia do convite pelo aviso sem e-mail', async () => {
    renderUsers();
    const panel = await openCreatePanel();
    fireEvent.change(within(panel).getByPlaceholderText('Ex: João da Silva'), {
      target: { value: 'Carla Dias' },
    });
    fireEvent.change(within(panel).getByPlaceholderText('joao@empresa.com'), {
      target: { value: 'carla@tijuca.com' },
    });
    expect(within(panel).getByText('Prévia do convite')).toBeInTheDocument();
    expect(within(panel).getByText('Olá, Carla!')).toBeInTheDocument();
    expect(
      within(panel).getByText(/Helena Admin criou seu acesso ao Aurora Flow/),
    ).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('radio', { name: /Só pré-cadastrar/ }));
    expect(within(panel).queryByText('Prévia do convite')).not.toBeInTheDocument();
    expect(within(panel).getByText('Nenhum e-mail será enviado')).toBeInTheDocument();
    expect(
      within(panel).getByText('O convite pode ser enviado depois pela lista.'),
    ).toBeInTheDocument();
  });

  it.each([
    {
      method: 'invite' as const,
      radio: /Enviar convite por e-mail/,
      button: 'Enviar convite',
      extra: { sendInvite: true },
      invite: { sent: true },
      toast: 'Convite enviado para carla@tijuca.com',
    },
    {
      method: 'password' as const,
      radio: /Definir uma senha agora/,
      button: 'Cadastrar usuário',
      extra: { sendInvite: false, password: 'Abc12345' },
      invite: undefined,
      toast: 'Carla foi cadastrado(a)',
    },
    {
      method: 'pre' as const,
      radio: /Só pré-cadastrar/,
      button: 'Cadastrar usuário',
      extra: { sendInvite: false },
      invite: undefined,
      toast: 'Carla foi cadastrado(a)',
    },
  ])(
    'create/$method envia o payload certo, volta para a lista e destaca a linha',
    async ({ method, radio, button, extra, invite, toast }) => {
      const created = user({
        id: 'u3',
        fullName: 'Carla Dias',
        email: 'carla@tijuca.com',
        lastLoginAt: null,
      });
      mocks.createUser.mockResolvedValue({ ...created, invite });
      renderUsers();
      const panel = await openCreatePanel();

      fireEvent.change(within(panel).getByPlaceholderText('Ex: João da Silva'), {
        target: { value: 'Carla Dias' },
      });
      fireEvent.change(within(panel).getByPlaceholderText('joao@empresa.com'), {
        target: { value: 'carla@tijuca.com' },
      });
      fireEvent.change(within(panel).getByRole('combobox'), { target: { value: 'a1' } });
      fireEvent.click(within(panel).getByRole('radio', { name: radio }));
      if (method === 'password') {
        fireEvent.change(within(panel).getByLabelText('Senha'), { target: { value: 'Abc12345' } });
      }

      mocks.fetchUsers.mockResolvedValue({
        data: [created, user()],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      fireEvent.click(within(panel).getByRole('button', { name: button }));

      await waitFor(() => expect(mocks.createUser).toHaveBeenCalledTimes(1));
      const payload = mocks.createUser.mock.calls[0][0];
      expect(payload).toEqual({
        fullName: 'Carla Dias',
        email: 'carla@tijuca.com',
        role: 'editor',
        areaId: 'a1',
        ...extra,
      });
      if (method !== 'password') expect(payload).not.toHaveProperty('password');

      expect(await screen.findByText(toast)).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Convidar usuário' })).not.toBeInTheDocument(),
      );
      expect(screen.getByText('Carla Dias').closest('tr')).toHaveAttribute('data-highlighted');
    },
  );

  it('erro ao criar mantém o painel aberto com a mensagem', async () => {
    mocks.createUser.mockRejectedValue(new Error('boom'));
    renderUsers();
    const panel = await openCreatePanel();
    fireEvent.change(within(panel).getByPlaceholderText('Ex: João da Silva'), {
      target: { value: 'Carla Dias' },
    });
    fireEvent.change(within(panel).getByPlaceholderText('joao@empresa.com'), {
      target: { value: 'carla@tijuca.com' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Enviar convite' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Falha ao criar usuário.');
    expect(screen.getByRole('region', { name: 'Convidar usuário' })).toBeInTheDocument();
  });

  it('editar: abre preenchido, valida a nova senha e salva', async () => {
    mocks.updateUser.mockResolvedValue(user({ fullName: 'Ana Souza Lima' }));
    renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Ana Souza' }));
    const panel = await screen.findByRole('region', { name: 'Editar usuário' });

    expect(within(panel).getByPlaceholderText('Ex: João da Silva')).toHaveValue('Ana Souza');
    expect(within(panel).getByPlaceholderText('joao@empresa.com')).toHaveValue(
      'ana@tijucaalimentos.com',
    );
    await waitFor(() => expect(within(panel).getByRole('combobox')).toHaveValue('a1'));
    expect(within(panel).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(panel).getByText('Situação da conta')).toBeInTheDocument();
    expect(within(panel).getByText('Só os campos alterados serão salvos.')).toBeInTheDocument();

    const save = within(panel).getByRole('button', { name: 'Salvar alterações' });
    const password = within(panel).getByPlaceholderText('Deixe em branco para manter a atual');
    fireEvent.change(password, { target: { value: 'curta' } });
    expect(save).toBeDisabled();
    expect(
      within(panel).getByText('A nova senha passa a valer no próximo acesso.'),
    ).toBeInTheDocument();
    fireEvent.change(password, { target: { value: '' } });
    fireEvent.change(within(panel).getByPlaceholderText('Ex: João da Silva'), {
      target: { value: 'Ana Souza Lima' },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith('u1', {
        fullName: 'Ana Souza Lima',
        email: 'ana@tijucaalimentos.com',
        role: 'editor',
        areaId: 'a1',
      }),
    );
    expect(await screen.findByText('Cadastro de Ana atualizado')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Editar usuário' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Ana Souza').closest('tr')).toHaveAttribute('data-highlighted');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Editar Ana Souza' })).toHaveFocus(),
    );
  });

  it('editar usuário de 1º acesso mostra "Reenviar convite" e reenvia', async () => {
    mocks.sendUserInvite.mockResolvedValue({ sent: true });
    renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Bruno Lima' }));
    const panel = await screen.findByRole('region', { name: 'Editar usuário' });
    expect(
      within(panel).getByText('Cadastrado, mas ainda não entrou no sistema.'),
    ).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: /Reenviar convite/ }));
    await waitFor(() => expect(mocks.sendUserInvite).toHaveBeenCalledWith('u2'));
    expect(await screen.findByText('Convite reenviado para bruno@x.com')).toBeInTheDocument();
    // Reenviar não fecha o painel.
    expect(screen.getByRole('region', { name: 'Editar usuário' })).toBeInTheDocument();
  });

  it('o destaque da linha some depois de 1.8s', async () => {
    mocks.updateUser.mockResolvedValue(user());
    renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Ana Souza' }));
    const panel = await screen.findByRole('region', { name: 'Editar usuário' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() =>
      expect(screen.getByText('Ana Souza').closest('tr')).toHaveAttribute('data-highlighted'),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 1900)));
    expect(screen.getByText('Ana Souza').closest('tr')).not.toHaveAttribute('data-highlighted');
  });
});
