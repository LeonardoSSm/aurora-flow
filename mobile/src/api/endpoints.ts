import axios from 'axios';
import { API_BASE_URL } from '../config/environment';
import type { ItemListDetail } from '../domain/item-order';
import client from './client';
import type {
  Approval,
  Attachment,
  AuthSession,
  Comment,
  FormDetail,
  FormListItem,
  HandoffLinks,
  HistoryEvent,
  InboxPage,
  KanbanBoard,
  KanbanDefaultStage,
  KanbanFormSummary,
  KanbanPhase,
  LocalFile,
  MyPendingStep,
  PhaseFieldValue,
  PhaseTimelineEntry,
  PublicForm,
  ResponseRecord,
  SavePhaseFieldValueInput,
  Solicitation,
  SolicitationPriority,
  SolicitationsPage,
  SubmitItem,
  UploadLabel,
  UserSummary,
} from './types';

/*
 * Todas as chamadas do app num arquivo: o caminho e o formato de cada uma ficam fáceis de conferir
 * com o web (frontend/src/modules/**\/services) e com o backend.
 */

// ── Sessão ───────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthSession> {
  const { data } = await client.post<AuthSession>('/auth/login', { email, password });
  return data;
}

/** Troca o refresh token por uma sessão nova (tokens + permissões atualizadas). */
export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const { data } = await axios.post<AuthSession>(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 15_000 });
  return data;
}

/** Encerra a sessão no servidor (revoga o refresh token deste aparelho). Falhar não impede sair. */
export async function logoutSession(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return;
  await client.post('/auth/logout', { refreshToken }, { timeout: 8_000 }).catch(() => undefined);
}

// ── Solicitações ─────────────────────────────────────────────────────────────

export type SolicitationsQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  priority?: SolicitationPriority;
  assigneeId?: string;
  formId?: string;
};

export async function fetchSolicitations(params: SolicitationsQuery = {}): Promise<SolicitationsPage> {
  const { data } = await client.get<SolicitationsPage>('/solicitations', { params });
  return data;
}

export async function fetchSolicitation(id: string): Promise<Solicitation> {
  const { data } = await client.get<Solicitation>(`/solicitations/${id}`);
  return data;
}

export async function fetchHistory(id: string): Promise<HistoryEvent[]> {
  const { data } = await client.get<HistoryEvent[]>(`/solicitations/${id}/history`);
  return data;
}

export async function fetchPhaseTimeline(id: string): Promise<PhaseTimelineEntry[]> {
  const { data } = await client.get<PhaseTimelineEntry[]>(`/solicitations/${id}/phase-timeline`);
  return data;
}

export async function fetchHandoffs(id: string): Promise<HandoffLinks> {
  const { data } = await client.get<HandoffLinks>(`/solicitations/${id}/handoffs`);
  return data;
}

export async function fetchSolicitationApprovals(id: string): Promise<Approval[]> {
  const { data } = await client.get<Approval[]>(`/solicitations/${id}/approvals`);
  return data;
}

export async function updateAssignee(id: string, assigneeId: string | null): Promise<Solicitation> {
  const { data } = await client.patch<Solicitation>(`/solicitations/${id}/assignee`, { assigneeId });
  return data;
}

export async function updatePriority(id: string, priority: SolicitationPriority): Promise<Solicitation> {
  const { data } = await client.patch<Solicitation>(`/solicitations/${id}/priority`, { priority });
  return data;
}

export async function fetchAssignableUsers(assignableAs = 'solicitations.manage'): Promise<UserSummary[]> {
  const { data } = await client.get<UserSummary[]>('/users/assignable', { params: { assignableAs } });
  return data;
}

// Comentários

export async function fetchComments(id: string): Promise<Comment[]> {
  const { data } = await client.get<Comment[]>(`/solicitations/${id}/comments`);
  return data;
}

export async function addComment(id: string, content: string, isInternal = false): Promise<Comment> {
  const { data } = await client.post<Comment>(`/solicitations/${id}/comments`, { content, isInternal });
  return data;
}

// Anexos

export async function fetchAttachments(id: string): Promise<Attachment[]> {
  const { data } = await client.get<Attachment[]>(`/solicitations/${id}/attachments`);
  return data;
}

function fileForm(file: LocalFile, label?: UploadLabel, extra?: Record<string, string>): FormData {
  const form = new FormData();
  form.append('file', { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);
  if (label?.name) form.append('name', label.name);
  if (label?.description) form.append('description', label.description);
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  return form;
}

/** Anexo do card; com `phaseId`, fica ligado à fase (campo de arquivo da fase, foto de validação). */
export async function uploadAttachment(
  id: string,
  file: LocalFile,
  label?: UploadLabel,
  phaseId?: string,
): Promise<Attachment> {
  const { data } = await client.post<Attachment>(
    `/solicitations/${id}/attachments`,
    fileForm(file, label, phaseId ? { phaseId } : undefined),
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 },
  );
  return data;
}

export async function updateAttachment(attachmentId: string, patch: UploadLabel): Promise<Attachment> {
  const { data } = await client.patch<Attachment>(`/attachments/${attachmentId}`, patch);
  return data;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await client.delete(`/attachments/${attachmentId}`);
}

export function attachmentDownloadPath(attachmentId: string): string {
  return `/attachments/${attachmentId}/download`;
}

