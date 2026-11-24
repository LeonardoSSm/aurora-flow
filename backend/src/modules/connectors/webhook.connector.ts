import { type ConnectorPayload, ConnectorType, type IConnector } from './connector.interface';

export type WebhookConfig = {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  bodyTemplate?: string;
};

export class WebhookConnector implements IConnector {
  readonly type = ConnectorType.WEBHOOK;
  readonly name = 'Webhook';
  readonly description = 'Envia dados da submissão para uma URL via HTTP.';

  async test(config: unknown): Promise<{ success: boolean; message: string }> {
    const cfg = config as WebhookConfig;
    try {
      const response = await fetch(cfg.url, {
        method: cfg.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
        body: JSON.stringify({ test: true }),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        success: response.ok,
        message: `${cfg.method ?? 'POST'} ${cfg.url} → ${response.status} ${response.statusText}`,
      };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  async send(data: ConnectorPayload, config: unknown): Promise<void> {
    const cfg = config as WebhookConfig;
    const method = cfg.method ?? 'POST';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(cfg.headers ?? {}),
    };
    const body = cfg.bodyTemplate ? this.interpolate(cfg.bodyTemplate, data) : JSON.stringify(data);

    const response = await fetch(cfg.url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Webhook falhou: ${response.status} ${response.statusText}`);
    }
  }

  private interpolate(template: string, data: ConnectorPayload): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_match, path: string) => {
      const parts = path.split('.');
      let value: unknown = data;
      for (const part of parts) {
        value = (value as Record<string, unknown>)?.[part];
        if (value === undefined) break;
      }
      return value != null ? String(value) : '';
    });
  }
}
