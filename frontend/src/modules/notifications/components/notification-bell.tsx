import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInboxMutations, useInboxQuery, useUnreadCountQuery } from '../hooks/use-inbox';
import type { InboxItem } from '../services/inbox-api';

/** “há 5 min”, “há 2 h”, “ontem”, ou a data — curto o bastante para a lista do sino. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return then.toLocaleDateString('pt-BR');
}

/**
 * Sino da barra superior: mostra as notificações internas do usuário (as geradas pelo nó
 * “Notificação” com o canal “Notificação no sistema” e por outros avisos do sistema).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: unread = 0 } = useUnreadCountQuery();
  const inbox = useInboxQuery(open);
  const { markRead, markAllRead } = useInboxMutations();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items: InboxItem[] = inbox.data?.data ?? [];
  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex shrink-0 items-center rounded-xl bg-surface-container-low px-3 py-2 text-tx-secondary transition-colors hover:bg-surface-container-high hover:text-tx-primary"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold leading-[18px] text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 z-30 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
            <p className="text-sm font-bold text-tx-primary">Notificações</p>
            <button
              type="button"
              disabled={unread === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1 text-[12px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como lidas
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {inbox.isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-tx-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            )}

            {inbox.isError && (
              <p role="alert" className="px-4 py-6 text-center text-sm text-[#ef4444]">
                Não foi possível carregar as notificações.
              </p>
            )}

            {!inbox.isLoading && !inbox.isError && items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-tx-muted">Nenhuma notificação por aqui.</p>
            )}

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.isRead) markRead.mutate(item.id);
                  // Aviso com destino (solicitação, aprovação) abre a tela; os demais só marcam lido.
                  if (item.link?.startsWith('/') && !item.link.startsWith('//')) {
                    setOpen(false);
                    navigate(item.link);
                  }
                }}
                className={[
                  'flex w-full items-start gap-3 border-b border-border-subtle px-4 py-3 text-left last:border-0 hover:bg-bg-s2',
                  item.isRead ? '' : 'bg-bg-hover',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-primary'].join(' ')}
                />
                <span className="min-w-0 flex-1">
                  {item.title && <span className="block truncate text-sm font-bold text-tx-primary">{item.title}</span>}
                  <span className="block whitespace-pre-wrap break-words text-[13px] text-tx-secondary">{item.message}</span>
                  <span className="mt-0.5 block text-[11px] text-tx-muted">{formatRelativeTime(item.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
