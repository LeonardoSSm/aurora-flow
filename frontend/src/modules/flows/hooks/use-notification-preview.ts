import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MAX_TEMPLATE_LENGTH } from '../lib/notification-config';
import { previewNotification, type NotificationPreview } from '../services/flows-api';
import type { NotificationChannel } from '../types/flow.types';

export interface NotificationPreviewInput {
  channel: NotificationChannel | undefined;
  title: string;
  content: string;
  fieldCodes: string[];
}

/**
 * Prévia da mensagem renderizada pelo backend (a MESMA renderização do envio). Espera o usuário
 * parar de digitar (500 ms) antes de consultar e só consulta com canal e conteúdo válidos.
 */
export function useNotificationPreview(input: NotificationPreviewInput, delayMs = 500) {
  const key = JSON.stringify([input.channel ?? '', input.title, input.content, input.fieldCodes]);
  const [debouncedKey, setDebouncedKey] = useState(key);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKey(key), delayMs);
    return () => clearTimeout(timer);
  }, [key, delayMs]);

  const [channel, title, content, fieldCodes] = JSON.parse(debouncedKey) as [
    NotificationChannel | '',
    string,
    string,
    string[],
  ];
  const canPreview = Boolean(channel) && content.trim().length > 0 && content.length <= MAX_TEMPLATE_LENGTH;

  const query = useQuery<NotificationPreview>({
    queryKey: ['flows', 'notification-preview', debouncedKey],
    queryFn: () =>
      previewNotification({
        channel: channel as NotificationChannel,
        title: title || undefined,
        content,
        fieldCodes,
      }),
    enabled: canPreview,
    staleTime: 30_000,
    retry: 0,
  });

  return { ...query, canPreview, isDebouncing: debouncedKey !== key };
}
