import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { In, LessThan, QueryFailedError } from 'typeorm';
import { ErpConnectorEntity } from '../../../database/entities/erp-connector.entity';
import { ErpOperationLogEntity } from '../../../database/entities/erp-operation-log.entity';
import { ErpOperationTemplateEntity } from '../../../database/entities/erp-operation-template.entity';
import { SolicitationEntity } from '../../../database/entities/solicitation.entity';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import { MetricsService } from '../../observability/metrics.service';
import { RabbitMqService } from '../../queue/rabbitmq.service';
import { ErpConnectorService } from './erp-connector.service';
import { ErpTokenRefreshService } from './erp-token-refresh.service';
import type { FlowExecutionContext } from '../../flows/types/flow.types';

// ─── Axios mock ───────────────────────────────────────────────────────────────
const mockAxios = { request: jest.fn(), get: jest.fn(), isAxiosError: jest.fn() };
jest.mock('axios', () => ({
  __esModule: true,
  default: { request: (...a: unknown[]) => mockAxios.request(...a), get: (...a: unknown[]) => mockAxios.get(...a), isAxiosError: (...a: unknown[]) => mockAxios.isAxiosError(...a) },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
const makeConnector = (overrides: Partial<ErpConnectorEntity> = {}): ErpConnectorEntity =>
  ({
    id: 'conn-1',
    name: 'Test ERP',
    baseUrl: 'http://192.168.1.10:8080',
    bearerToken: 'v1.encrypted',
    authType: 'bearer_static' as const,
    refreshCredentials: null,
    tokenExpiresAt: null,
    defaultHeaders: null,
    timeoutMs: 10000,
    isActive: true,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ErpConnectorEntity);

const makeTemplate = (overrides: Partial<ErpOperationTemplateEntity> = {}): ErpOperationTemplateEntity =>
  ({
    id: 'tpl-1',
    connectorId: 'conn-1',
    connector: makeConnector(),
    name: 'Criar pedido',
    description: null,
    method: 'POST',
    endpointPath: '/api/pedidos',
    bodyTemplate: null,
    successStatusCodes: [200, 201],
    saveResponseField: null,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  } as ErpOperationTemplateEntity);

const makeLog = (overrides: Partial<ErpOperationLogEntity> = {}): ErpOperationLogEntity =>
  ({
    id: 'log-1',
    connectorId: 'conn-1',
    templateId: 'tpl-1',
    solicitationId: null,
    flowExecutionId: null,
    status: 'retrying',
    requestUrl: 'http://192.168.1.10:8080/api/pedidos',
    requestBody: null,
    responseStatus: null,
    responseBody: null,
    errorMessage: null,
    attemptCount: 1,
    nextAttemptAt: new Date(Date.now() - 1000),
    durationMs: null,
    createdAt: new Date(),
    ...overrides,
  } as ErpOperationLogEntity);

describe('ErpConnectorService', () => {
  let service: ErpConnectorService;

  const connectorsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const templatesRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const logsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const solicitationsRepo = { findOne: jest.fn(), update: jest.fn() };
  const tokenCipher = { encrypt: jest.fn(), decrypt: jest.fn() };
  const rabbitMq = { publishJson: jest.fn() };
  const configService = { get: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const metricsService = {
    recordErpOperation: jest.fn(),
    incrementErpAuthFailures: jest.fn(),
    setErpConnectorUp: jest.fn(),
  };
  const tokenRefreshService = { refreshToken: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    tokenCipher.decrypt.mockReturnValue('plain-secret');
    tokenCipher.encrypt.mockReturnValue('v1.encrypted');
    configService.get.mockReturnValue('');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErpConnectorService,
        { provide: getRepositoryToken(ErpConnectorEntity), useValue: connectorsRepo },
        { provide: getRepositoryToken(ErpOperationTemplateEntity), useValue: templatesRepo },
        { provide: getRepositoryToken(ErpOperationLogEntity), useValue: logsRepo },
        { provide: getRepositoryToken(SolicitationEntity), useValue: solicitationsRepo },
        { provide: TokenCipherService, useValue: tokenCipher },
        { provide: RabbitMqService, useValue: rabbitMq },
        { provide: ConfigService, useValue: configService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MetricsService, useValue: metricsService },
        { provide: ErpTokenRefreshService, useValue: tokenRefreshService },
      ],
    }).compile();

    service = module.get(ErpConnectorService);
  });

  // ─── validateInternalUrl ────────────────────────────────────────────────

  describe('validateInternalUrl', () => {
    it('accepts private IP 10.x', () => {
      expect(() => service.validateInternalUrl('http://10.0.0.5/api')).not.toThrow();
    });

    it('accepts private IP 172.16-31.x', () => {
      expect(() => service.validateInternalUrl('http://172.20.1.100/api')).not.toThrow();
    });

    it('accepts private IP 192.168.x', () => {
      expect(() => service.validateInternalUrl('http://192.168.1.10:8080/api')).not.toThrow();
    });

    it('accepts localhost', () => {
      expect(() => service.validateInternalUrl('http://localhost:3000/api')).not.toThrow();
    });

    it('accepts 127.0.0.1', () => {
      expect(() => service.validateInternalUrl('http://127.0.0.1/api')).not.toThrow();
    });

    it('accepts hostname with no TLD (internal service)', () => {
      expect(() => service.validateInternalUrl('http://erp-interno/api')).not.toThrow();
    });

    it('accepts domain listed in ALLOWED_ERP_HOSTS', () => {
      configService.get.mockReturnValue('erp.internal.corp,api.totvs.local');
      expect(() => service.validateInternalUrl('http://erp.internal.corp/api')).not.toThrow();
    });

    it('rejects public .com domain', () => {
      expect(() => service.validateInternalUrl('http://api.example.com/data')).toThrow(
        BadRequestException,
      );
    });

    it('rejects public .io domain', () => {
      expect(() => service.validateInternalUrl('https://app.myerp.io/api')).toThrow(
        BadRequestException,
      );
    });

    it('rejects .com.br domain', () => {
      expect(() => service.validateInternalUrl('http://totvs.com.br/api')).toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid URL string', () => {
      expect(() => service.validateInternalUrl('not-a-url')).toThrow(BadRequestException);
    });
  });

  // ─── executeOperation ───────────────────────────────────────────────────

  describe('executeOperation', () => {
    const ctx: FlowExecutionContext = {
      eventName: 'test',
      solicitation: { id: 'sol-1' } as never,
    };

    const buildLog = () => ({
      ...makeLog({ status: 'pending', attemptCount: 0, nextAttemptAt: null }),
    });

    beforeEach(() => {
      templatesRepo.findOne.mockResolvedValue(makeTemplate());
      logsRepo.create.mockImplementation((d: Partial<ErpOperationLogEntity>) => ({ ...buildLog(), ...d }));
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);
    });

    it('marks log as success on 200 response', async () => {
      mockAxios.request.mockResolvedValue({ status: 200, data: '{"ok":true}' });

      const log = await service.executeOperation('tpl-1', ctx);

      expect(log.status).toBe('success');
      expect(log.responseStatus).toBe(200);
      expect(log.nextAttemptAt).toBeNull();
    });

    it('marks log as retrying on 5xx response (first attempt)', async () => {
      mockAxios.request.mockResolvedValue({ status: 500, data: 'Internal Server Error' });
      rabbitMq.publishJson.mockResolvedValue(undefined);

      const log = await service.executeOperation('tpl-1', ctx);

      expect(log.status).toBe('retrying');
      expect(log.nextAttemptAt).not.toBeNull();
      expect(log.attemptCount).toBe(1);
    });

    it('does not enqueue the retry immediately — only checkErpRetries (respecting nextAttemptAt) may do so', async () => {
      mockAxios.request.mockResolvedValue({ status: 500, data: 'Internal Server Error' });
      rabbitMq.publishJson.mockClear();

      await service.executeOperation('tpl-1', ctx);

      expect(rabbitMq.publishJson).not.toHaveBeenCalled();
    });

    it('does not enqueue the retry immediately on network/timeout errors either', async () => {
      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.request.mockRejectedValue(
        Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' }),
      );
      rabbitMq.publishJson.mockClear();

      const log = await service.executeOperation('tpl-1', ctx);

      expect(log.status).toBe('retrying');
      expect(rabbitMq.publishJson).not.toHaveBeenCalled();
    });

    it('marks log as failed after MAX_ATTEMPTS (3) — simulated via retryOperation', async () => {
      // Set up log already at attemptCount=2 (would be attempt 3 = max)
      logsRepo.findOne.mockResolvedValue(
        makeLog({ status: 'retrying', attemptCount: 2 }),
      );
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      templatesRepo.findOne.mockResolvedValue(makeTemplate());
      mockAxios.request.mockResolvedValue({ status: 503, data: 'unavailable' });
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);

      const log = await service.retryOperation('log-1');

      expect(log.status).toBe('failed');
      expect(log.nextAttemptAt).toBeNull();
    });

    it('does not include bearerToken in the log record', async () => {
      mockAxios.request.mockResolvedValue({ status: 200, data: '{}' });
      const log = await service.executeOperation('tpl-1', ctx);

      const logStr = JSON.stringify(log);
      expect(logStr).not.toContain('plain-secret');
      expect(logStr).not.toContain('v1.encrypted');
    });

    it('marks log as failed immediately on 401 without retry', async () => {
      mockAxios.request.mockResolvedValue({ status: 401, data: 'Unauthorized' });
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);

      const log = await service.executeOperation('tpl-1', ctx);

      expect(log.status).toBe('failed');
      expect(log.nextAttemptAt).toBeNull();
      expect(log.errorMessage).toContain('401');
      expect(rabbitMq.publishJson).not.toHaveBeenCalled();
    });

    it('emits erp.auth.failed event on 401', async () => {
      mockAxios.request.mockResolvedValue({ status: 401, data: 'Unauthorized' });
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);

      await service.executeOperation('tpl-1', ctx);

      expect(eventEmitter.emit).toHaveBeenCalledWith('erp.auth.failed', expect.objectContaining({
        connectorId: 'conn-1',
        connectorName: 'Test ERP',
      }));
    });

    it('records auth_error metric on 401', async () => {
      mockAxios.request.mockResolvedValue({ status: 401, data: 'Unauthorized' });
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);

      await service.executeOperation('tpl-1', ctx);

      expect(metricsService.recordErpOperation).toHaveBeenCalledWith('Test ERP', 'auth_error', expect.any(Number));
      expect(metricsService.incrementErpAuthFailures).toHaveBeenCalledWith('Test ERP');
    });

    it('records success metric on 200', async () => {
      mockAxios.request.mockResolvedValue({ status: 200, data: '{}' });
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);

      await service.executeOperation('tpl-1', ctx);

      expect(metricsService.recordErpOperation).toHaveBeenCalledWith('Test ERP', 'success', expect.any(Number));
    });
  });

  // ─── checkHealth ────────────────────────────────────────────────────────

  describe('checkHealth', () => {
    it('returns reachable=true authValid=true on 200', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockResolvedValue({ status: 200 });

      const result = await service.checkHealth('conn-1');

      expect(result.reachable).toBe(true);
      expect(result.authValid).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.connectorId).toBe('conn-1');
    });

    it('returns reachable=true authValid=false on 401', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockResolvedValue({ status: 401 });

      const result = await service.checkHealth('conn-1');

      expect(result.reachable).toBe(true);
      expect(result.authValid).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('returns reachable=false authValid=null on network error', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.checkHealth('conn-1');

      expect(result.reachable).toBe(false);
      expect(result.authValid).toBeNull();
      expect(result.statusCode).toBeNull();
    });

    it('never throws; always returns ErpHealthResult', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockRejectedValue(new Error('timeout'));

      await expect(service.checkHealth('conn-1')).resolves.toBeDefined();
    });

    it('throws NotFoundException for unknown connector', async () => {
      connectorsRepo.findOne.mockResolvedValue(null);
      await expect(service.checkHealth('unknown')).rejects.toThrow(NotFoundException);
    });

    it('uses 5s timeout regardless of connector.timeoutMs', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector({ timeoutMs: 60000 }));
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.checkHealth('conn-1');

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });

  // ─── getValidToken (via executeOperation) ──────────────────────────────

  describe('getValidToken behaviour', () => {
    const ctx: FlowExecutionContext = {
      eventName: 'test',
      solicitation: { id: 'sol-1' } as never,
    };

    beforeEach(() => {
      logsRepo.create.mockImplementation((d: Partial<ErpOperationLogEntity>) => ({
        ...makeLog({ status: 'pending', attemptCount: 0, nextAttemptAt: null }),
        ...d,
      }));
      logsRepo.save.mockImplementation(async (e: ErpOperationLogEntity) => e);
      mockAxios.request.mockResolvedValue({ status: 200, data: '{}' });
    });

    it('bearer_static: decrypts token directly without calling refreshToken', async () => {
      const connector = makeConnector({ authType: 'bearer_static' });
      templatesRepo.findOne.mockResolvedValue(makeTemplate({ connector }));

      await service.executeOperation('tpl-1', ctx);

      expect(tokenRefreshService.refreshToken).not.toHaveBeenCalled();
      expect(tokenCipher.decrypt).toHaveBeenCalled();
    });

    it('oauth2_client: uses cached token when tokenExpiresAt is in future', async () => {
      const connector = makeConnector({
        authType: 'oauth2_client',
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 h from now
      });
      templatesRepo.findOne.mockResolvedValue(makeTemplate({ connector }));

      await service.executeOperation('tpl-1', ctx);

      expect(tokenRefreshService.refreshToken).not.toHaveBeenCalled();
    });

    it('oauth2_client: refreshes when tokenExpiresAt is expired (past + margin)', async () => {
      const connector = makeConnector({
        authType: 'oauth2_client',
        tokenExpiresAt: new Date(Date.now() - 1000), // 1 s ago
        refreshCredentials: 'v1.enc.creds',
      });
      templatesRepo.findOne.mockResolvedValue(makeTemplate({ connector }));
      tokenRefreshService.refreshToken.mockResolvedValue({
        token: 'new-plaintext-token',
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      connectorsRepo.update.mockResolvedValue(undefined);

      await service.executeOperation('tpl-1', ctx);

      expect(tokenRefreshService.refreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'conn-1', authType: 'oauth2_client' }),
      );
      expect(tokenCipher.encrypt).toHaveBeenCalledWith('new-plaintext-token');
      expect(connectorsRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ bearerToken: 'v1.encrypted' }),
      );
    });

    it('basic_login: refreshes when updatedAt > 50 min ago (no expiresAt)', async () => {
      const oldDate = new Date(Date.now() - 51 * 60 * 1000); // 51 min ago
      const connector = makeConnector({
        authType: 'basic_login',
        tokenExpiresAt: null,
        updatedAt: oldDate,
        refreshCredentials: 'v1.enc.creds',
      });
      templatesRepo.findOne.mockResolvedValue(makeTemplate({ connector }));
      tokenRefreshService.refreshToken.mockResolvedValue({
        token: 'login-token',
        expiresAt: null,
      });
      connectorsRepo.update.mockResolvedValue(undefined);

      await service.executeOperation('tpl-1', ctx);

      expect(tokenRefreshService.refreshToken).toHaveBeenCalled();
    });

    it('throws clear error when refreshToken fails', async () => {
      const connector = makeConnector({
        authType: 'oauth2_client',
        tokenExpiresAt: new Date(0), // epoch = expired
        refreshCredentials: 'v1.enc.creds',
      });
      templatesRepo.findOne.mockResolvedValue(makeTemplate({ connector }));
      tokenRefreshService.refreshToken.mockRejectedValue(new Error('connection refused'));

      await expect(service.executeOperation('tpl-1', ctx)).rejects.toThrow(
        'Falha ao renovar token do ERP',
      );
    });

    it('oauth2 401: emits auth.failed and does not retry (no token refresh triggered by retry)', async () => {
      const connector = makeConnector({
        authType: 'oauth2_client',
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      templatesRepo.findOne.mockResolvedValue(makeTemplate({ connector }));
      mockAxios.request.mockResolvedValue({ status: 401, data: 'Unauthorized' });

      const log = await service.executeOperation('tpl-1', ctx);

      expect(log.status).toBe('failed');
      expect(rabbitMq.publishJson).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('erp.auth.failed', expect.any(Object));
    });
  });

  // ─── createConnector (auth types) ──────────────────────────────────────

  describe('createConnector — auth types', () => {
    it('rejects bearer_static without bearerToken', async () => {
      await expect(
        service.createConnector(
          { name: 'Test', baseUrl: 'http://192.168.1.1', authType: 'bearer_static' },
          'actor-1',
        ),
      ).rejects.toThrow('bearerToken é obrigatório');
    });

    it('encrypts refreshCredentials before saving', async () => {
      const created = makeConnector({ authType: 'oauth2_client', refreshCredentials: 'v1.enc.creds' });
      connectorsRepo.create.mockReturnValue(created);
      connectorsRepo.save.mockResolvedValue(created);

      await service.createConnector(
        {
          name: 'OAuth ERP',
          baseUrl: 'http://192.168.1.1',
          authType: 'oauth2_client',
          refreshCredentials: { clientId: 'id', clientSecret: 'sec', tokenUrl: '/token' },
        },
        'actor-1',
      );

      expect(tokenCipher.encrypt).toHaveBeenCalledWith(
        expect.stringContaining('"clientId":"id"'),
      );
    });

    it('masks refreshCredentials as "***" in response when present', async () => {
      const created = makeConnector({ authType: 'oauth2_client', refreshCredentials: 'v1.enc.creds' });
      connectorsRepo.create.mockReturnValue(created);
      connectorsRepo.save.mockResolvedValue(created);

      const result = await service.createConnector(
        { name: 'O', baseUrl: 'http://192.168.1.1', authType: 'oauth2_client',
          refreshCredentials: { clientId: 'x', clientSecret: 'y', tokenUrl: '/t' } },
        'actor-1',
      );

      expect((result as Record<string, unknown>).refreshCredentials).toBe('***');
    });

    it('sets refreshCredentials to null in response when not provided', async () => {
      const created = makeConnector();
      connectorsRepo.create.mockReturnValue(created);
      connectorsRepo.save.mockResolvedValue(created);

      const result = await service.createConnector(
        { name: 'Static', baseUrl: 'http://192.168.1.1', bearerToken: 'tok' },
        'actor-1',
      );

      expect((result as Record<string, unknown>).refreshCredentials).toBeNull();
    });
  });

  // ─── Admin: findAllConnectors ───────────────────────────────────────────

  describe('findAllConnectors', () => {
    it('masks bearerToken as "***" in all results', async () => {
      connectorsRepo.find.mockResolvedValue([makeConnector(), makeConnector({ id: 'conn-2' })]);

      const result = await service.findAllConnectors();

      for (const c of result) {
        expect(c.bearerToken).toBe('***');
      }
    });

    it('does not expose the raw encrypted token', async () => {
      connectorsRepo.find.mockResolvedValue([makeConnector()]);
      const result = await service.findAllConnectors();
      expect(JSON.stringify(result)).not.toContain('v1.encrypted');
    });
  });

  // ─── Admin: createConnector ─────────────────────────────────────────────

  describe('createConnector', () => {
    it('encrypts the bearerToken before saving', async () => {
      const created = makeConnector();
      connectorsRepo.create.mockReturnValue(created);
      connectorsRepo.save.mockResolvedValue(created);

      await service.createConnector(
        { name: 'Test', baseUrl: 'http://192.168.1.1', bearerToken: 'my-secret' },
        'actor-1',
      );

      expect(tokenCipher.encrypt).toHaveBeenCalledWith('my-secret');
    });

    it('validates URL before saving', async () => {
      await expect(
        service.createConnector(
          { name: 'Bad', baseUrl: 'https://public.com/api', bearerToken: 'token' },
          'actor-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(connectorsRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate connector name with a friendly ConflictException', async () => {
      connectorsRepo.create.mockReturnValue(makeConnector({ name: 'Duplicado' }));
      connectorsRepo.save.mockRejectedValue(
        new QueryFailedError('INSERT INTO erp_connectors ...', [], {
          code: '23505',
          constraint: 'UQ_erp_connectors_name',
          toString: () => 'duplicate key value violates unique constraint',
        } as never),
      );

      await expect(
        service.createConnector(
          { name: 'Duplicado', baseUrl: 'http://192.168.1.1', bearerToken: 'token' },
          'actor-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('returns connector with bearerToken masked as "***"', async () => {
      const created = makeConnector();
      connectorsRepo.create.mockReturnValue(created);
      connectorsRepo.save.mockResolvedValue(created);

      const result = await service.createConnector(
        { name: 'Test', baseUrl: 'http://192.168.1.1', bearerToken: 'secret' },
        'actor-1',
      );

      expect(result.bearerToken).toBe('***');
    });
  });

  // ─── Admin: testConnection ──────────────────────────────────────────────

  describe('testConnection', () => {
    it('returns reachable=true, authValid=true with statusCode when host responds', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockResolvedValue({ status: 200 });

      const result = await service.testConnection('conn-1');

      expect(result.reachable).toBe(true);
      expect(result.authValid).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('sends the real Authorization header, not an anonymous request', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.testConnection('conn-1');

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: 'Bearer plain-secret' } }),
      );
    });

    it('returns reachable=true, authValid=false on a 401 response — an invalid token is not reported as a healthy connection', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockResolvedValue({ status: 401 });

      const result = await service.testConnection('conn-1');

      expect(result.reachable).toBe(true);
      expect(result.authValid).toBe(false);
    });

    it('returns reachable=false when axios throws (network error)', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      mockAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testConnection('conn-1');

      expect(result.reachable).toBe(false);
      expect(result.authValid).toBeNull();
      expect(result.statusCode).toBeUndefined();
    });

    it('throws NotFoundException for unknown connector', async () => {
      connectorsRepo.findOne.mockResolvedValue(null);

      await expect(service.testConnection('unknown')).rejects.toThrow(NotFoundException);
    });

    it('uses 5s timeout (not connector.timeoutMs)', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector({ timeoutMs: 60000 }));
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.testConnection('conn-1');

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });

  // ─── Admin: updateConnector ─────────────────────────────────────────────

  describe('updateConnector', () => {
    it('throws NotFoundException for unknown connector', async () => {
      connectorsRepo.findOne.mockResolvedValue(null);
      await expect(service.updateConnector('unknown', {})).rejects.toThrow(NotFoundException);
    });

    it('updates fields and returns masked connector', async () => {
      const connector = makeConnector();
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockResolvedValue({ ...connector, name: 'Updated' });
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      const result = await service.updateConnector('conn-1', { name: 'Updated' });

      expect(result.bearerToken).toBe('***');
      expect(connectorsRepo.save).toHaveBeenCalled();
    });

    it('fires health check in background after save', async () => {
      const connector = makeConnector();
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockResolvedValue(connector);
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.updateConnector('conn-1', { name: 'Updated' });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('does NOT overwrite bearerToken when dto.bearerToken is empty string', async () => {
      const connector = makeConnector({ bearerToken: 'v1.original' });
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockImplementation(async (c: ErpConnectorEntity) => c);
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.updateConnector('conn-1', { bearerToken: '' });

      expect(connector.bearerToken).toBe('v1.original');
      expect(tokenCipher.encrypt).not.toHaveBeenCalledWith('');
    });

    it('does NOT overwrite bearerToken when dto.bearerToken is whitespace only', async () => {
      const connector = makeConnector({ bearerToken: 'v1.original' });
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockImplementation(async (c: ErpConnectorEntity) => c);
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.updateConnector('conn-1', { bearerToken: '   ' });

      expect(connector.bearerToken).toBe('v1.original');
    });

    it('DOES update bearerToken when non-empty', async () => {
      const connector = makeConnector({ bearerToken: 'v1.original' });
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockImplementation(async (c: ErpConnectorEntity) => c);
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.updateConnector('conn-1', { bearerToken: 'new-token' });

      expect(tokenCipher.encrypt).toHaveBeenCalledWith('new-token');
    });

    it('merges refreshCredentials — only overwrites provided non-empty fields', async () => {
      const connector = makeConnector({
        authType: 'oauth2_client',
        refreshCredentials: 'v1.enc.creds',
      });
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockImplementation(async (c: ErpConnectorEntity) => c);
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      tokenCipher.decrypt.mockReturnValueOnce(
        JSON.stringify({ clientId: 'original-id', clientSecret: 'original-secret', tokenUrl: 'http://token' }),
      );

      await service.updateConnector('conn-1', {
        refreshCredentials: { tokenUrl: 'http://new-token', clientId: '' },
      });

      expect(tokenCipher.encrypt).toHaveBeenCalledWith(
        expect.stringContaining('"clientId":"original-id"'),
      );
      expect(tokenCipher.encrypt).toHaveBeenCalledWith(
        expect.stringContaining('"tokenUrl":"http://new-token"'),
      );
      expect(tokenCipher.encrypt).toHaveBeenCalledWith(
        expect.stringContaining('"clientSecret":"original-secret"'),
      );
    });

    it('does NOT change refreshCredentials when all incoming fields are empty', async () => {
      const connector = makeConnector({
        authType: 'oauth2_client',
        refreshCredentials: 'v1.enc.creds',
      });
      connectorsRepo.findOne.mockResolvedValue(connector);
      connectorsRepo.save.mockImplementation(async (c: ErpConnectorEntity) => c);
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.updateConnector('conn-1', {
        refreshCredentials: { clientId: '', clientSecret: undefined, tokenUrl: '' },
      });

      // refreshCredentials must remain the original encrypted value
      expect(connector.refreshCredentials).toBe('v1.enc.creds');
    });
  });

  // ─── Admin: deleteConnector ─────────────────────────────────────────────

  describe('deleteConnector', () => {
    it('throws NotFoundException for unknown connector', async () => {
      connectorsRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteConnector('unknown', false)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when connector has logs and force=false', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      logsRepo.count.mockResolvedValue(3);

      await expect(service.deleteConnector('conn-1', false)).rejects.toThrow(ConflictException);
      expect(connectorsRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes connector directly when no logs exist', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      logsRepo.count.mockResolvedValue(0);
      connectorsRepo.delete.mockResolvedValue(undefined);

      await service.deleteConnector('conn-1', false);

      expect(logsRepo.delete).not.toHaveBeenCalled();
      expect(connectorsRepo.delete).toHaveBeenCalledWith('conn-1');
    });

    it('deletes logs first then connector when force=true and logs exist', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      logsRepo.count.mockResolvedValue(5);
      logsRepo.delete.mockResolvedValue(undefined);
      connectorsRepo.delete.mockResolvedValue(undefined);

      await service.deleteConnector('conn-1', true);

      expect(logsRepo.delete).toHaveBeenCalledWith({ connectorId: 'conn-1' });
      expect(connectorsRepo.delete).toHaveBeenCalledWith('conn-1');
    });

    it('deletes connector without touching logs when force=true but no logs', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      logsRepo.count.mockResolvedValue(0);
      connectorsRepo.delete.mockResolvedValue(undefined);

      await service.deleteConnector('conn-1', true);

      expect(logsRepo.delete).not.toHaveBeenCalled();
      expect(connectorsRepo.delete).toHaveBeenCalledWith('conn-1');
    });
  });

  // ─── checkHealth: persists to DB ───────────────────────────────────────

  describe('checkHealth — persistence', () => {
    it('saves result to lastHealthCheck after a successful probe', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockResolvedValue({ status: 200 });

      await service.checkHealth('conn-1');

      expect(connectorsRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ lastHealthCheck: expect.objectContaining({ reachable: true }) }),
      );
    });

    it('saves result to lastHealthCheck even when probe finds network error', async () => {
      connectorsRepo.findOne.mockResolvedValue(makeConnector());
      connectorsRepo.update.mockResolvedValue(undefined);
      mockAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await service.checkHealth('conn-1');

      expect(connectorsRepo.update).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ lastHealthCheck: expect.objectContaining({ reachable: false }) }),
      );
    });
  });

  // ─── Admin: findLogs ────────────────────────────────────────────────────

  describe('findLogs', () => {
    it('omits requestBody from results', async () => {
      const log = makeLog({ requestBody: '{"secret":"value"}' });
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[log], 1]),
      };
      logsRepo.createQueryBuilder.mockReturnValue(qb);

      const { data } = await service.findLogs({ page: 1, limit: 20 });

      expect(data[0]).not.toHaveProperty('requestBody');
    });

    it('truncates responseBody > 1KB with [truncated] notice', async () => {
      const bigBody = 'x'.repeat(2048);
      const log = makeLog({ responseBody: bigBody });
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[log], 1]),
      };
      logsRepo.createQueryBuilder.mockReturnValue(qb);

      const { data } = await service.findLogs({ page: 1, limit: 20 });

      expect(data[0].responseBody).toContain('[truncated]');
      expect(Buffer.byteLength(data[0].responseBody ?? '', 'utf8')).toBeLessThan(2100);
    });

    it('does not truncate responseBody <= 1KB', async () => {
      const smallBody = 'x'.repeat(500);
      const log = makeLog({ responseBody: smallBody });
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[log], 1]),
      };
      logsRepo.createQueryBuilder.mockReturnValue(qb);

      const { data } = await service.findLogs({ page: 1, limit: 20 });

      expect(data[0].responseBody).toBe(smallBody);
    });
  });

  // ─── cleanupOldLogs ─────────────────────────────────────────────────────

  describe('cleanupOldLogs', () => {
    beforeEach(() => {
      configService.get.mockImplementation(
        (_key: string, defaultValue?: string) => defaultValue,
      );
    });

    it('deletes only finished (success/failed) logs older than the retention window', async () => {
      logsRepo.delete.mockResolvedValue({ affected: 3 });

      await service.cleanupOldLogs();

      expect(logsRepo.delete).toHaveBeenCalledWith({
        status: In(['success', 'failed']),
        createdAt: LessThan(expect.any(Date)),
      });
    });

    it('respects a configured ERP_LOG_RETENTION_DAYS override', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'ERP_LOG_RETENTION_DAYS' ? '30' : undefined,
      );
      logsRepo.delete.mockResolvedValue({ affected: 0 });

      const before = Date.now();
      await service.cleanupOldLogs();

      const cutoff = (logsRepo.delete.mock.calls[0][0] as { createdAt: { value: Date } }).createdAt
        .value;
      const expectedCutoff = before - 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
    });

    it('never throws when there is nothing to delete', async () => {
      logsRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.cleanupOldLogs()).resolves.toBeUndefined();
    });
  });
});
