import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxItem } from '../services/inbox-api';
import { NotificationBell, formatRelativeTime } from './notification-bell';

const mocks = vi.hoisted(() => ({
  fetchInbox: vi.fn(),
  fetchUnreadCount: vi.fn(),
  markInboxItemRead: vi.fn(),
  markAllInboxRead: vi.fn(),
}));

vi.mock('../services/inbox-api', () => ({
  fetchInbox: mocks.fetchInbox,
  fetchUnreadCount: mocks.fetchUnreadCount,
  markInboxItemRead: mocks.markInboxItemRead,
  markAllInboxRead: mocks.markAllInboxRead,
}));

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'i1',
    title: 'Aprovação pendente',
    message: 'O pedido P-1 aguarda sua decisão.',
    link: null,
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

function page(items: InboxItem[]) {
  return { data: items, total: items.length, page: 1, limit: 15, totalPages: 1 };
}

function CurrentLocation() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <NotificationBell />
        <Routes>
          <Route path="*" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetchUnreadCount.mockReset().mockResolvedValue(0);
  mocks.fetchInbox.mockReset().mockResolvedValue(page([]));
  mocks.markInboxItemRead.mockReset().mockResolvedValue(undefined);
  mocks.markAllInboxRead.mockReset().mockResolvedValue(undefined);
});

describe('NotificationBell', () => {
  describe('contador', () => {
    it('sem não lidas: sem selo', async () => {
      renderBell();
      await waitFor(() => expect(mocks.fetchUnreadCount).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument();
      expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    });

    it('com não lidas: selo e rótulo acessível com a quantidade', async () => {
      mocks.fetchUnreadCount.mockResolvedValue(3);
      renderBell();
      expect(await screen.findByTestId('notification-badge')).toHaveTextContent('3');
      expect(screen.getByRole('button', { name: 'Notificações (3 não lidas)' })).toBeInTheDocument();
    });

    it('mais de 99 vira 99+', async () => {
      mocks.fetchUnreadCount.mockResolvedValue(250);
      renderBell();
      expect(await screen.findByTestId('notification-badge')).toHaveTextContent('99+');
    });
  });

  describe('painel', () => {
    it('só consulta a lista quando abre', async () => {
      renderBell();
      await waitFor(() => expect(mocks.fetchUnreadCount).toHaveBeenCalled());
      expect(mocks.fetchInbox).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      await waitFor(() => expect(mocks.fetchInbox).toHaveBeenCalledWith({ page: 1, limit: 15 }));
    });

    it('lista título, mensagem e há quanto tempo; destaca as não lidas', async () => {
      mocks.fetchUnreadCount.mockResolvedValue(1);
      mocks.fetchInbox.mockResolvedValue(
        page([item(), item({ id: 'i2', title: null, message: 'Aviso antigo', isRead: true, createdAt: new Date(Date.now() - 3 * 3600_000).toISOString() })]),
      );
      renderBell();
      fireEvent.click(await screen.findByRole('button', { name: /Notificações/ }));

      const dialog = await screen.findByRole('dialog', { name: 'Notificações' });
      expect(await within(dialog).findByText('Aprovação pendente')).toBeInTheDocument();
      expect(within(dialog).getByText('O pedido P-1 aguarda sua decisão.')).toBeInTheDocument();
      expect(within(dialog).getByText('há 5 min')).toBeInTheDocument();
      expect(within(dialog).getByText('Aviso antigo')).toBeInTheDocument();
      expect(within(dialog).getByText('há 3 h')).toBeInTheDocument();
    });

    it('vazio, carregando e erro têm mensagens próprias', async () => {
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      expect(await screen.findByText('Nenhuma notificação por aqui.')).toBeInTheDocument();
    });

    it('mostra o estado de carregamento', () => {
      mocks.fetchInbox.mockReturnValue(new Promise(() => undefined));
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      expect(screen.getByText('Carregando...')).toBeInTheDocument();
    });

    it('mostra erro quando a lista não carrega', async () => {
      mocks.fetchInbox.mockRejectedValue(new Error('500'));
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as notificações.');
    });

    it('fecha com Escape e ao clicar fora', async () => {
      renderBell();
      const button = screen.getByRole('button', { name: 'Notificações' });
      fireEvent.click(button);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      fireEvent.click(button);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('leitura', () => {
    it('clicar numa não lida marca como lida e atualiza contador e lista', async () => {
      mocks.fetchUnreadCount.mockResolvedValueOnce(1).mockResolvedValue(0);
      mocks.fetchInbox.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([item({ isRead: true })]));
      renderBell();
      fireEvent.click(await screen.findByRole('button', { name: /Notificações/ }));
      fireEvent.click(await screen.findByText('O pedido P-1 aguarda sua decisão.'));

      await waitFor(() => expect(mocks.markInboxItemRead).toHaveBeenCalledWith('i1', expect.anything()));
      await waitFor(() => expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument());
    });

    it('aviso com link abre a tela citada e fecha o painel', async () => {
      mocks.fetchInbox.mockResolvedValue(page([item({ link: '/aprovacoes?id=a1' })]));
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      fireEvent.click(await screen.findByText('O pedido P-1 aguarda sua decisão.'));
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/aprovacoes?id=a1'));
      expect(screen.queryByText('O pedido P-1 aguarda sua decisão.')).not.toBeInTheDocument();
    });

    it('aviso sem link (ou com endereço externo) não sai da tela', async () => {
      mocks.fetchInbox.mockResolvedValue(page([item({ link: '//fora.example' })]));
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      fireEvent.click(await screen.findByText('O pedido P-1 aguarda sua decisão.'));
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    });

    it('clicar numa já lida não chama a API', async () => {
      mocks.fetchInbox.mockResolvedValue(page([item({ isRead: true })]));
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      fireEvent.click(await screen.findByText('O pedido P-1 aguarda sua decisão.'));
      expect(mocks.markInboxItemRead).not.toHaveBeenCalled();
    });

    it('“Marcar todas como lidas” só habilita com não lidas e chama a API', async () => {
      renderBell();
      fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
      expect(await screen.findByRole('button', { name: /Marcar todas como lidas/ })).toBeDisabled();
    });

    it('marcar todas como lidas', async () => {
      mocks.fetchUnreadCount.mockResolvedValueOnce(2).mockResolvedValue(0);
      mocks.fetchInbox.mockResolvedValue(page([item(), item({ id: 'i2' })]));
      renderBell();
      fireEvent.click(await screen.findByRole('button', { name: /Notificações/ }));
      const markAll = await screen.findByRole('button', { name: /Marcar todas como lidas/ });
      await waitFor(() => expect(markAll).toBeEnabled());
      fireEvent.click(markAll);
      await waitFor(() => expect(mocks.markAllInboxRead).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument());
    });
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [10_000, 'agora'],
    [5 * 60_000, 'há 5 min'],
    [59 * 60_000, 'há 59 min'],
    [3 * 3600_000, 'há 3 h'],
    [26 * 3600_000, 'ontem'],
    [3 * 24 * 3600_000, 'há 3 dias'],
  ])('%d ms atrás → %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(expected);
  });

  it('mais de uma semana mostra a data; data inválida não quebra', () => {
    expect(formatRelativeTime(ago(10 * 24 * 3600_000), now)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatRelativeTime('lixo', now)).toBe('');
  });
});
