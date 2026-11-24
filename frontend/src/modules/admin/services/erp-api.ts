import { api } from '../../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErpAuthType = 'bearer_static' | 'oauth2_client' | 'basic_login';

export type ErpRefreshCredentials = {
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scope?: string;
  username?: string;
  password?: string;
  loginUrl?: string;
  tokenJsonPath?: string;
};

export type ErpHealthResult = {
  connectorId: string;
  connectorName: string;
  reachable: boolean;
  authValid: boolean | null;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: string;
  error?: string;
};

export type ErpConnector = {
  id: string;
  name: string;
  baseUrl: string;
  authType: ErpAuthType;
  bearerToken: '***';
  refreshCredentials: '***' | null;
  tokenExpiresAt: string | null;
  defaultHeaders: Record<string, string> | null;
  timeoutMs: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastHealthCheck: ErpHealthResult | null;
  lastHealthCheckedAt: string | null;
};

export type CreateErpConnectorDto = {
  name: string;
  baseUrl: string;
  authType?: ErpAuthType;
  bearerToken?: string;
  refreshCredentials?: ErpRefreshCredentials;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
};

export type UpdateErpConnectorDto = {
  name?: string;
  baseUrl?: string;
  authType?: ErpAuthType;
  bearerToken?: string;
  refreshCredentials?: ErpRefreshCredentials;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
};

export type ErpTemplate = {
  id: string;
  connectorId: string;
  name: string;
  description: string | null;
  method: string;
  endpointPath: string;
  bodyTemplate: string | null;
  successStatusCodes: number[];
  saveResponseField: string | null;
  isActive: boolean;
  createdAt: string;
};

export type CreateErpTemplateDto = {
  name: string;
  description?: string;
  method: string;
  endpointPath: string;
  bodyTemplate?: string;
  successStatusCodes?: number[];
  saveResponseField?: string;
};

export type UpdateErpTemplateDto = Partial<CreateErpTemplateDto>;

export type ErpLog = {
  id: string;
  connectorId: string;
  templateId: string | null;
  solicitationId: string | null;
  flowExecutionId: string | null;
  status: 'pending' | 'success' | 'retrying' | 'failed';
  requestUrl: string;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type ErpLogsPage = {
  data: ErpLog[];
  total: number;
  page: number;
  limit: number;
};

export type FetchErpLogsParams = {
  page?: number;
  limit?: number;
  status?: string;
  connectorId?: string;
};

export type TestConnectionResult = {
  reachable: boolean;
  authValid: boolean | null;
  statusCode?: number;
  durationMs: number;
};

// ─── Connectors ───────────────────────────────────────────────────────────────

export async function fetchErpConnectors(): Promise<ErpConnector[]> {
  const { data } = await api.get<ErpConnector[]>('/admin/erp/connectors');
  return data;
}

export async function createErpConnector(dto: CreateErpConnectorDto): Promise<ErpConnector> {
  const { data } = await api.post<ErpConnector>('/admin/erp/connectors', dto);
  return data;
}

export async function updateErpConnector(
  id: string,
  dto: UpdateErpConnectorDto,
): Promise<ErpConnector> {
  const { data } = await api.patch<ErpConnector>(`/admin/erp/connectors/${id}`, dto);
  return data;
}

export async function deactivateErpConnector(id: string): Promise<void> {
  await api.patch(`/admin/erp/connectors/${id}/deactivate`);
}

export async function deleteErpConnector(id: string, force = false): Promise<void> {
  await api.delete(`/admin/erp/connectors/${id}${force ? '?force=true' : ''}`);
}

export async function testErpConnector(id: string): Promise<TestConnectionResult> {
  const { data } = await api.post<TestConnectionResult>(
    `/admin/erp/connectors/${id}/test`,
    {},
    { timeout: 10000 },
  );
  return data;
}

export async function fetchErpHealth(): Promise<ErpHealthResult[]> {
  const { data } = await api.get<ErpHealthResult[]>('/admin/erp/health');
  return data;
}

export async function checkConnectorHealth(id: string): Promise<ErpHealthResult> {
  const { data } = await api.get<ErpHealthResult>(`/admin/erp/connectors/${id}/health`, {
    timeout: 10000,
  });
  return data;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function fetchErpTemplates(connectorId: string): Promise<ErpTemplate[]> {
  const { data } = await api.get<ErpTemplate[]>(`/admin/erp/connectors/${connectorId}/templates`);
  return data;
}

export async function createErpTemplate(
  connectorId: string,
  dto: CreateErpTemplateDto,
): Promise<ErpTemplate> {
  const { data } = await api.post<ErpTemplate>(
    `/admin/erp/connectors/${connectorId}/templates`,
    dto,
  );
  return data;
}

export async function updateErpTemplate(
  id: string,
  dto: UpdateErpTemplateDto,
): Promise<ErpTemplate> {
  const { data } = await api.patch<ErpTemplate>(`/admin/erp/templates/${id}`, dto);
  return data;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function fetchErpLogs(params?: FetchErpLogsParams): Promise<ErpLogsPage> {
  const { data } = await api.get<ErpLogsPage>('/admin/erp/logs', { params });
  return data;
}

export async function retryErpLog(id: string): Promise<void> {
  await api.post(`/admin/erp/logs/${id}/retry`);
}
