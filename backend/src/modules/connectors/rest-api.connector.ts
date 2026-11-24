import { type ConnectorPayload, ConnectorType, type IConnector } from './connector.interface';

export type RestApiConfig = {
  baseUrl: string;
  endpoint: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  authType: 'none' | 'bearer' | 'basic';
  token?: string;
  username?: string;
  password?: string;
  fieldMapping?: Record<string, string>;
};

export class RestApiConnector implements IConnector {
  readonly type = ConnectorType.REST_API;
  readonly name = 'REST API';
  readonly description = 'Envia dados mapeados para uma API REST externa.';

  async test(config: unknown): Promise<{ success: boolean; message: string }> {
    const cfg = config as RestApiConfig;
    const url = `${cfg.baseUrl}${cfg.endpoint}`;
    try {
      const response = await fetch(url, {
        method: cfg.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...this.buildAuthHeaders(cfg) },
        signal: AbortSignal.timeout(10_000),
      });
      return {
        success: response.ok,
        message: `${cfg.method ?? 'POST'} ${url} → ${response.status} ${response.statusText}`,
      };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  async send(data: ConnectorPayload, config: unknown): Promise<void> {
    const cfg = config as RestApiConfig;
    const url = `${cfg.baseUrl}${cfg.endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.buildAuthHeaders(cfg),
    };
    const body = this.buildBody(data, cfg.fieldMapping ?? {});

    const response = await fetch(url, {
      method: cfg.method ?? 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`REST API falhou: ${response.status} ${response.statusText}`);
    }
  }

  private buildAuthHeaders(cfg: RestApiConfig): Record<string, string> {
    if (cfg.authType === 'bearer' && cfg.token) {
      return { Authorization: `Bearer ${cfg.token}` };
    }
    if (cfg.authType === 'basic' && cfg.username && cfg.password) {
      const encoded = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    return {};
  }

  private buildBody(
    data: ConnectorPayload,
    mapping: Record<string, string>,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      formId: data.form.id,
      formName: data.form.name,
      submissionId: data.submission.id,
      submittedAt: data.submission.submittedAt,
      responder: data.responder,
    };
    for (const field of data.fields) {
      const key = mapping[field.code] ?? field.code;
      body[key] = field.value;
    }
    return body;
  }
}
