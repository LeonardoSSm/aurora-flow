import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchInbox, fetchUnreadCount, markAllInboxRead, markInboxItemRead } from '../services/inbox-api';

/** Contador do sino: atualiza a cada minuto e quando a janela volta ao foco. */
export function useUnreadCountQuery() {
  return useQuery({
    queryKey: queryKeys.inbox.unreadCount(),
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/** Últimas notificações — só consulta com o painel aberto. */
export function useInboxQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.inbox.list(),
    queryFn: () => fetchInbox({ page: 1, limit: 15 }),
    enabled,
    staleTime: 0,
  });
}

export function useInboxMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.inbox.unreadCount() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inbox.list() });
  };
  const markRead = useMutation({ mutationFn: markInboxItemRead, onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: markAllInboxRead, onSuccess: invalidate });
  return { markRead, markAllRead };
}
