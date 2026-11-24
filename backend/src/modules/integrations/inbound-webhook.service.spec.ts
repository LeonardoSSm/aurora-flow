import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { HmacService } from '../../common/crypto/hmac.service';
import type { WebhookReceivedEvent } from '../../common/events/webhook-events';
import { InboundWebhookEventStatus } from '../../database/entities/inbound-webhook-event.entity';
import type { InboundWebhookEventEntity } from '../../database/entities/inbound-webhook-event.entity';
import type { WebhookDeliveryEntity } from '../../database/entities/webhook-delivery.entity';
import type { WebhookEndpointEntity } from '../../database/entities/webhook-endpoint.entity';
import { InboundWebhookService } from './inbound-webhook.service';

function makeRepo<T extends { id?: string }>() {
  let sequence = 0;
  return {
    create: jest.fn((data: Partial<T>) => data as T),
    save: jest.fn(async (entity: T) => {
      entity.id ??= `entity-${++sequence}`;
      return entity;
    }),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
  };
}

function makeEndpoint(overrides: Partial<WebhookEndpointEntity> = {}): WebhookEndpointEntity {
  return {
    id: 'endpoint-id',
    name: 'ERP',
    token: 'token-id',
    signingSecret: null,
    isActive: true,
    description: null,
    flowTriggerEnabled: false,
    createdBy: 'user-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WebhookEndpointEntity;
}

function makeService() {
  const endpointsRepo = makeRepo<WebhookEndpointEntity>();
  const eventsRepo = makeRepo<InboundWebhookEventEntity>();
  const deliveriesRepo = makeRepo<WebhookDeliveryEntity>();
  const hmacService = new HmacService();
  const eventEmitter = { emit: jest.fn() };
  const metricsService = { incrementInboundWebhookEvents: jest.fn() };
  const service = new InboundWebhookService(
    endpointsRepo as never,
    eventsRepo as never,
    deliveriesRepo as never,
    hmacService,
    eventEmitter as never,
    metricsService as never,
  );

  return { service, endpointsRepo, eventsRepo, hmacService, eventEmitter, metricsService };
}

describe('InboundWebhookService', () => {
  it('token válido salva evento recebido sem Authorization', async () => {
    const { service, endpointsRepo, eventEmitter } = makeService();
    endpointsRepo.findOne.mockResolvedValue(makeEndpoint());

    const event = await service.receiveWebhook(
      'token-id',
      {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
        'user-agent': 'ERP',
      },
      '{"ok":true}',
    );

    expect(event).toEqual(
      expect.objectContaining({
        endpointToken: 'token-id',
        payload: { ok: true },
        headers: { 'content-type': 'application/json', 'user-agent': 'ERP' },
        signatureValid: true,
        status: InboundWebhookEventStatus.RECEIVED,
      }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('token inválido retorna 404', async () => {
    const { service, endpointsRepo, eventsRepo } = makeService();
    endpointsRepo.findOne.mockResolvedValue(null);

    await expect(service.receiveWebhook('missing', {}, '{}')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(eventsRepo.save).not.toHaveBeenCalled();
  });

  it('assinatura inválida salva evento ignored e retorna 401', async () => {
    const { service, endpointsRepo, eventsRepo } = makeService();
    endpointsRepo.findOne.mockResolvedValue(
      makeEndpoint({ signingSecret: 'secret', flowTriggerEnabled: true }),
    );

    await expect(
      service.receiveWebhook(
        'token-id',
        { 'x-aurora-flow-signature': 'sha256='.concat('0'.repeat(64)) },
        '{"ok":true}',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureValid: false,
        status: InboundWebhookEventStatus.IGNORED,
        errorMessage: 'Assinatura inválida.',
      }),
    );
  });

  it('flowTriggerEnabled=true emite webhooks.received', async () => {
    const { service, endpointsRepo, hmacService, eventEmitter } = makeService();
    const rawBody = '{"ok":true}';
    endpointsRepo.findOne.mockResolvedValue(
      makeEndpoint({ signingSecret: 'secret', flowTriggerEnabled: true }),
    );

    const event = await service.receiveWebhook(
      'token-id',
      { 'x-hub-signature-256': `sha256=${hmacService.sign('secret', rawBody)}` },
      rawBody,
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'webhooks.received',
      expect.objectContaining<WebhookReceivedEvent>({
        name: 'webhooks.received',
        eventId: event.id,
        endpointId: 'endpoint-id',
        payload: { ok: true },
      }),
    );
  });

  it('não expõe signingSecret nas respostas administrativas', async () => {
    const { service, endpointsRepo } = makeService();
    endpointsRepo.find.mockResolvedValue([makeEndpoint({ signingSecret: 'secret' })]);

    const endpoints = await service.listEndpoints({
      sub: 'admin-id',
      email: 'admin@formhub.local',
      fullName: 'Admin',
      role: 'admin',
      tokenVersion: 0,
    });

    expect(endpoints[0]).toEqual(
      expect.objectContaining({
        id: 'endpoint-id',
        signingSecretConfigured: true,
      }),
    );
    expect(endpoints[0]).not.toHaveProperty('signingSecret');
  });
});

describe('InboundWebhookService.receiveList — rota de lista', () => {
  it('lê o arquivo e entrega aos fluxos { itens: [...] }', async () => {
    const { service, endpointsRepo, eventsRepo, eventEmitter } = makeService();
    endpointsRepo.findOne.mockResolvedValue(makeEndpoint({ flowTriggerEnabled: true }));

    const { event, items } = await service.receiveList('token-id', {}, {
      rawBody: 'pedido\n123\n456\n123\n',
      source: 'arquivo',
      fileName: 'pedidos.csv',
    });

    const payload = { itens: ['123', '456'], total: 2, origem: 'arquivo', arquivo: 'pedidos.csv' };
    expect(items).toBe(2);
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        rawBody: 'pedido\n123\n456\n123\n',
        status: InboundWebhookEventStatus.RECEIVED,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'webhooks.received',
      expect.objectContaining({ eventId: event.id, endpointId: 'endpoint-id', payload }),
    );
  });

  it('JSON já em lista: usa os valores, sem repetidos nem vazios', async () => {
    const { service, endpointsRepo, eventEmitter } = makeService();
    endpointsRepo.findOne.mockResolvedValue(makeEndpoint({ flowTriggerEnabled: true }));

    await service.receiveList('token-id', {}, {
      rawBody: '{"pedidos":[123," 456 ","",123]}',
      values: [123, ' 456 ', '', 123],
      source: 'json',
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'webhooks.received',
      expect.objectContaining({ payload: { itens: ['123', '456'], total: 2, origem: 'json' } }),
    );
  });

  it('a assinatura confere o conteúdo enviado (o arquivo)', async () => {
    const { service, endpointsRepo, hmacService } = makeService();
    endpointsRepo.findOne.mockResolvedValue(makeEndpoint({ signingSecret: 'secret' }));
    const rawBody = '123\n456';

    await expect(
      service.receiveList(
        'token-id',
        { 'x-aurora-flow-signature': `sha256=${hmacService.sign('secret', rawBody)}` },
        { rawBody, source: 'arquivo' },
      ),
    ).resolves.toMatchObject({ items: 2 });
    await expect(
      service.receiveList(
        'token-id',
        { 'x-aurora-flow-signature': `sha256=${hmacService.sign('secret', 'outro')}` },
        { rawBody, source: 'arquivo' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['vazia', '   \n\n', 'Nenhum valor encontrado no conteúdo enviado.'],
    [
      'acima do limite do lote',
      Array.from({ length: 501 }, (_, i) => String(i + 1)).join('\n'),
      'A lista tem 501 itens; o máximo por envio é 500. Envie em partes.',
    ],
  ])('lista %s: 400, registrada como ignorada, sem disparar fluxo', async (_caso, rawBody, message) => {
    const { service, endpointsRepo, eventsRepo, eventEmitter } = makeService();
    endpointsRepo.findOne.mockResolvedValue(makeEndpoint({ flowTriggerEnabled: true }));

    await expect(service.receiveList('token-id', {}, { rawBody, source: 'texto' })).rejects.toThrow(
      new BadRequestException(message),
    );
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: InboundWebhookEventStatus.IGNORED, errorMessage: message }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('token desconhecido: 404 antes de ler qualquer coisa', async () => {
    const { service, endpointsRepo, eventsRepo } = makeService();
    endpointsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.receiveList('missing', {}, { rawBody: '123', source: 'texto' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(eventsRepo.save).not.toHaveBeenCalled();
  });
});
