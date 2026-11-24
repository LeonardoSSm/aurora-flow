import { api } from '../../../services/api';

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';
export type InboundWebhookEventStatus = 'received' | 'processed' | 'failed' | 'ignored';
export type WhatsAppMessageStatus = 'sent' | 'failed' | 'queued' | 'pending';

export type WebhookEndpoint = {
  id: string;
  name: string;
  token: string;
  isActive: boolean;
  description: string | null;
  flowTriggerEnabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  signingSecretConfigured: boolean;
};

export type CreateWebhookEndpointInput = {
  name: string;
  description?: string;
  signingSecret?: string;
  flowTriggerEnabled?: boolean;
};

export type WebhookDelivery = {
  id: string;
  connectorId: string | null;
  flowExecutionId: string | null;
  url: string;
  method: string;
  requestHeaders: Record<string, unknown> | null;
  requestBody: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  errorMessage: string | null;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
};

export type InboundWebhookEvent = {
  id: string;
  endpointToken: string;
  sourceIdentifier: string | null;
  headers: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  rawBody: string | null;
  signatureValid: boolean | null;
  status: InboundWebhookEventStatus;
  processedAt: string | null;
  errorMessage: string | null;
  flowExecutionId: string | null;
  createdAt: string;
};

export type WhatsAppMessage = {
  id: string;
  solicitationId: string | null;
  flowExecutionId: string | null;
  to: string;
  message: string;
  provider: string;
  externalMessageId: string | null;
  status: WhatsAppMessageStatus;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type WhatsAppStatus = {
  provider: string;
  isAvailable: boolean;
  totalSent: number;
  totalFailed: number;
};

export type PaginatedWebhookResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FetchWebhookDeliveriesParams = {
  page?: number;
  limit?: number;
  status?: WebhookDeliveryStatus | '';
};

export type FetchInboundWebhookEventsParams = {
  page?: number;
  limit?: number;
  status?: InboundWebhookEventStatus | '';
};

export type FetchWhatsAppMessagesParams = {
  page?: number;
  limit?: number;
  status?: WhatsAppMessageStatus | '';
  solicitationId?: string;
};

export async function fetchWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  const { data } = await api.get<WebhookEndpoint[]>('/webhooks/endpoints');
  return data;
}

export async function createWebhookEndpoint(
  dto: CreateWebhookEndpointInput,
): Promise<WebhookEndpoint> {
  const { data } = await api.post<WebhookEndpoint>('/webhooks/endpoints', dto);
  return data;
}

export async function deleteWebhookEndpoint(id: string): Promise<void> {
  await api.delete(`/webhooks/endpoints/${id}`);
}

export async function fetchWebhookDeliveries(
  params?: FetchWebhookDeliveriesParams,
): Promise<PaginatedWebhookResponse<WebhookDelivery>> {
  const { data } = await api.get<PaginatedWebhookResponse<WebhookDelivery>>(
    '/webhooks/deliveries',
    { params },
  );
  return data;
}

export async function retryWebhookDelivery(id: string): Promise<WebhookDelivery> {
  const { data } = await api.post<WebhookDelivery>(`/webhooks/deliveries/${id}/retry`);
  return data;
}

export async function fetchInboundWebhookEvents(
  params?: FetchInboundWebhookEventsParams,
): Promise<PaginatedWebhookResponse<InboundWebhookEvent>> {
  const { data } = await api.get<PaginatedWebhookResponse<InboundWebhookEvent>>(
    '/webhooks/events',
    { params },
  );
  return data;
}

export async function fetchWhatsAppMessages(
  params?: FetchWhatsAppMessagesParams,
): Promise<PaginatedWebhookResponse<WhatsAppMessage>> {
  const { solicitationId, ...apiParams } = params ?? {};
  const { data } = await api.get<PaginatedWebhookResponse<WhatsAppMessage>>(
    '/integrations/whatsapp/messages',
    { params: apiParams },
  );

  if (!solicitationId) return data;

  const filtered = data.data.filter((message) => message.solicitationId === solicitationId);
  return {
    ...data,
    data: filtered,
    total: filtered.length,
    totalPages: filtered.length > 0 ? 1 : 0,
  };
}

export async function fetchWhatsAppStatus(): Promise<WhatsAppStatus> {
  const { data } = await api.get<WhatsAppStatus>('/integrations/whatsapp/status');
  return data;
}
