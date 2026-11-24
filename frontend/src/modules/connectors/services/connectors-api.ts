import { api } from '../../../services/api';

export type ConnectorType = 'webhook' | 'rest_api';

export type ConnectorRecord = {
  id: string;
  formId: string;
  type: ConnectorType;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateConnectorInput = {
  type: ConnectorType;
  name: string;
  isActive?: boolean;
  config: Record<string, unknown>;
};

export type UpdateConnectorInput = {
  name?: string;
  isActive?: boolean;
  config?: Record<string, unknown>;
};

export type TestResult = { success: boolean; message: string };

export const connectorTypeLabel: Record<ConnectorType, string> = {
  webhook: 'Webhook',
  rest_api: 'REST API',
};

export async function fetchConnectors(formId: string): Promise<ConnectorRecord[]> {
  const { data } = await api.get<ConnectorRecord[]>(`/forms/${formId}/connectors`);
  return data;
}

export async function createConnector(
  formId: string,
  input: CreateConnectorInput,
): Promise<ConnectorRecord> {
  const { data } = await api.post<ConnectorRecord>(`/forms/${formId}/connectors`, input);
  return data;
}

export async function updateConnector(
  id: string,
  input: UpdateConnectorInput,
): Promise<ConnectorRecord> {
  const { data } = await api.patch<ConnectorRecord>(`/connectors/${id}`, input);
  return data;
}

export async function deleteConnector(id: string): Promise<void> {
  await api.delete(`/connectors/${id}`);
}

export async function testConnector(id: string): Promise<TestResult> {
  const { data } = await api.post<TestResult>(`/connectors/${id}/test`);
  return data;
}
