import axios from 'axios';
import { api } from '../../services/api';

/** Imagem enviada para os e-mails do sistema (ex.: arte de fundo do aviso de pontuação). */
export type EmailImage = { id: string; name: string; mimeType: string; sizeBytes: number; createdAt: string };

/** Mesmo teto do backend: o e-mail carrega a arte inteira. */
export const EMAIL_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/** Configuração da arte geral do aviso (Administração → Configurações → E-mails). */
export const SCORE_ALERT_BACKGROUND_SETTING = 'email.score_alert_background';

export async function uploadEmailImage(file: File): Promise<EmailImage> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<EmailImage>('/email-images', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Arte geral escolhida na Administração (id), ou null = arte padrão. */
export async function fetchScoreAlertBackground(): Promise<string | null> {
  const { data } = await api.get<{ imageId: string | null }>('/email-images/score-alert-background');
  return data.imageId;
}

/** Bytes da imagem (rota autenticada — não dá para usar direto num <img src>). `null` = arte padrão. */
export async function fetchEmailImageBlob(id: string | null): Promise<Blob> {
  const path = id ? `/email-images/${id}` : '/email-images/score-alert-background/default';
  const { data } = await api.get<Blob>(path, { responseType: 'blob' });
  return data;
}

/** Mensagem do backend (ex.: "A imagem passa de 3 MB…"), ou uma genérica. */
export function emailImageErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (error.response?.status === 403) return 'Você não tem permissão para enviar imagens.';
  }
  return 'Não foi possível enviar a imagem. Tente de novo.';
}
