import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import { ErpConnectorEntity } from '../../../database/entities/erp-connector.entity';
import type { ErpRefreshCredentials } from './erp-auth.types';
import { validateInternalErpUrl } from './erp-url-guard';

@Injectable()
export class ErpTokenRefreshService {
  private readonly logger = new Logger(ErpTokenRefreshService.name);

  constructor(
    private readonly tokenCipher: TokenCipherService,
    private readonly configService: ConfigService,
  ) {}

  private getAllowedHosts(): string[] {
    return (this.configService.get<string>('ALLOWED_ERP_HOSTS', '') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
  }

  async refreshToken(connector: ErpConnectorEntity): Promise<{ token: string; expiresAt: Date | null }> {
    if (!connector.refreshCredentials) {
      throw new Error(
        `Conector "${connector.name}" não possui credenciais de renovação configuradas.`,
      );
    }

    const credentials: ErpRefreshCredentials = JSON.parse(
      this.tokenCipher.decrypt(connector.refreshCredentials),
    );

    if (connector.authType === 'oauth2_client') {
      return this.refreshViaOauth2(connector, credentials);
    }
    if (connector.authType === 'basic_login') {
      return this.refreshViaBasicLogin(connector, credentials);
    }

    throw new Error(
      `authType "${connector.authType}" não suporta renovação automática de token.`,
    );
  }

  private async refreshViaOauth2(
    connector: ErpConnectorEntity,
    credentials: ErpRefreshCredentials,
  ): Promise<{ token: string; expiresAt: Date | null }> {
    if (!credentials.tokenUrl || !credentials.clientId || !credentials.clientSecret) {
      throw new Error('OAuth2 requer tokenUrl, clientId e clientSecret nas credenciais.');
    }

    const url = this.resolveUrl(connector.baseUrl, credentials.tokenUrl);
    validateInternalErpUrl(url, this.getAllowedHosts());

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });
    if (credentials.scope) params.set('scope', credentials.scope);

    const response = await axios.post(url, params.toString(), {
      timeout: connector.timeoutMs,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`OAuth2 token endpoint retornou HTTP ${response.status}`);
    }

    const body = this.parseJsonBody(response.data, 'OAuth2 token endpoint');

    const token = (body as Record<string, unknown>)?.access_token;
    if (typeof token !== 'string' || !token) {
      throw new Error('OAuth2: access_token ausente ou inválido na resposta');
    }

    const expiresIn = (body as Record<string, unknown>)?.expires_in;
    const expiresInSec = typeof expiresIn === 'number' ? expiresIn : null;
    const MARGIN_SEC = 5 * 60;
    const expiresAt =
      expiresInSec !== null
        ? new Date(Date.now() + (expiresInSec - MARGIN_SEC) * 1000)
        : null;

    this.logger.log(
      `Token OAuth2 renovado para conector "${connector.name}"` +
        (expiresAt ? ` (expira em ${expiresAt.toISOString()})` : ''),
    );

    return { token, expiresAt };
  }

  private async refreshViaBasicLogin(
    connector: ErpConnectorEntity,
    credentials: ErpRefreshCredentials,
  ): Promise<{ token: string; expiresAt: Date | null }> {
    if (!credentials.loginUrl || !credentials.username || !credentials.password) {
      throw new Error('basic_login requer loginUrl, username e password nas credenciais.');
    }

    const url = this.resolveUrl(connector.baseUrl, credentials.loginUrl);
    validateInternalErpUrl(url, this.getAllowedHosts());

    const response = await axios.post(
      url,
      { username: credentials.username, password: credentials.password },
      { timeout: connector.timeoutMs, validateStatus: () => true },
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Login endpoint retornou HTTP ${response.status}`);
    }

    const body = this.parseJsonBody(response.data, 'Login endpoint');

    const path = credentials.tokenJsonPath ?? 'access_token';
    const token = this.extractByPath(body, path);
    if (!token) {
      throw new Error(`basic_login: token não encontrado no caminho "${path}"`);
    }

    this.logger.log(`Token basic_login renovado para conector "${connector.name}"`);

    return { token, expiresAt: null };
  }

  private parseJsonBody(data: unknown, context: string): unknown {
    if (typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch {
      const preview = data.slice(0, 200);
      throw new Error(
        `${context} não retornou um JSON válido. Resposta recebida: "${preview}${data.length > 200 ? '...' : ''}"`,
      );
    }
  }

  private resolveUrl(baseUrl: string, path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  extractByPath(obj: unknown, path: string): string | null {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return null;
      current = (current as Record<string, unknown>)[part];
    }
    if (current == null) return null;
    return typeof current === 'string' ? current : String(current);
  }
}
