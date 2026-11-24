import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNotification, FlowNotificationRecipient } from '../services/flows-api';
import { ExecutionNotifications, canCancel, canRetry } from './ExecutionNotifications';

const mocks = vi.hoisted(() => ({
  fetchFlowNotifications: vi.fn(),
  cancelFlowNotification: vi.fn(),
  retryFlowNotification: vi.fn(),
  permissions: new Set<string>(),
}));

vi.mock('../services/flows-api', () => ({
  fetchFlowNotifications: mocks.fetchFlowNotifications,
  cancelFlowNotification: mocks.cancelFlowNotification,
  retryFlowNotification: mocks.retryFlowNotification,
}));
vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({ hasPermission: (code: string) => mocks.permissions.has(code) }),
}));

function recipient(overrides: Partial<FlowNotificationRecipient> = {}): FlowNotificationRecipient {
  return {
    id: 'r1',
    source: 'custom',
    displayName: null,
    address: 'ma***@x.com',
    status: 'sent',
    attemptCount: 1,
    provider: 'smtp',
    lastErrorCategory: null,
    lastError: null,
    nextAttemptAt: '2026-10-05T12:00:00.000Z',
    sentAt: '2026-10-05T12:00:01.000Z',
    deliveredAt: null,
    failedAt: null,
    ...overrides,
  };
}

function notification(overrides: Partial<FlowNotification> = {}): FlowNotification {
  return {
    id: 'n1',
    channel: 'email',
    status: 'sent',
    nodeId: 'node-1',
    flowExecutionId: 'exec-1',
    title: null,
    body: null,
    scheduledFor: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    recipients: [recipient()],
    ...overrides,
  };
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExecutionNotifications flowId="flow-1" executionId="exec-1" nodeLabel={(id) => `Nó ${id}`} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetchFlowNotifications.mockReset();
  mocks.cancelFlowNotification.mockReset().mockResolvedValue(undefined);
  mocks.retryFlowNotification.mockReset().mockResolvedValue(undefined);
  mocks.permissions = new Set();
});

