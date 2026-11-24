import { QueryFailedError } from 'typeorm';
import {
  NotificationMessageEntity,
  NotificationRecipientEntity,
} from '../../database/entities';
import { CHANNEL_LIMITS } from './domain/notification.limits';
import {
  NotificationRateLimitError,
  NotificationValidationError,
  NotificationsService,
  type EnqueueNotificationInput,
} from './notifications.service';

type Row = Record<string, unknown>;

function makeService(options: { config?: Record<string, string>; recentRecipients?: number } = {}) {
  const saved: { message?: Row; recipients: Row[] } = { recipients: [] };

  const manager = {
    create: jest.fn((_entity: unknown, data: Row) => ({ ...data })),
    save: jest.fn(async (entity: unknown, data: Row | Row[]) => {
      if (entity === NotificationMessageEntity) {
        saved.message = { id: 'msg-1', createdAt: new Date(), ...(data as Row) };
        return saved.message;
      }
      if (entity === NotificationRecipientEntity) {
        saved.recipients = (data as Row[]).map((row, i) => ({ id: `rec-${i + 1}`, ...row }));
        return saved.recipients;
      }
      throw new Error('entidade inesperada');
    }),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)) };

  const messagesRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    findOneOrFail: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const recipientsQb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(options.recentRecipients ?? 0),
  };
  const recipientsRepo = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(() => recipientsQb),
  };

  const channel = {
    id: 'email' as const,
    limits: CHANNEL_LIMITS.email,
    validateRecipient: jest.fn((r: { address: string | null; userId: string | null }) => {
      const address = (r.address ?? '').trim().toLowerCase();
      return address.includes('@')
        ? { valid: true, normalizedAddress: address }
        : { valid: false, reason: 'Destinatário sem e-mail válido.' };
    }),
  };
  const registry = {
    has: jest.fn((id: string) => id === 'email' || id === 'in_app'),
    get: jest.fn(() => channel),
  };
  const dispatcher = {
    dispatchMessage: jest.fn().mockResolvedValue({ claimed: 0 }),
    refreshMessageStatus: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn((key: string) => options.config?.[key]) };
  const metrics = { incrementNotificationsCreated: jest.fn() };

  const service = new NotificationsService(
    dataSource as never,
    messagesRepo as never,
    recipientsRepo as never,
    registry as never,
    dispatcher as never,
    config as never,
    metrics as never,
  );
  return { service, saved, manager, dataSource, messagesRepo, recipientsRepo, recipientsQb, dispatcher, metrics, channel };
}

const input = (overrides: Partial<EnqueueNotificationInput> = {}): EnqueueNotificationInput => ({
  channel: 'email',
  title: 'Assunto',
  body: 'Corpo da mensagem',
  recipients: [{ source: 'user', userId: 'u-1', address: 'maria@x.com' }],
  origin: { flowId: 'flow-1', flowExecutionId: 'exec-1', nodeId: 'n1', solicitationId: 'sol-1' },
  ...overrides,
});