// ── Kanban e fases ───────────────────────────────────────────────────────────

export async function fetchKanbanSummary(): Promise<KanbanFormSummary[]> {
  const { data } = await client.get<KanbanFormSummary[]>('/solicitations/kanban/summary');
  return data;
}

/** `formId` de um processo, ou 'unassigned' para o quadro "Sem processo". */
export async function fetchKanbanBoard(formId: string): Promise<KanbanBoard> {
  const { data } = await client.get<KanbanBoard>('/solicitations/kanban/board', { params: { formId } });
  return data;
}

export async function fetchKanbanPhases(formId: string): Promise<KanbanPhase[]> {
  const { data } = await client.get<KanbanPhase[]>(`/forms/${formId}/kanban-phases`);
  return data;
}

export async function movePhase(id: string, phaseId: string): Promise<Solicitation> {
  const { data } = await client.patch<Solicitation>(`/solicitations/${id}/move-phase`, { phaseId });
  return data;
}

export async function moveStage(id: string, stage: KanbanDefaultStage): Promise<Solicitation> {
  const { data } = await client.patch<Solicitation>(`/solicitations/${id}/move-stage`, { stage });
  return data;
}

export async function fetchPhaseFieldValues(id: string): Promise<PhaseFieldValue[]> {
  const { data } = await client.get<PhaseFieldValue[]>(`/solicitations/${id}/phase-fields`);
  return data;
}

export async function savePhaseFieldValues(id: string, items: SavePhaseFieldValueInput[]): Promise<PhaseFieldValue[]> {
  const { data } = await client.patch<PhaseFieldValue[]>(`/solicitations/${id}/phase-fields`, { items });
  return data;
}

/** Pede a aprovação da fase atual (vai para quem aprova a fase). */
export async function requestPhaseApproval(id: string): Promise<Approval> {
  const { data } = await client.post<Approval>(`/solicitations/${id}/phase-approvals`);
  return data;
}

// ── Aprovações ───────────────────────────────────────────────────────────────

export async function fetchMyPendingApprovals(): Promise<MyPendingStep[]> {
  const { data } = await client.get<MyPendingStep[]>('/approvals/my-pending');
  return data;
}

export async function fetchApproval(approvalId: string): Promise<Approval> {
  const { data } = await client.get<Approval>(`/approvals/${approvalId}`);
  return data;
}

export async function decideApprovalStep(
  stepId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<void> {
  await client.post(`/approvals/${stepId}/decide`, { decision, comment: comment?.trim() || undefined });
}

// ── Formulários e respostas ──────────────────────────────────────────────────

export async function fetchPublishedForms(search?: string): Promise<FormListItem[]> {
  const params: Record<string, string> = { status: 'published', limit: '100' };
  if (search) params.search = search;
  const { data } = await client.get<{ data: FormListItem[] }>('/forms', { params });
  return data.data;
}

export async function fetchPublicForm(formId: string): Promise<PublicForm> {
  const { data } = await client.get<PublicForm>(`/public/forms/${formId}`);
  return data;
}

export async function fetchFormDetail(formId: string): Promise<FormDetail> {
  const { data } = await client.get<FormDetail>(`/forms/${formId}`);
  return data;
}

export async function submitForm(input: {
  formId: string;
  formVersionId: string;
  responderName?: string;
  responderEmail?: string;
  idempotencyKey?: string;
  items: SubmitItem[];
}): Promise<{ id: string }> {
  const { data } = await client.post<{ id: string }>('/responses/submit', input, { timeout: 60_000 });
  return data;
}

/** Arquivo do formulário sobe depois do envio, já ligado à resposta (como no web). */
export async function uploadSubmissionAttachment(submissionId: string, file: LocalFile, label?: UploadLabel): Promise<void> {
  await client.post(`/public/submissions/${submissionId}/attachments`, fileForm(file, label), {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
}

export async function fetchResponse(id: string): Promise<ResponseRecord> {
  const { data } = await client.get<ResponseRecord>(`/responses/${id}`);
  return data;
}

/** "Arquivo para baixar" do formulário (público, sem login). */
export function formDownloadPath(path: string): string {
  return `/public/form-downloads/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Lista de itens (campo "Pedido de itens" de fase, que não vem com os itens). */
export async function fetchItemList(id: string): Promise<ItemListDetail> {
  const { data } = await client.get<ItemListDetail>(`/item-lists/${id}`);
  return data;
}

// ── Avisos ───────────────────────────────────────────────────────────────────

export async function fetchInbox(params: { page?: number; limit?: number; unreadOnly?: boolean } = {}): Promise<InboxPage> {
  const { data } = await client.get<InboxPage>('/notifications/inbox', { params });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await client.get<{ count: number }>('/notifications/inbox/unread-count');
  return data.count;
}

export async function markInboxRead(id: string): Promise<void> {
  await client.patch(`/notifications/inbox/${id}/read`);
}

export async function markAllInboxRead(): Promise<void> {
  await client.post('/notifications/inbox/read-all');
}

// ── Push ─────────────────────────────────────────────────────────────────────

export async function registerPushToken(dto: { token: string; platform: 'ios' | 'android'; deviceId?: string }): Promise<void> {
  await client.post('/notifications/push-token', dto);
}
