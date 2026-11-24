import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import type { ErpConnectorEntity } from '../../../database/entities/erp-connector.entity';
import { ErpTokenRefreshService } from './erp-token-refresh.service';

// ─── Axios mock ───────────────────────────────────────────────────────────────
const mockAxios = { post: jest.fn(), isAxiosError: jest.fn() };
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...a: unknown[]) => mockAxios.post(...a),
    isAxiosError: (...a: unknown[]) => mockAxios.isAxiosError(...a),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
const makeConnector = (overrides: Partial<ErpConnectorEntity> = {}): ErpConnectorEntity =>
  ({
    id: 'conn-1',
    name: 'Test ERP',
    baseUrl: 'http://192.168.1.10:8080',
    bearerToken: 'v1.enc.old',
    authType: 'oauth2_client',
    refreshCredentials: 'v1.enc.creds',
    tokenExpiresAt: null,
    defaultHeaders: null,
    timeoutMs: 15000,
    isActive: true,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ErpConnectorEntity);

const PLAIN_OAUTH2_CREDS = JSON.stringify({
  clientId: 'my-client',
  clientSecret: 'my-secret',
  tokenUrl: '/oauth2/token',
  scope: 'api:read',
});

const PLAIN_BASIC_CREDS = JSON.stringify({
  username: 'erp-user',
  password: 'erp-pass',
  loginUrl: '/api/login',
  tokenJsonPath: 'data.token',
});

describe('ErpTokenRefreshService', () => {
  let service: ErpTokenRefreshService;
  const tokenCipher = { encrypt: jest.fn(), decrypt: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue('') };

  beforeEach(async () => {
    jest.clearAllMocks();
    configService.get.mockReturnValue('');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErpTokenRefreshService,
        { provide: TokenCipherService, useValue: tokenCipher },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(ErpTokenRefreshService);
  });

  // ─── OAuth2 Client Credentials ───────────────────────────────────────────

  describe('refreshToken — oauth2_client', () => {
    beforeEach(() => {
      tokenCipher.decrypt.mockReturnValue(PLAIN_OAUTH2_CREDS);
    });

    it('posts URLSearchParams with client_credentials grant', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'new-token', expires_in: 3600 }),
      });

      await service.refreshToken(makeConnector());

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8080/oauth2/token',
        expect.stringContaining('grant_type=client_credentials'),
        expect.objectContaining({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
      );
    });

    it("uses the connector's configured timeoutMs instead of a hardcoded value", async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'tok' }),
      });

      await service.refreshToken(makeConnector({ timeoutMs: 45000 }));

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ timeout: 45000 }),
      );

      const body = new URLSearchParams(mockAxios.post.mock.calls[0][1] as string);
      expect(body.get('client_id')).toBe('my-client');
      expect(body.get('client_secret')).toBe('my-secret');
      expect(body.get('scope')).toBe('api:read');
    });

    it('returns token and expiresAt with 5-minute margin', async () => {
      const before = Date.now();
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'tok-xyz', expires_in: 3600 }),
      });

      const { token, expiresAt } = await service.refreshToken(makeConnector());

      expect(token).toBe('tok-xyz');
      expect(expiresAt).not.toBeNull();
      // should be ≈ now + (3600 - 300) * 1000
      expect(expiresAt?.getTime()).toBeGreaterThan(before + 3000 * 1000);
      expect(expiresAt?.getTime()).toBeLessThan(before + 3310 * 1000);
    });

    it('returns expiresAt=null when expires_in is absent', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'tok-xyz' }),
      });

      const { expiresAt } = await service.refreshToken(makeConnector());
      expect(expiresAt).toBeNull();
    });

    it('resolves tokenUrl relative to baseUrl', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'tok' }),
      });

      await service.refreshToken(makeConnector({ baseUrl: 'http://erp-interno:8080' }));

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://erp-interno:8080/oauth2/token',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('supports absolute tokenUrl without prepending baseUrl', async () => {
      tokenCipher.decrypt.mockReturnValue(
        JSON.stringify({ clientId: 'c', clientSecret: 's', tokenUrl: 'http://auth-server/token' }),
      );
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'tok' }),
      });

      await service.refreshToken(makeConnector());

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://auth-server/token',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('throws when token endpoint returns non-2xx', async () => {
      mockAxios.post.mockResolvedValue({ status: 401, data: 'Unauthorized' });

      await expect(service.refreshToken(makeConnector())).rejects.toThrow('HTTP 401');
    });

    it('throws when access_token is missing from response', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ token_type: 'Bearer' }),
      });

      await expect(service.refreshToken(makeConnector())).rejects.toThrow('access_token');
    });

    it('throws when refreshCredentials is null', async () => {
      await expect(
        service.refreshToken(makeConnector({ refreshCredentials: null })),
      ).rejects.toThrow('credenciais de renovação');
    });

    it('rejects a tokenUrl pointing to a public host, never posting the client secret to it', async () => {
      tokenCipher.decrypt.mockReturnValue(
        JSON.stringify({
          clientId: 'my-client',
          clientSecret: 'my-secret',
          tokenUrl: 'https://attacker.example.com/steal',
        }),
      );

      await expect(service.refreshToken(makeConnector())).rejects.toThrow('domínio público');
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('gives a clear error when the token endpoint returns non-JSON (e.g. an HTML error page)', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: '<html><body>502 Bad Gateway</body></html>',
      });

      await expect(service.refreshToken(makeConnector())).rejects.toThrow(
        'OAuth2 token endpoint não retornou um JSON válido',
      );
    });

    it('allows a tokenUrl host listed in ALLOWED_ERP_HOSTS', async () => {
      configService.get.mockReturnValue('sso.parceiro.com');
      tokenCipher.decrypt.mockReturnValue(
        JSON.stringify({
          clientId: 'my-client',
          clientSecret: 'my-secret',
          tokenUrl: 'https://sso.parceiro.com/oauth2/token',
        }),
      );
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'tok' }),
      });

      await expect(service.refreshToken(makeConnector())).resolves.toMatchObject({ token: 'tok' });
    });
  });

  // ─── Basic Login ─────────────────────────────────────────────────────────

  describe('refreshToken — basic_login', () => {
    beforeEach(() => {
      tokenCipher.decrypt.mockReturnValue(PLAIN_BASIC_CREDS);
    });

    it('posts username+password to loginUrl', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ data: { token: 'login-token' } }),
      });

      await service.refreshToken(makeConnector({ authType: 'basic_login' }));

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8080/api/login',
        { username: 'erp-user', password: 'erp-pass' },
        expect.any(Object),
      );
    });

    it("uses the connector's configured timeoutMs instead of a hardcoded value", async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ data: { token: 'login-token' } }),
      });

      await service.refreshToken(makeConnector({ authType: 'basic_login', timeoutMs: 20000 }));

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 20000 }),
      );
    });

    it('extracts token via nested tokenJsonPath (data.token)', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ data: { token: 'deep-token' } }),
      });

      const { token, expiresAt } = await service.refreshToken(
        makeConnector({ authType: 'basic_login' }),
      );

      expect(token).toBe('deep-token');
      expect(expiresAt).toBeNull();
    });

    it('falls back to access_token key when tokenJsonPath is absent', async () => {
      tokenCipher.decrypt.mockReturnValue(
        JSON.stringify({ username: 'u', password: 'p', loginUrl: '/login' }),
      );
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ access_token: 'fallback-token' }),
      });

      const { token } = await service.refreshToken(makeConnector({ authType: 'basic_login' }));

      expect(token).toBe('fallback-token');
    });

    it('gives a clear error when the login endpoint returns non-JSON', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: '<html><body>Gateway Timeout</body></html>',
      });

      await expect(
        service.refreshToken(makeConnector({ authType: 'basic_login' })),
      ).rejects.toThrow('Login endpoint não retornou um JSON válido');
    });

    it('throws when login endpoint returns non-2xx', async () => {
      mockAxios.post.mockResolvedValue({ status: 403, data: 'Forbidden' });

      await expect(
        service.refreshToken(makeConnector({ authType: 'basic_login' })),
      ).rejects.toThrow('HTTP 403');
    });

    it('throws when token path does not exist in response', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: JSON.stringify({ result: 'ok' }),
      });

      await expect(
        service.refreshToken(makeConnector({ authType: 'basic_login' })),
      ).rejects.toThrow('"data.token"');
    });

    it('rejects a loginUrl pointing to a public host, never posting the password to it', async () => {
      tokenCipher.decrypt.mockReturnValue(
        JSON.stringify({
          username: 'erp-user',
          password: 'erp-pass',
          loginUrl: 'https://attacker.example.com/steal',
        }),
      );

      await expect(
        service.refreshToken(makeConnector({ authType: 'basic_login' })),
      ).rejects.toThrow('domínio público');
      expect(mockAxios.post).not.toHaveBeenCalled();
    });
  });

  // ─── extractByPath ────────────────────────────────────────────────────────

  describe('extractByPath', () => {
    it('extracts top-level key', () => {
      expect(service.extractByPath({ access_token: 'tok' }, 'access_token')).toBe('tok');
    });

    it('extracts nested key via dot notation', () => {
      expect(service.extractByPath({ data: { token: 'deep' } }, 'data.token')).toBe('deep');
    });

    it('returns null when intermediate key is missing', () => {
      expect(service.extractByPath({ other: 'x' }, 'data.token')).toBeNull();
    });

    it('returns null when input is not an object', () => {
      expect(service.extractByPath('string', 'key')).toBeNull();
    });

    it('returns null when value is null', () => {
      expect(service.extractByPath({ key: null }, 'key')).toBeNull();
    });
  });
});
