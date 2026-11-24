import { api } from '../../../services/api';

/** Notificação da caixa de entrada do usuário autenticado (GET /notifications/inbox). */
export type InboxItem = {
  id: string;
  title: string | null;
  message: string;
  /** Caminho interno que o aviso abre (a solicitação, a aprovação); nulo = só texto. */
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export type InboxPage = {
  data: InboxItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function fetchInbox(params: { page?: number; limit?: number; unreadOnly?: boolean } = {}): Promise<InboxPage> {
  const { data } = await api.get<InboxPage>('/notifications/inbox', { params });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/inbox/unread-count');
  return data.count;
}

export async function markInboxItemRead(id: string): Promise<void> {
  await api.patch(`/notifications/inbox/${id}/read`);
}

export async function markAllInboxRead(): Promise<void> {
  await api.post('/notifications/inbox/read-all');
}
