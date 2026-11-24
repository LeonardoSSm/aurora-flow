import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import type * as ExternalApprovalApi from '../services/external-approval-api';
import type { ExternalApprovalView } from '../services/external-approval-api';
import { ExternalApprovalPage } from './external-approval-page';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), decide: vi.fn() }));

vi.mock('../services/external-approval-api', async (importOriginal) => ({
  ...(await importOriginal<typeof ExternalApprovalApi>()),
  fetchExternalApproval: mocks.fetch,
  decideExternalApproval: mocks.decide,
}));

const TOKEN = 'T'.repeat(43);

const pending: ExternalApprovalView = {
  state: 'pending',
  orgName: 'Aurora Flow',
  emailHint: 'g***@tijucaalimentos.com',
  expiresAt: '2026-10-13T15:00:00.000Z',
  approval: { title: 'Aprovar pedido de embalagens', description: 'Confira os itens.' },
  solicitation: {
    number: 'A1B2C3D4',
    title: 'Pedido 123',
    description: 'Preciso de 500 caixas',
    requesterName: 'Maria Souza',
    createdAt: '2026-10-06T12:00:00.000Z',
    answers: [
      { label: 'Quantidade', value: '500' },
      { label: 'Urgente', value: 'Sim' },
    ],
  },
};

