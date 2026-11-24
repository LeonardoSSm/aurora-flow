import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useToast } from '../../components/ui';
import { queryKeys } from '../../lib/query-keys';
import { startRealtime, type RealtimeEvent } from './realtime-client';
import { bumpTabAlert, clearTabAlert, isTabAttended } from './tab-alert';

/** O que muda quando solicitações, fases ou aprovações mudam: Resumo, Kanban e aprovações. */
const LIVE_QUERY_KEYS = [
  queryKeys.dashboard.panel(),
  ['solicitations', 'kanban'],
  queryKeys.approvals.myPending(),
] as const;

/**
 * Liga o app ao tempo real enquanto há sessão: as telas abertas se atualizam sozinhas e uma
 * solicitação nova avisa na aba (título e ícone) — ou num toast, se a pessoa está olhando.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    const refresh = () => {
      for (const queryKey of LIVE_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey });
    };

    const onEvent = (event: RealtimeEvent) => {
      // A criação também chega como "solicitations.changed": a atualização vem por ele.
      if (event.type === 'solicitations.changed') {
        refresh();
        return;
      }
      const { title, formName } = event.solicitation;
      if (isTabAttended()) {
        showToastRef.current({
          title: 'Nova solicitação',
          description: formName ? `${title} · ${formName}` : title,
          variant: 'info',
        });
      } else {
        bumpTabAlert();
      }
    };

    const stop = startRealtime({ onEvent, onOpen: refresh });

    const onAttention = () => {
      if (isTabAttended()) clearTabAlert();
    };
    document.addEventListener('visibilitychange', onAttention);
    window.addEventListener('focus', onAttention);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onAttention);
      window.removeEventListener('focus', onAttention);
      clearTabAlert();
    };
  }, [queryClient]);
}
