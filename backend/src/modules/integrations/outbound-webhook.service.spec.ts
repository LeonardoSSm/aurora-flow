import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import { HmacService } from '../../common/crypto/hmac.service';
import {
  WebhookDeliveryStatus,
  type WebhookDeliveryEntity,
} from '../../database/entities/webhook-delivery.entity';
import { OutboundWebhookService } from './outbound-webhook.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
    isAxiosError: jest.fn((error: unknown) =>
      Boolean((error as { isAxiosError?: boolean } | null)?.isAxiosError),
    ),
  },
}));

function makeRepo() {
  let sequence = 0;
  return {
    create: jest.fn((data: Partial<WebhookDeliveryEntity>) => data as WebhookDeliveryEntity),
    save: jest.fn(async (entity: WebhookDeliveryEntity) => {
      if (!entity.id) entity.id = `delivery-${++sequence}`;
      return entity;
    }),
    findOne: jest.fn(),
    find: jest.fn(),
  };
}

function makeService() {
  const repo = makeRepo();
  const configService = {
    get: jest.fn((_key: string) => undefined),
  };
  const hmacService = new HmacService();
  const metricsService = { incrementWebhookDeliveries: jest.fn() };
  const service = new OutboundWebhookService(
    configService as unknown as ConfigService,
    repo as never,
    hmacService,
    metricsService as never,
  );

  return { service, repo, hmacService, metricsService };
}

function makeDelivery(overrides: Partial<WebhookDeliveryEntity> = {}): WebhookDeliveryEntity {
  return {
    id: 'delivery-id',
    connectorId: null,
    flowExecutionId: 'execution-id',
    url: 'https://example.test/webhook',
    method: 'POST',
    requestHeaders: { 'Content-Type': 'application/json' },
    requestBody: '{"ok":true}',
    responseStatus: null,
    responseBody: null,
    status: WebhookDeliveryStatus.RETRYING,
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: new Date(),
    errorMessage: null,
    duration: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WebhookDeliveryEntity;
}

describe('OutboundWebhookService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('send bem-sucedido salva status success e responseStatus', async () => {
    const { service } = makeService();
    mockedAxios.request.mockResolvedValue({ status: 200, statusText: 'OK', data: 'ok' });

    const delivery = await service.send({
      url: 'https://example.test/webhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"ok":true}',
      flowExecutionId: 'execution-id',
    });

    expect(delivery.status).toBe(WebhookDeliveryStatus.SUCCESS);
    expect(delivery.responseStatus).toBe(200);
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.flowExecutionId).toBe('execution-id');
  });

  it('send com falha 5xx marca retrying e define nextAttemptAt', async () => {
    const { service } = makeService();
    mockedAxios.request.mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      data: 'erro',
    });

    const delivery = await service.send({
      url: 'https://example.test/webhook',
      method: 'POST',
      body: '{"ok":true}',
      maxAttempts: 3,
    });

    expect(delivery.status).toBe(WebhookDeliveryStatus.RETRYING);
    expect(delivery.responseStatus).toBe(500);
    expect(delivery.nextAttemptAt).toBeInstanceOf(Date);
    expect(delivery.errorMessage).toContain('500');
  });

  it('send com maxAttempts atingido marca failed', async () => {
    const { service } = makeService();
    mockedAxios.request.mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      data: 'erro',
    });

    const delivery = await service.send({
      url: 'https://example.test/webhook',
      method: 'POST',
      body: '{"ok":true}',
      maxAttempts: 1,
    });

    expect(delivery.status).toBe(WebhookDeliveryStatus.FAILED);
    expect(delivery.nextAttemptAt).toBeNull();
    expect(delivery.attemptCount).toBe(1);
  });

  it('retry chama send novamente com dados originais', async () => {
    const { service, repo } = makeService();
    const existing = makeDelivery();
    repo.findOne.mockResolvedValue(existing);
    mockedAxios.request.mockResolvedValue({ status: 204, statusText: 'No Content', data: '' });
    const sendSpy = jest.spyOn(service, 'send');

    const delivery = await service.retry(existing.id);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: existing.id,
        url: existing.url,
        method: existing.method,
        body: existing.requestBody,
        flowExecutionId: existing.flowExecutionId,
      }),
    );
    expect(delivery.status).toBe(WebhookDeliveryStatus.SUCCESS);
    expect(delivery.attemptCount).toBe(2);

    sendSpy.mockRestore();
  });

  it('nao persiste header Authorization em requestHeaders', async () => {
    const { service } = makeService();
    mockedAxios.request.mockResolvedValue({ status: 200, statusText: 'OK', data: 'ok' });

    const delivery = await service.send({
      url: 'https://example.test/webhook',
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: '{"ok":true}',
    });

    expect(delivery.requestHeaders).toEqual({ 'Content-Type': 'application/json' });
    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
  });

  it('envia header HMAC quando signingSecret for informado', async () => {
    const { service, hmacService } = makeService();
    mockedAxios.request.mockResolvedValue({ status: 200, statusText: 'OK', data: 'ok' });
    const body = '{"ok":true}';
    const expectedSignature = `sha256=${hmacService.sign('secret', body)}`;

    const delivery = await service.send({
      url: 'https://example.test/webhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signingSecret: 'secret',
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-FormHub-Signature': expectedSignature }),
      }),
    );
    expect(delivery.requestHeaders).toEqual({
      'Content-Type': 'application/json',
      'X-FormHub-Signature': expectedSignature,
    });
  });
});