describe('NotificationsService.enqueue', () => {
  describe('validação de entrada', () => {
    it('canal desconhecido', async () => {
      const { service, dataSource } = makeService();
      await expect(service.enqueue(input({ channel: 'sms' as never }))).rejects.toMatchObject({
        name: 'NotificationValidationError',
        code: 'unknown_channel',
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('conteúdo vazio', async () => {
      const { service } = makeService();
      await expect(service.enqueue(input({ body: '   ' }))).rejects.toMatchObject({ code: 'empty_content' });
    });

    it('sem destinatários', async () => {
      const { service } = makeService();
      await expect(service.enqueue(input({ recipients: [] }))).rejects.toMatchObject({ code: 'no_recipients' });
    });

    it('destinatários demais (limite padrão 50 e configurável)', async () => {
      const many = Array.from({ length: 51 }, (_, i) => ({ source: 'custom' as const, address: `u${i}@x.com` }));
      const { service } = makeService();
      await expect(service.enqueue(input({ recipients: many }))).rejects.toMatchObject({ code: 'too_many_recipients' });

      const { service: relaxed } = makeService({ config: { NOTIFICATIONS_MAX_RECIPIENTS_PER_NODE: '100' } });
      await expect(relaxed.enqueue(input({ recipients: many }))).resolves.toMatchObject({ created: true });

      const { service: strict } = makeService({ config: { NOTIFICATIONS_MAX_RECIPIENTS_PER_NODE: '2' } });
      await expect(
        strict.enqueue(input({ recipients: many.slice(0, 3) })),
      ).rejects.toBeInstanceOf(NotificationValidationError);
    });
  });

  describe('persistência', () => {
    it('grava a notificação com correlação, política normalizada e destinatários pendentes', async () => {
      const { service, saved, metrics } = makeService();
      const result = await service.enqueue(
        input({
          priority: 'high',
          retryPolicy: { maxAttempts: 99, backoffSeconds: 1 },
          idempotencyKey: 'v1:abc',
          metadata: { missingVariables: ['x'] },
        }),
      );

      expect(result.created).toBe(true);
      expect(saved.message).toMatchObject({
        channel: 'email',
        status: 'pending',
        priority: 'high',
        title: 'Assunto',
        body: 'Corpo da mensagem',
        maxAttempts: 5,
        backoffSeconds: 5,
        idempotencyKey: 'v1:abc',
        flowId: 'flow-1',
        flowExecutionId: 'exec-1',
        nodeId: 'n1',
        solicitationId: 'sol-1',
        scheduledFor: null,
        completedAt: null,
        metadata: { missingVariables: ['x'] },
      });
      expect(saved.recipients).toHaveLength(1);
      expect(saved.recipients[0]).toMatchObject({
        notificationId: 'msg-1',
        userId: 'u-1',
        source: 'user',
        address: 'maria@x.com',
        recipientKey: 'u-1',
        status: 'pending',
        priorityRank: 0,
        attemptCount: 0,
      });
      expect(metrics.incrementNotificationsCreated).toHaveBeenCalledWith('email');
    });

    it('trunca o título ao limite do canal', async () => {
      const { service, saved } = makeService();
      await service.enqueue(input({ title: 'T'.repeat(500) }));
      expect(String(saved.message?.title)).toHaveLength(CHANNEL_LIMITS.email.titleMax);
    });

    it('prioridade padrão é normal (rank 1)', async () => {
      const { service, saved } = makeService();
      await service.enqueue(input());
      expect(saved.message?.priority).toBe('normal');
      expect(saved.recipients[0].priorityRank).toBe(1);
    });
  });

  describe('agendamento', () => {
    it('data futura → destinatários `scheduled` com nextAttemptAt na data e scheduledFor gravado', async () => {
      const { service, saved } = makeService();
      const when = new Date(Date.now() + 30 * 60_000);
      await service.enqueue(input({ scheduledFor: when }));
      expect(saved.message).toMatchObject({ status: 'scheduled', scheduledFor: when });
      expect(saved.recipients[0]).toMatchObject({ status: 'scheduled', nextAttemptAt: when });
    });

    it('data no passado → envio imediato (pending, sem scheduledFor)', async () => {
      const { service, saved } = makeService();
      await service.enqueue(input({ scheduledFor: new Date(Date.now() - 60_000) }));
      expect(saved.message).toMatchObject({ status: 'pending', scheduledFor: null });
      expect(saved.recipients[0].status).toBe('pending');
    });
  });

  describe('destinatários', () => {
    it('deduplica o mesmo usuário vindo de duas fontes e o mesmo e-mail em caixa diferente', async () => {
      const { service, saved } = makeService();
      await service.enqueue(
        input({
          recipients: [
            { source: 'user', userId: 'u-1', address: 'maria@x.com' },
            { source: 'requester', userId: 'u-1', address: 'maria@x.com' },
            { source: 'custom', address: 'Joao@X.com' },
            { source: 'field', address: 'joao@x.com' },
          ],
        }),
      );
      expect(saved.recipients.map((r) => r.recipientKey)).toEqual(['u-1', 'joao@x.com']);
    });

    it('destinatário inválido vira `failed` rastreável (não some, não vaza em silêncio)', async () => {
      const { service, saved } = makeService();
      const before = Date.now();
      await service.enqueue(
        input({
          recipients: [
            { source: 'custom', address: 'ok@x.com' },
            { source: 'custom', address: 'lixo' },
            { source: 'responsible', unresolvedReason: 'A solicitação não tem responsável atribuído.' },
          ],
        }),
      );
      const [ok, bad, unresolved] = saved.recipients;
      expect(ok.status).toBe('pending');
      expect(bad).toMatchObject({
        status: 'failed',
        lastErrorCategory: 'invalid_recipient',
        lastError: 'Destinatário sem e-mail válido.',
      });
      expect((bad.failedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect(unresolved).toMatchObject({
        status: 'failed',
        source: 'responsible',
        lastErrorCategory: 'invalid_recipient',
        lastError: 'A solicitação não tem responsável atribuído.',
      });
      // chaves distintas — dois “não resolvidos” da mesma fonte não colidem
      expect(new Set(saved.recipients.map((r) => r.recipientKey)).size).toBe(3);
    });

    it('status agregado reflete a mistura (pending enquanto houver o que enviar)', async () => {
      const { service, saved } = makeService();
      await service.enqueue(
        input({ recipients: [{ source: 'custom', address: 'ok@x.com' }, { source: 'custom', address: 'lixo' }] }),
      );
      expect(saved.message?.status).toBe('pending');
      expect(saved.message?.completedAt).toBeNull();
    });

    it('todos inválidos → notificação nasce `failed` e já concluída', async () => {
      const { service, saved } = makeService();
      await service.enqueue(input({ recipients: [{ source: 'custom', address: 'lixo' }] }));
      expect(saved.message?.status).toBe('failed');
      expect(saved.message?.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('idempotência', () => {
    it('chave já existente devolve a notificação anterior, sem criar nada nem contar métrica', async () => {
      const { service, messagesRepo, recipientsRepo, dataSource, metrics } = makeService();
      messagesRepo.findOne.mockResolvedValue({ id: 'existing-msg', idempotencyKey: 'v1:abc' });
      recipientsRepo.find.mockResolvedValue([{ id: 'rec-old' }]);

      const result = await service.enqueue(input({ idempotencyKey: 'v1:abc' }));

      expect(result.created).toBe(false);
      expect(result.message).toMatchObject({ id: 'existing-msg' });
      expect(result.recipients).toEqual([{ id: 'rec-old' }]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(metrics.incrementNotificationsCreated).not.toHaveBeenCalled();
    });

    it('reprocessar NÃO conta contra o limite por hora (a checagem de idempotência vem antes)', async () => {
      const { service, messagesRepo, recipientsQb } = makeService({ recentRecipients: 10_000 });
      messagesRepo.findOne.mockResolvedValue({ id: 'existing-msg' });
      await expect(service.enqueue(input({ idempotencyKey: 'v1:abc' }))).resolves.toMatchObject({ created: false });
      expect(recipientsQb.getCount).not.toHaveBeenCalled();
    });

    it('corrida: violação de UNIQUE na chave entre a checagem e o INSERT devolve a existente', async () => {
      const { service, messagesRepo, dataSource } = makeService();
      messagesRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'winner' });
      dataSource.transaction.mockRejectedValueOnce(
        Object.assign(new QueryFailedError('INSERT', [], { code: '23505', constraint: 'UQ_notification_messages_idempotency_key' } as never), {
          driverError: { code: '23505', constraint: 'UQ_notification_messages_idempotency_key' },
        }),
      );

      const result = await service.enqueue(input({ idempotencyKey: 'v1:abc' }));
      expect(result).toMatchObject({ created: false, message: { id: 'winner' } });
    });

    it('outra violação de UNIQUE (outra constraint) NÃO é engolida', async () => {
      const { service, dataSource } = makeService();
      dataSource.transaction.mockRejectedValueOnce(
        Object.assign(new QueryFailedError('INSERT', [], new Error('dup') as never), {
          driverError: { code: '23505', constraint: 'UQ_notification_recipients_message_key' },
        }),
      );
      await expect(service.enqueue(input({ idempotencyKey: 'v1:abc' }))).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('sem chave: nunca consulta duplicata e sempre cria', async () => {
      const { service, messagesRepo } = makeService();
      await service.enqueue(input({ idempotencyKey: null }));
      expect(messagesRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('limite de envio por fluxo/hora', () => {
    it('bloqueia quando recentes + novos passam do teto', async () => {
      const { service, dataSource } = makeService({
        recentRecipients: 999,
        config: { NOTIFICATIONS_MAX_RECIPIENTS_PER_FLOW_PER_HOUR: '1000' },
      });
      await expect(
        service.enqueue(input({ recipients: [{ source: 'custom', address: 'a@x.com' }, { source: 'custom', address: 'b@x.com' }] })),
      ).rejects.toBeInstanceOf(NotificationRateLimitError);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('permite exatamente até o teto', async () => {
      const { service } = makeService({
        recentRecipients: 999,
        config: { NOTIFICATIONS_MAX_RECIPIENTS_PER_FLOW_PER_HOUR: '1000' },
      });
      await expect(service.enqueue(input())).resolves.toMatchObject({ created: true });
    });

    it('usa o teto padrão (1000) sem configuração', async () => {
      const { service } = makeService({ recentRecipients: 1000 });
      await expect(service.enqueue(input())).rejects.toThrow(/Limite de 1000 notificações por hora/);
    });

    it('consulta só a última hora do fluxo', async () => {
      const { service, recipientsQb } = makeService();
      await service.enqueue(input());
      expect(recipientsQb.where).toHaveBeenCalledWith('m.flowId = :flowId', { flowId: 'flow-1' });
      const [, params] = recipientsQb.andWhere.mock.calls[0];
      expect(Date.now() - (params.since as Date).getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    });

    it('não se aplica a notificações sem fluxo de origem', async () => {
      const { service, recipientsQb } = makeService({ recentRecipients: 99_999 });
      await expect(service.enqueue(input({ origin: {} }))).resolves.toMatchObject({ created: true });
      expect(recipientsQb.getCount).not.toHaveBeenCalled();
    });
  });
});

describe('NotificationsService.summarize', () => {
  it('conta por estado, destaca retentativas agendadas e agrupa falhas por categoria', async () => {
    const { service, messagesRepo, recipientsRepo } = makeService();
    messagesRepo.findOneOrFail.mockResolvedValue({ id: 'msg-1', channel: 'email' });
    recipientsRepo.find.mockResolvedValue([
      { id: '1', status: 'sent', attemptCount: 1, lastErrorCategory: null },
      { id: '2', status: 'pending', attemptCount: 1, lastErrorCategory: 'transient' },
      { id: '3', status: 'pending', attemptCount: 0, lastErrorCategory: null },
      { id: '4', status: 'failed', attemptCount: 1, lastErrorCategory: 'invalid_recipient' },
      { id: '5', status: 'failed', attemptCount: 3, lastErrorCategory: 'invalid_recipient' },
      { id: '6', status: 'failed', attemptCount: 3, lastErrorCategory: 'timeout' },
      { id: '7', status: 'delivered', attemptCount: 1, lastErrorCategory: null },
    ]);

    const summary = await service.summarize('msg-1');

    expect(summary).toEqual({
      notificationId: 'msg-1',
      channel: 'email',
      status: 'pending',
      counts: { total: 7, scheduled: 0, pending: 2, processing: 0, sent: 1, delivered: 1, failed: 3, cancelled: 0 },
      retryScheduled: 1,
      errors: [
        { category: 'invalid_recipient', count: 2 },
        { category: 'timeout', count: 1 },
      ],
    });
  });
});

describe('NotificationsService.dispatch', () => {
  it('despacha e devolve o resumo atualizado', async () => {
    const { service, dispatcher, messagesRepo, recipientsRepo } = makeService();
    messagesRepo.findOneOrFail.mockResolvedValue({ id: 'msg-1', channel: 'email' });
    recipientsRepo.find.mockResolvedValue([{ id: '1', status: 'sent', attemptCount: 1, lastErrorCategory: null }]);
    const summary = await service.dispatch('msg-1');
    expect(dispatcher.dispatchMessage).toHaveBeenCalledWith('msg-1');
    expect(summary.status).toBe('sent');
  });
});

describe('NotificationsService.cancel', () => {
  it('cancela só pending/scheduled e marca a notificação como cancelada quando nada foi enviado', async () => {
    const { service, recipientsRepo, messagesRepo, dispatcher } = makeService();
    recipientsRepo.update.mockResolvedValue({ affected: 2 });
    messagesRepo.findOneOrFail.mockResolvedValue({ id: 'msg-1', channel: 'email' });
    recipientsRepo.find.mockResolvedValue([
      { id: '1', status: 'cancelled', attemptCount: 0, lastErrorCategory: null },
      { id: '2', status: 'cancelled', attemptCount: 0, lastErrorCategory: null },
    ]);

    const result = await service.cancel('msg-1');

    const [where, changes] = recipientsRepo.update.mock.calls[0];
    expect(where.notificationId).toBe('msg-1');
    expect(where.status.value).toEqual(['pending', 'scheduled']); // jamais `processing` nem estados terminais
    expect(changes).toMatchObject({ status: 'cancelled', lockedAt: null });
    expect(changes.cancelledAt).toBeInstanceOf(Date);
    expect(dispatcher.refreshMessageStatus).toHaveBeenCalledWith('msg-1');
    expect(result.cancelled).toBe(2);
    expect(result.summary.status).toBe('cancelled');
    expect(messagesRepo.update).toHaveBeenCalledWith('msg-1', { cancelledAt: expect.any(Date) });
  });

  it('se nada pôde ser cancelado (já enviado), não marca a notificação como cancelada', async () => {
    const { service, recipientsRepo, messagesRepo } = makeService();
    recipientsRepo.update.mockResolvedValue({ affected: 0 });
    messagesRepo.findOneOrFail.mockResolvedValue({ id: 'msg-1', channel: 'email' });
    recipientsRepo.find.mockResolvedValue([{ id: '1', status: 'sent', attemptCount: 1, lastErrorCategory: null }]);
    const result = await service.cancel('msg-1');
    expect(result.cancelled).toBe(0);
    expect(result.summary.status).toBe('sent');
    expect(messagesRepo.update).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.retryFailed', () => {
  it('reenfileira só falhas recuperáveis, com orçamento novo; invalid_recipient fica de fora', async () => {
    const { service, recipientsRepo, messagesRepo, dispatcher } = makeService();
    messagesRepo.findOneOrFail.mockResolvedValue({ id: 'msg-1', channel: 'email' });
    recipientsRepo.find
      .mockResolvedValueOnce([
        { id: 'r1', lastErrorCategory: 'timeout' },
        { id: 'r2', lastErrorCategory: 'invalid_recipient' },
        { id: 'r3', lastErrorCategory: 'not_configured' },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.retryFailed('msg-1');

    const [where, changes] = recipientsRepo.update.mock.calls[0];
    expect(where.id.value).toEqual(['r1', 'r3']);
    expect(where.status).toBe('failed');
    expect(changes).toMatchObject({ status: 'pending', attemptCount: 0, failedAt: null, lockedAt: null });
    expect(changes.nextAttemptAt).toBeInstanceOf(Date);
    expect(messagesRepo.update).toHaveBeenCalledWith('msg-1', { completedAt: null, cancelledAt: null });
    expect(dispatcher.refreshMessageStatus).toHaveBeenCalledWith('msg-1');
    expect(result.requeued).toBe(2);
  });

  it('sem falhas recuperáveis não altera nada', async () => {
    const { service, recipientsRepo, messagesRepo } = makeService();
    messagesRepo.findOneOrFail.mockResolvedValue({ id: 'msg-1', channel: 'email' });
    recipientsRepo.find.mockResolvedValueOnce([{ id: 'r2', lastErrorCategory: 'invalid_recipient' }]).mockResolvedValueOnce([]);
    const result = await service.retryFailed('msg-1');
    expect(result.requeued).toBe(0);
    expect(recipientsRepo.update).not.toHaveBeenCalled();
    expect(messagesRepo.update).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.purgeExpired', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  it('apaga só notificações TERMINAIS mais antigas que a retenção (padrão 90 dias)', async () => {
    const { service, messagesRepo } = makeService();
    messagesRepo.delete.mockResolvedValue({ affected: 7 });
    await expect(service.purgeExpired(now)).resolves.toBe(7);

    const [criteria] = messagesRepo.delete.mock.calls[0];
    expect(criteria.createdAt.value.toISOString()).toBe('2026-07-07T12:00:00.000Z');
    expect(criteria.status.value).toEqual(['sent', 'delivered', 'partially_sent', 'failed', 'cancelled']);
    expect(criteria.status.value).not.toContain('pending');
    expect(criteria.status.value).not.toContain('scheduled');
    expect(criteria.status.value).not.toContain('processing');
  });

  it('respeita NOTIFICATIONS_RETENTION_DAYS', async () => {
    const { service, messagesRepo } = makeService({ config: { NOTIFICATIONS_RETENTION_DAYS: '30' } });
    await service.purgeExpired(now);
    expect(messagesRepo.delete.mock.calls[0][0].createdAt.value.toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });
});

describe('NotificationsService.findMessages', () => {
  it('filtra por fluxo (sempre), execução e status, com paginação', async () => {
    const { service, messagesRepo } = makeService();
    messagesRepo.findAndCount.mockResolvedValue([[{ id: 'm' }], 1]);
    const result = await service.findMessages({ flowId: 'f', flowExecutionId: 'e', status: 'failed', page: 3, limit: 10 });
    expect(messagesRepo.findAndCount).toHaveBeenCalledWith({
      where: { flowId: 'f', flowExecutionId: 'e', status: 'failed' },
      relations: { recipients: true },
      order: { createdAt: 'DESC' },
      skip: 20,
      take: 10,
    });
    expect(result).toEqual({ data: [{ id: 'm' }], total: 1 });
  });

  it('sem filtros opcionais consulta só pelo fluxo', async () => {
    const { service, messagesRepo } = makeService();
    messagesRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.findMessages({ flowId: 'f', page: 1, limit: 20 });
    expect(messagesRepo.findAndCount.mock.calls[0][0].where).toEqual({ flowId: 'f' });
  });
});
