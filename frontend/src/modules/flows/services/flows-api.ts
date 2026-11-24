import { api } from '../../../services/api';
import type {
  CreateFlowDto,
  NotificationChannel,
  Flow,
  FlowExecutionPage,
  FlowPage,
  FlowsQuery,
  NodeTestResult,
  RunFlowTestDto,
  UpdateFlowDto,
} from '../types/flow.types';

export async function fetchFlows(formId: string): Promise<Flow[]> {
  const { data } = await api.get<Flow[]>(`/forms/${formId}/flows`);
  return data;
}

export async function fetchAllFlows(query: FlowsQuery = {}): Promise<FlowPage> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.excludeId) params.set('excludeId', query.excludeId);
  const qs = params.toString();
  const { data } = await api.get<FlowPage>(`/flows${qs ? `?${qs}` : ''}`);
  return data;
}

export async function fetchFlow(id: string): Promise<Flow> {
  const { data } = await api.get<Flow>(`/flows/${id}`);
  return data;
}

export async function createFlow(dto: CreateFlowDto): Promise<Flow> {
  const { data } = await api.post<Flow>('/flows', dto);
  return data;
}

export async function createFlowForForm(formId: string, dto: CreateFlowDto): Promise<Flow> {
  const { data } = await api.post<Flow>(`/forms/${formId}/flows`, dto);
  return data;
}

export async function updateFlow(id: string, dto: UpdateFlowDto): Promise<Flow> {
  const { data } = await api.patch<Flow>(`/flows/${id}`, dto);
  return data;
}

export async function deleteFlow(id: string): Promise<void> {
  await api.delete(`/flows/${id}`);
}

export async function toggleFlowActive(id: string): Promise<Flow> {
  const { data } = await api.patch<Flow>(`/flows/${id}/active`);
  return data;
}

export async function fetchFlowExecutions(
  id: string,
  page = 1,
  limit = 20,
): Promise<FlowExecutionPage> {
  const { data } = await api.get<FlowExecutionPage>(
    `/flows/${id}/executions?page=${page}&limit=${limit}`,
  );
  return data;
}

export async function runFlowTest(id: string, dto: RunFlowTestDto = {}): Promise<NodeTestResult[]> {
  const { data } = await api.post<NodeTestResult[]>(`/flows/${id}/test`, dto);
  return data;
}

/** Agente da LOPS IA disponível para o nó "LOPS IA" (lista vinda do servidor — a chave nunca chega ao navegador). */
export type LopsAiAgent = {
  slug: string;
  name: string;
  model: string | null;
  visionModel: string | null;
  source: string | null;
};

export async function fetchLopsAiAgents(): Promise<LopsAiAgent[]> {
  const { data } = await api.get<{ agents: LopsAiAgent[] }>('/integrations/lops-ai/agents');
  return data.agents;
}

// ── Notificações do fluxo (nó "Notificação") ────────────────────────────

export type NotificationPreview = {
  title: string | null;
  body: string;
  usedVariables: string[];
  /** Variáveis que o modelo usa mas o editor não conhece (renderizariam vazio). */
  missingVariables: string[];
  malformed: boolean;
  truncated: boolean;
  limits: { titleMax: number; bodyMax: number };
};

export async function previewNotification(input: {
  channel: NotificationChannel;
  title?: string;
  content: string;
  fieldCodes?: string[];
}): Promise<NotificationPreview> {
  const { data } = await api.post<NotificationPreview>('/flows/notifications/preview', input);
  return data;
}

export type FlowNotificationRecipient = {
  id: string;
  source: string;
  displayName: string | null;
  /** Mascarado para quem só pode ver o fluxo (flows.view); completo com flows.manage. */
  address: string | null;
  status: 'scheduled' | 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  attemptCount: number;
  provider: string | null;
  lastErrorCategory: string | null;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
};

export type FlowNotification = {
  id: string;
  channel: NotificationChannel;
  status:
    | 'scheduled'
    | 'pending'
    | 'processing'
    | 'sent'
    | 'delivered'
    | 'partially_sent'
    | 'failed'
    | 'cancelled';
  nodeId: string | null;
  flowExecutionId: string | null;
  /** Conteúdo só com flows.manage. */
  title: string | null;
  body: string | null;
  scheduledFor: string | null;
  createdAt: string;
  recipients: FlowNotificationRecipient[];
};

export async function fetchFlowNotifications(
  flowId: string,
  executionId?: string,
): Promise<{ data: FlowNotification[]; total: number }> {
  const { data } = await api.get<{ data: FlowNotification[]; total: number }>(
    `/flows/${flowId}/notifications`,
    { params: { ...(executionId ? { executionId } : {}), limit: 50 } },
  );
  return data;
}

export async function cancelFlowNotification(flowId: string, notificationId: string): Promise<void> {
  await api.post(`/flows/${flowId}/notifications/${notificationId}/cancel`);
}

export async function retryFlowNotification(flowId: string, notificationId: string): Promise<void> {
  await api.post(`/flows/${flowId}/notifications/${notificationId}/retry`);
}

export type WhatsAppGroup = { id: string; subject: string; size: number | null };

/** Grupos da instância de WhatsApp (`isAvailable: false` = sem provedor configurado no servidor). */
export async function fetchWhatsAppGroups(): Promise<{ isAvailable: boolean; groups: WhatsAppGroup[] }> {
  const { data } = await api.get<{ isAvailable: boolean; groups: WhatsAppGroup[] }>(
    '/integrations/whatsapp/groups',
  );
  return data;
}
