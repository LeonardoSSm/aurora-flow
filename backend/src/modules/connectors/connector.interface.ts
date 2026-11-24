export enum ConnectorType {
  GOOGLE_SHEETS = 'google_sheets',
  WEBHOOK = 'webhook',
  EMAIL = 'email',
  REST_API = 'rest_api',
}

export interface ConnectorPayload {
  form: { id: string; name: string };
  submission: { id: string; submittedAt: Date };
  responder: { name: string | null; email: string | null };
  fields: Array<{ code: string; label: string; value: unknown }>;
}

export interface IConnector {
  readonly type: ConnectorType;
  readonly name: string;
  readonly description: string;
  test(config: unknown): Promise<{ success: boolean; message: string }>;
  send(data: ConnectorPayload, config: unknown): Promise<void>;
}
