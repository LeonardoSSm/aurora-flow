import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Loader2 } from 'lucide-react';
import { useAuth } from '../../../app/auth-context';
import { queryKeys } from '../../../lib/query-keys';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { channelInfo } from '../lib/notification-config';
import {
  cancelFlowNotification,
  fetchFlowNotifications,
  retryFlowNotification,
  type FlowNotification,
  type FlowNotificationRecipient,
} from '../services/flows-api';

export const NOTIFICATION_STATUS_LABEL: Record<FlowNotification['status'], string> = {
  scheduled: 'Agendada',
  pending: 'Na fila',
  processing: 'Enviando',
  sent: 'Enviada',
  delivered: 'Entregue',
  partially_sent: 'Parcialmente enviada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const RECIPIENT_STATUS_LABEL: Record<FlowNotificationRecipient['status'], string> = {
  scheduled: 'agendado',
  pending: 'na fila',
  processing: 'enviando',
  sent: 'enviado',
  delivered: 'entregue',
  failed: 'falhou',
  cancelled: 'cancelado',
};

const ERROR_CATEGORY_LABEL: Record<string, string> = {
  transient: 'falha temporária',
  rate_limited: 'limite do provedor',
  timeout: 'tempo esgotado',
  permanent: 'recusado pelo provedor',
  invalid_recipient: 'destinatário inválido',
  not_configured: 'canal não configurado',
  unknown: 'erro inesperado',
};

function statusTone(status: FlowNotification['status']): string {
  if (status === 'failed') return 'bg-[#fef2f2] text-[#dc2626]';
  if (status === 'partially_sent') return 'bg-[#fffbeb] text-[#b45309]';
  if (status === 'sent' || status === 'delivered') return 'bg-[#f0fdf4] text-[#16a34a]';
  if (status === 'cancelled') return 'bg-bg-s2 text-tx-muted';
  return 'bg-[#eff6ff] text-[#2563eb]';
}

const ACTIVE_STATUSES: ReadonlyArray<FlowNotification['status']> = ['scheduled', 'pending', 'processing'];

export function canCancel(notification: FlowNotification): boolean {
  return notification.recipients.some((r) => r.status === 'pending' || r.status === 'scheduled');
}

/** Falhas que um reenvio manual pode resolver (endereço inválido não: repetir não muda nada). */
export function canRetry(notification: FlowNotification): boolean {
  return notification.recipients.some((r) => r.status === 'failed' && r.lastErrorCategory !== 'invalid_recipient');
}

/**
 * Notificações geradas pelos nós “Notificação” de UMA execução do fluxo: estado agregado, cada
 * destinatário, tentativas e o motivo de falha. Quem tem `flows.manage` pode cancelar o que ainda
 * não saiu e reenviar o que falhou por motivo recuperável. Não renderiza nada se a execução não
 * enviou notificações (fluxos antigos continuam com o painel exatamente como era).
 */
export function ExecutionNotifications({
  flowId,
  executionId,
  nodeLabel,
}: {
  flowId: string;
  executionId: string;
  nodeLabel: (nodeId: string) => string;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('flows.manage');
  const queryClient = useQueryClient();
  const key = queryKeys.flows.notifications(flowId, executionId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFlowNotifications(flowId, executionId),
    // acompanha envios em andamento (retentativas, agendados) sem recarregar a tela
    refetchInterval: (q) =>
      q.state.data?.data.some((n) => ACTIVE_STATUSES.includes(n.status)) ? 10_000 : false,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const cancel = useMutation({
    mutationFn: (notificationId: string) => cancelFlowNotification(flowId, notificationId),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: (notificationId: string) => retryFlowNotification(flowId, notificationId),
    onSuccess: refresh,
  });

  const notifications = query.data?.data ?? [];
  if (query.isLoading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-tx-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando notificações...
      </div>
    );
  }
  if (query.isError || notifications.length === 0) return null;

  const mutationError = cancel.error ?? retry.error;

  return (
    <section aria-label="Notificações desta execução" className="mt-4 grid gap-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tx-secondary">
        <BellRing className="h-3.5 w-3.5" /> Notificações desta execução
      </p>

      {mutationError && (
        <p role="alert" className="text-[11px] font-bold text-[#ef4444]">
          {getApiErrorMessage(mutationError, 'Não foi possível concluir a ação.')}
        </p>
      )}

      {notifications.map((notification) => (
        <article
          key={notification.id}
          className="grid gap-2 rounded-[8px] border border-border-default bg-bg-s2 p-3"
          data-testid={`notification-${notification.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-tx-primary">
                {channelInfo(notification.channel)?.label ?? notification.channel}
                {notification.nodeId ? ` · ${nodeLabel(notification.nodeId)}` : ''}
              </p>
              {notification.title && <p className="truncate text-[11px] text-tx-secondary">{notification.title}</p>}
            </div>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${statusTone(notification.status)}`}>
              {NOTIFICATION_STATUS_LABEL[notification.status]}
            </span>
          </div>

          <ul className="grid gap-1">
            {notification.recipients.map((recipient) => (
              <li key={recipient.id} className="text-[11px] text-tx-secondary">
                <span className="font-bold text-tx-primary">
                  {recipient.displayName ?? recipient.address ?? 'Destinatário sem endereço'}
                </span>
                {recipient.displayName && recipient.address ? ` · ${recipient.address}` : ''} —{' '}
                {RECIPIENT_STATUS_LABEL[recipient.status]}
                {recipient.attemptCount > 0 ? ` (${recipient.attemptCount} tentativa${recipient.attemptCount === 1 ? '' : 's'})` : ''}
                {recipient.lastError && recipient.status !== 'sent' && recipient.status !== 'delivered' && (
                  <span className="block text-[#dc2626]">
                    {ERROR_CATEGORY_LABEL[recipient.lastErrorCategory ?? ''] ?? 'erro'}: {recipient.lastError}
                  </span>
                )}
                {recipient.status === 'scheduled' && (
                  <span className="block text-tx-muted">
                    envio previsto: {new Date(recipient.nextAttemptAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {canManage && (canCancel(notification) || canRetry(notification)) && (
            <div className="flex flex-wrap gap-2">
              {canRetry(notification) && (
                <button
                  type="button"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(notification.id)}
                  className="rounded-[6px] border border-border-default bg-bg-surface px-2.5 py-1 text-[11px] font-bold text-tx-secondary hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  Reenviar falhas
                </button>
              )}
              {canCancel(notification) && (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(notification.id)}
                  className="rounded-[6px] border border-border-default bg-bg-surface px-2.5 py-1 text-[11px] font-bold text-tx-secondary hover:border-[#fecaca] hover:text-[#ef4444] disabled:opacity-50"
                >
                  Cancelar envio
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
