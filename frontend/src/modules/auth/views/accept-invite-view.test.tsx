import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import type * as UserInviteApi from '../services/user-invite-api';
import { AcceptInviteView } from './accept-invite-view';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), accept: vi.fn(), setAccessToken: vi.fn() }));

vi.mock('../services/user-invite-api', async (importOriginal) => ({
  ...(await importOriginal<typeof UserInviteApi>()),
  fetchUserInvite: mocks.fetch,
  acceptUserInvite: mocks.accept,
}));

vi.mock('../../../services/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setAccessToken: mocks.setAccessToken,
}));

const TOKEN = 'T'.repeat(43);

function apiError(status: number, data: Record<string, unknown> = {}): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/convite/${TOKEN}`]}>
        <Routes>
          <Route path="/convite/:token" element={<AcceptInviteView />} />
          <Route path="/inicio" element={<p>Tela inicial</p>} />
          <Route path="/login" element={<p>Tela de login</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const invite = { fullName: 'Maria Souza', email: 'maria@exemplo.com', expiresAt: '2026-11-13T15:00:00.000Z' };

function fillPasswords(password: string, confirm = password) {
  // O rótulo da senha também envolve a dica e a barra de força, então o texto dele não é só "Senha".
  const [first, second] = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]'),
  );
  fireEvent.change(first, { target: { value: password } });
  fireEvent.change(second, { target: { value: confirm } });
}

describe('AcceptInviteView', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.accept.mockReset();
    mocks.setAccessToken.mockReset();
    queryClient.clear();
  });

  it('mostra o nome e o e-mail de quem foi convidado', async () => {
    mocks.fetch.mockResolvedValue(invite);
    renderPage();

    expect(await screen.findByText('Olá, Maria!')).toBeInTheDocument();
    expect(screen.getByDisplayValue('maria@exemplo.com')).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith(TOKEN);
  });

  it('cria a senha, abre a sessão e vai para a tela inicial', async () => {
    mocks.fetch.mockResolvedValue(invite);
    const session = {
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'u1', email: invite.email, hasPassword: true },
      permissions: {},
    };
    mocks.accept.mockResolvedValue(session);
    renderPage();
    await screen.findByText('Olá, Maria!');

    fillPasswords('NovaSenha1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(await screen.findByText('Tela inicial')).toBeInTheDocument();
    expect(mocks.accept).toHaveBeenCalledWith(TOKEN, 'NovaSenha1');
    expect(mocks.setAccessToken).toHaveBeenCalledWith('access');
    expect(queryClient.getQueryData(queryKeys.auth.me())).toEqual(session);
  });

  it('valida a regra da senha e a confirmação antes de enviar', async () => {
    mocks.fetch.mockResolvedValue(invite);
    renderPage();
    await screen.findByText('Olá, Maria!');

    fillPasswords('fraca');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(await screen.findByText(/Mínimo de 8 caracteres/, { selector: 'p' })).toBeInTheDocument();

    fillPasswords('NovaSenha1', 'NovaSenha2');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(await screen.findByText('As senhas não conferem.')).toBeInTheDocument();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('link inválido, expirado ou já usado mostra o aviso sem formulário', async () => {
    mocks.fetch.mockRejectedValue(apiError(404, { message: 'inválido' }));
    renderPage();

    expect(await screen.findByText('Convite inválido ou expirado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar senha e entrar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toBeInTheDocument();
  });

  it('convite gasto entre abrir e enviar vira o aviso de inválido', async () => {
    mocks.fetch.mockResolvedValue(invite);
    mocks.accept.mockRejectedValue(apiError(404));
    renderPage();
    await screen.findByText('Olá, Maria!');

    fillPasswords('NovaSenha1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(await screen.findByText('Convite inválido ou expirado')).toBeInTheDocument();
    expect(mocks.setAccessToken).not.toHaveBeenCalled();
  });

  it('erro de rede oferece tentar de novo', async () => {
    mocks.fetch.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    mocks.fetch.mockResolvedValueOnce(invite);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByText('Olá, Maria!')).toBeInTheDocument());
  });

  it('limite de tentativas mostra mensagem própria', async () => {
    mocks.fetch.mockResolvedValue(invite);
    mocks.accept.mockRejectedValue(apiError(429));
    renderPage();
    await screen.findByText('Olá, Maria!');

    fillPasswords('NovaSenha1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(await screen.findByText(/Muitas tentativas/)).toBeInTheDocument();
  });
});