describe('ExecutionNotifications', () => {
  it('consulta as notificações DA execução', async () => {
    mocks.fetchFlowNotifications.mockResolvedValue({ data: [notification()], total: 1 });
    renderPanel();
    await screen.findByRole('region', { name: 'Notificações desta execução' });
    expect(mocks.fetchFlowNotifications).toHaveBeenCalledWith('flow-1', 'exec-1');
  });

  it('não renderiza nada quando a execução não enviou notificações (fluxos antigos ficam como eram)', async () => {
    mocks.fetchFlowNotifications.mockResolvedValue({ data: [], total: 0 });
    const { container } = renderPanel();
    await waitFor(() => expect(mocks.fetchFlowNotifications).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('não renderiza nada (nem quebra) se a consulta falhar', async () => {
    mocks.fetchFlowNotifications.mockRejectedValue(new Error('403'));
    const { container } = renderPanel();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('mostra carregamento enquanto consulta', () => {
    mocks.fetchFlowNotifications.mockReturnValue(new Promise(() => undefined));
    renderPanel();
    expect(screen.getByText('Carregando notificações...')).toBeInTheDocument();
  });

  it('mostra canal, nó de origem, estado agregado e cada destinatário com tentativas', async () => {
    mocks.fetchFlowNotifications.mockResolvedValue({
      data: [
        notification({
          status: 'partially_sent',
          title: 'Pedido P-1',
          recipients: [
            recipient({ id: 'r1', address: 'ma***@x.com', status: 'sent', attemptCount: 1 }),
            recipient({
              id: 'r2',
              address: 'jo***@x.com',
              status: 'failed',
              attemptCount: 3,
              lastErrorCategory: 'timeout',
              lastError: 'Tempo esgotado ao enviar.',
            }),
          ],
        }),
      ],
      total: 1,
    });
    renderPanel();

    const card = await screen.findByTestId('notification-n1');
    expect(within(card).getByText('E-mail · Nó node-1')).toBeInTheDocument();
    expect(within(card).getByText('Pedido P-1')).toBeInTheDocument();
    expect(within(card).getByText('Parcialmente enviada')).toBeInTheDocument();
    expect(within(card).getByText(/ma\*\*\*@x\.com/)).toBeInTheDocument();
    expect(within(card).getByText(/enviado \(1 tentativa\)/)).toBeInTheDocument();
    expect(within(card).getByText(/falhou \(3 tentativas\)/)).toBeInTheDocument();
    expect(within(card).getByText('tempo esgotado: Tempo esgotado ao enviar.')).toBeInTheDocument();
  });

  it('usa o nome quando o usuário pode ver detalhes, e o endereço mascarado quando não', async () => {
    mocks.fetchFlowNotifications.mockResolvedValue({
      data: [
        notification({
          recipients: [
            recipient({ id: 'r1', displayName: 'Maria Souza', address: 'maria@x.com' }),
            recipient({ id: 'r2', displayName: null, address: 'jo***@x.com' }),
            recipient({ id: 'r3', displayName: null, address: null, status: 'failed', lastErrorCategory: 'invalid_recipient', lastError: 'A solicitação não tem responsável atribuído.' }),
          ],
        }),
      ],
      total: 1,
    });
    renderPanel();
    const card = await screen.findByTestId('notification-n1');
    expect(within(card).getByText('Maria Souza')).toBeInTheDocument();
    expect(within(card).getByText(/maria@x\.com/)).toBeInTheDocument();
    expect(within(card).getByText('jo***@x.com')).toBeInTheDocument();
    expect(within(card).getByText('Destinatário sem endereço')).toBeInTheDocument();
    expect(within(card).getByText(/destinatário inválido: A solicitação não tem responsável/)).toBeInTheDocument();
  });

  it('mostra quando um envio agendado está previsto', async () => {
    mocks.fetchFlowNotifications.mockResolvedValue({
      data: [notification({ status: 'scheduled', recipients: [recipient({ status: 'scheduled', attemptCount: 0, nextAttemptAt: '2026-10-06T15:30:00.000Z' })] })],
      total: 1,
    });
    renderPanel();
    expect(await screen.findByText('Agendada')).toBeInTheDocument();
    expect(screen.getByText(/envio previsto:/)).toBeInTheDocument();
  });

  describe('ações (flows.manage)', () => {
    it('quem só visualiza não vê os botões', async () => {
      mocks.fetchFlowNotifications.mockResolvedValue({
        data: [
          notification({ status: 'failed', recipients: [recipient({ status: 'failed', lastErrorCategory: 'timeout', lastError: 'x' })] }),
          notification({ id: 'n2', status: 'scheduled', recipients: [recipient({ id: 'r9', status: 'scheduled' })] }),
        ],
        total: 2,
      });
      renderPanel();
      await screen.findByTestId('notification-n1');
      expect(screen.queryByRole('button', { name: 'Reenviar falhas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar envio' })).not.toBeInTheDocument();
    });

    it('quem gerencia pode reenviar falhas recuperáveis', async () => {
      mocks.permissions = new Set(['flows.manage']);
      mocks.fetchFlowNotifications.mockResolvedValue({
        data: [notification({ status: 'failed', recipients: [recipient({ status: 'failed', lastErrorCategory: 'not_configured', lastError: 'SMTP não configurado no servidor.' })] })],
        total: 1,
      });
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'Reenviar falhas' }));
      await waitFor(() => expect(mocks.retryFlowNotification).toHaveBeenCalledWith('flow-1', 'n1'));
      expect(mocks.fetchFlowNotifications.mock.calls.length).toBeGreaterThan(1); // recarrega depois
    });

    it('quem gerencia pode cancelar o que ainda não foi enviado', async () => {
      mocks.permissions = new Set(['flows.manage']);
      mocks.fetchFlowNotifications.mockResolvedValue({
        data: [notification({ status: 'scheduled', recipients: [recipient({ status: 'scheduled', attemptCount: 0 })] })],
        total: 1,
      });
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar envio' }));
      await waitFor(() => expect(mocks.cancelFlowNotification).toHaveBeenCalledWith('flow-1', 'n1'));
    });

    it('não oferece reenvio quando só há destinatário inválido, nem cancelar quando já foi tudo enviado', async () => {
      mocks.permissions = new Set(['flows.manage']);
      mocks.fetchFlowNotifications.mockResolvedValue({
        data: [
          notification({ id: 'n1', status: 'failed', recipients: [recipient({ status: 'failed', lastErrorCategory: 'invalid_recipient' })] }),
          notification({ id: 'n2', status: 'sent' }),
        ],
        total: 2,
      });
      renderPanel();
      await screen.findByTestId('notification-n1');
      expect(screen.queryByRole('button', { name: 'Reenviar falhas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar envio' })).not.toBeInTheDocument();
    });

    it('mostra o erro do servidor se a ação falhar', async () => {
      mocks.permissions = new Set(['flows.manage']);
      mocks.retryFlowNotification.mockRejectedValue(
        new AxiosError('x', 'ERR', undefined, undefined, { status: 404, data: { message: 'Notificação não encontrada.' } } as AxiosResponse),
      );
      mocks.fetchFlowNotifications.mockResolvedValue({
        data: [notification({ status: 'failed', recipients: [recipient({ status: 'failed', lastErrorCategory: 'timeout', lastError: 'x' })] })],
        total: 1,
      });
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'Reenviar falhas' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Notificação não encontrada.');
    });
  });

  describe('regras de canCancel / canRetry', () => {
    it('canCancel: só com destinatário pendente/agendado', () => {
      expect(canCancel(notification({ recipients: [recipient({ status: 'pending' })] }))).toBe(true);
      expect(canCancel(notification({ recipients: [recipient({ status: 'scheduled' })] }))).toBe(true);
      expect(canCancel(notification({ recipients: [recipient({ status: 'processing' })] }))).toBe(false);
      expect(canCancel(notification({ recipients: [recipient({ status: 'sent' })] }))).toBe(false);
    });

    it('canRetry: só falhas que não são destinatário inválido', () => {
      expect(canRetry(notification({ recipients: [recipient({ status: 'failed', lastErrorCategory: 'timeout' })] }))).toBe(true);
      expect(canRetry(notification({ recipients: [recipient({ status: 'failed', lastErrorCategory: 'invalid_recipient' })] }))).toBe(false);
      expect(canRetry(notification({ recipients: [recipient({ status: 'sent' })] }))).toBe(false);
    });
  });
});