function apiError(status: number, data: Record<string, unknown>): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/aprovar/${TOKEN}`]}>
      <Routes>
        <Route path="/aprovar/:token" element={<ExternalApprovalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderPending() {
  mocks.fetch.mockResolvedValue(pending);
  renderPage();
  await screen.findByText('Aprovar pedido de embalagens');
}

const emailInput = () => screen.getByPlaceholderText('g***@tijucaalimentos.com');
const submitButton = () => screen.getByRole('button', { name: /Confirmar/ });

describe('ExternalApprovalPage', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.decide.mockReset();
  });

  describe('carregamento', () => {
    it('busca a aprovação pelo token da URL', async () => {
      await renderPending();

      expect(mocks.fetch).toHaveBeenCalledWith(TOKEN);
    });

    it('mostra os detalhes: aprovação, solicitação, solicitante e respostas do formulário', async () => {
      await renderPending();

      expect(screen.getByText('Confira os itens.')).toBeInTheDocument();
      expect(screen.getByText(/#A1B2C3D4 · Pedido 123/)).toBeInTheDocument();
      expect(screen.getByText('Preciso de 500 caixas')).toBeInTheDocument();
      expect(screen.getByText(/Solicitante: Maria Souza/)).toBeInTheDocument();
      expect(screen.getByText('Quantidade')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('Sim')).toBeInTheDocument();
      expect(screen.getByText(/Link válido até/)).toBeInTheDocument();
    });

    it('mostra o estado de carregamento enquanto espera', () => {
      mocks.fetch.mockReturnValue(new Promise(() => undefined));

      renderPage();

      expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    });

    it('token desconhecido (404): "Link inválido", sem formulário', async () => {
      mocks.fetch.mockRejectedValue(apiError(404, { message: 'Link de aprovação inválido.' }));

      renderPage();

      expect(await screen.findByText('Link inválido.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
    });

    it('falha de rede: oferece tentar de novo e carrega na segunda vez', async () => {
      mocks.fetch.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(pending);

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));

      expect(await screen.findByText('Aprovar pedido de embalagens')).toBeInTheDocument();
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['decided', { state: 'decided', orgName: 'X', decision: { decision: 'approved', decidedAt: '2026-10-07T10:00:00.000Z' } }, 'Aprovação registrada.'],
      ['decided (reprovada)', { state: 'decided', orgName: 'X', decision: { decision: 'rejected', decidedAt: null } }, 'Reprovação registrada.'],
      ['expired', { state: 'expired', orgName: 'X' }, 'Este link expirou ou foi bloqueado.'],
      ['closed', { state: 'closed', orgName: 'X' }, 'Esta aprovação foi encerrada.'],
    ] as const)('estado %s: só o aviso, sem formulário nem dados da solicitação', async (_label, view, title) => {
      mocks.fetch.mockResolvedValue(view);

      renderPage();

      expect(await screen.findByText(title)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Pedido 123/)).not.toBeInTheDocument();
    });
  });

  describe('página lacrada (a URL carrega uma credencial)', () => {
    it('pede para não indexar e não enviar Referer, e desfaz ao sair', async () => {
      mocks.fetch.mockResolvedValue(pending);

      const { unmount } = renderPage();
      await screen.findByText('Aprovar pedido de embalagens');

      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');

      unmount();

      expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
      expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
    });

    it('não oferece login nem links para o sistema (quem abre não tem usuário)', async () => {
      await renderPending();

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('decisão', () => {
    it('aprovar: envia decisão, comentário e e-mail (sem espaços) e mostra o resultado', async () => {
      await renderPending();
      mocks.decide.mockResolvedValue({
        state: 'decided',
        orgName: 'Aurora Flow',
        decision: { decision: 'approved', decidedAt: '2026-10-07T10:00:00.000Z' },
      });

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(screen.getByLabelText(/Comentário/), { target: { value: '  Pode seguir  ' } });
      fireEvent.change(emailInput(), { target: { value: '  gestor@tijucaalimentos.com ' } });
      fireEvent.click(submitButton());

      expect(await screen.findByText('Aprovação registrada.')).toBeInTheDocument();
      expect(mocks.decide).toHaveBeenCalledWith(TOKEN, {
        decision: 'approved',
        comment: 'Pode seguir',
        confirmEmail: 'gestor@tijucaalimentos.com',
      });
      expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
    });

    it('aprovar sem comentário envia comment indefinido', async () => {
      await renderPending();
      mocks.decide.mockResolvedValue({ state: 'decided', orgName: 'X', decision: { decision: 'approved', decidedAt: null } });

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      await waitFor(() => expect(mocks.decide).toHaveBeenCalled());
      expect(mocks.decide.mock.calls[0][1].comment).toBeUndefined();
    });

    it('reprovar com motivo mostra "Reprovação registrada"', async () => {
      await renderPending();
      mocks.decide.mockResolvedValue({ state: 'decided', orgName: 'X', decision: { decision: 'rejected', decidedAt: null } });

      fireEvent.click(screen.getByRole('radio', { name: 'Reprovar' }));
      fireEvent.change(screen.getByLabelText(/Comentário/), { target: { value: 'Fora do orçamento' } });
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByText('Reprovação registrada.')).toBeInTheDocument();
      expect(mocks.decide.mock.calls[0][1]).toMatchObject({ decision: 'rejected', comment: 'Fora do orçamento' });
    });

    it('o botão de confirmar acompanha a escolha', async () => {
      await renderPending();

      expect(submitButton()).toHaveTextContent('Confirmar decisão');
      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      expect(submitButton()).toHaveTextContent('Confirmar aprovação');
      fireEvent.click(screen.getByRole('radio', { name: 'Reprovar' }));
      expect(submitButton()).toHaveTextContent('Confirmar reprovação');
      expect(screen.getByRole('radio', { name: 'Reprovar' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Aprovar' })).toHaveAttribute('aria-checked', 'false');
    });

    it('exige escolher aprovar ou reprovar', async () => {
      await renderPending();

      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('Escolha Aprovar ou Reprovar.');
      expect(mocks.decide).not.toHaveBeenCalled();
    });

    it.each(['', 'sem-arroba'])('exige um e-mail válido de confirmação (%p)', async (value) => {
      await renderPending();

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value } });
      fireEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(/Informe o e-mail que recebeu este link/);
      expect(mocks.decide).not.toHaveBeenCalled();
    });

    it('reprovar sem motivo é barrado antes de chamar a API', async () => {
      await renderPending();

      fireEvent.click(screen.getByRole('radio', { name: 'Reprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('Informe o motivo da reprovação.');
      expect(mocks.decide).not.toHaveBeenCalled();
    });

    it('e-mail que não confere (403): mostra a mensagem do servidor e mantém o formulário preenchido', async () => {
      await renderPending();
      mocks.decide.mockRejectedValue(
        apiError(403, { message: 'O e-mail informado não confere com o destinatário do link. Restam 3 tentativa(s).', remainingAttempts: 3 }),
      );

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'outro@x.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('Restam 3 tentativa(s).');
      expect(emailInput()).toHaveValue('outro@x.com');
      expect(submitButton()).not.toBeDisabled();
    });

    it('link bloqueado/expirado ao enviar (410): a tela passa a mostrar o estado', async () => {
      await renderPending();
      mocks.decide.mockRejectedValue(apiError(410, { message: 'Tentativas esgotadas', state: 'expired' }));

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'x@y.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByText('Este link expirou ou foi bloqueado.')).toBeInTheDocument();
    });

    it('decidida por outra aba (410 "decided"): mostra "já decidida"', async () => {
      await renderPending();
      mocks.decide.mockRejectedValue(apiError(410, { message: 'Esta aprovação já foi decidida.', state: 'decided' }));

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByText(/Esta aprovação já foi decidida e não pode ser alterada/)).toBeInTheDocument();
    });

    it('link invalidado entre a leitura e o envio (404): "Link inválido"', async () => {
      await renderPending();
      mocks.decide.mockRejectedValue(apiError(404, { message: 'Link de aprovação inválido.' }));

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByText('Link inválido.')).toBeInTheDocument();
    });

    it('erro inesperado: mensagem genérica e o formulário continua disponível', async () => {
      await renderPending();
      mocks.decide.mockRejectedValue(new Error('Network Error'));

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível registrar a decisão.');
      expect(submitButton()).not.toBeDisabled();
    });

    it('bloqueia o botão durante o envio (evita decidir duas vezes)', async () => {
      await renderPending();
      let resolve: (view: ExternalApprovalView) => void = () => undefined;
      mocks.decide.mockReturnValue(new Promise<ExternalApprovalView>((r) => (resolve = r)));

      fireEvent.click(screen.getByRole('radio', { name: 'Aprovar' }));
      fireEvent.change(emailInput(), { target: { value: 'gestor@tijucaalimentos.com' } });
      fireEvent.click(submitButton());

      const sending = await screen.findByRole('button', { name: 'Enviando...' });
      expect(sending).toBeDisabled();
      fireEvent.click(sending);
      expect(mocks.decide).toHaveBeenCalledTimes(1);

      resolve({ state: 'decided', orgName: 'X', decision: { decision: 'approved', decidedAt: null } });
      expect(await screen.findByText('Aprovação registrada.')).toBeInTheDocument();
    });
  });
});
