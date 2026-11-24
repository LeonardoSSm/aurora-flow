import { NotificationChannelError } from './domain/notification-errors';
import { NotificationDispatcherService } from './notification-dispatcher.service';

type Row = Record<string, any>;

interface FakeChannel {
  id: 'email';
  limits: { titleMax: number; bodyMax: number };
  describe: jest.Mock;
  validateRecipient: jest.Mock;
  send: jest.Mock;
}

function recipient(overrides: Row = {}): Row {
  return {
    id: 'rec-1',
    notificationId: 'msg-1',
    userId: null,
    displayName: 'Maria',
    address: 'maria@x.com',
    status: 'pending',
    attemptCount: 0,
    provider: null,
    ...overrides,
  };
}

function message(overrides: Row = {}): Row {
  return {
    id: 'msg-1',
    channel: 'email',
    title: 'Assunto',
    body: 'Corpo',
    priority: 'normal',
    maxAttempts: 3,
    backoffSeconds: 30,
    flowId: 'flow-1',
    flowExecutionId: 'exec-1',
    nodeId: 'n1',
    ...overrides,
  };
}

function makeDispatcher(
  options: { rows?: Row[]; messages?: Row[]; config?: Record<string, string>; recipientStatuses?: string[] } = {},
) {
  const claimed = options.rows ?? [recipient()];

  const qb: Row = {};
  for (const method of ['setLock', 'setOnLocked', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'limit']) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(claimed);
  const manager = {
    getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
    update: jest.fn().mockResolvedValue({ affected: claimed.length }),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)) };

  const messagesRepo = {
    find: jest.fn().mockResolvedValue(options.messages ?? [message()]),
    findOne: jest.fn().mockResolvedValue({ id: 'msg-1', status: 'pending', completedAt: null }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const countQb: Row = {};
  for (const method of ['where', 'andWhere']) countQb[method] = jest.fn().mockReturnValue(countQb);
  countQb.getCount = jest.fn().mockResolvedValue(4);
  const recipientsRepo = {
    // `find` serve a dois consumidores: a recuperação de travados (where.lockedAt → nenhum por padrão)
    // e o recálculo do estado agregado (lista de status dos destinatários).
    find: jest.fn(async (query: Row): Promise<Row[]> =>
      query?.where?.lockedAt
        ? []
        : (options.recipientStatuses ?? ['sent']).map((status, i) => ({ id: `r${i}`, status })),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => countQb),
  };

  const maxQb: Row = {};
  for (const method of ['select', 'where']) maxQb[method] = jest.fn().mockReturnValue(maxQb);
  maxQb.getRawOne = jest.fn().mockResolvedValue({ max: 0 });
  let attemptSeq = 0;
  const attemptsRepo = {
    create: jest.fn((data: Row) => data),
    save: jest.fn(async (data: Row) => ({ id: `att-${++attemptSeq}`, ...data })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => maxQb),
  };

  const channel: FakeChannel = {
    id: 'email',
    limits: { titleMax: 200, bodyMax: 20000 },
    describe: jest.fn().mockReturnValue({ available: true, provider: 'smtp' }),
    validateRecipient: jest.fn().mockReturnValue({ valid: true, normalizedAddress: 'maria@x.com' }),
    send: jest.fn().mockResolvedValue({ status: 'sent', provider: 'smtp', providerMessageId: 'pm-1' }),
  };
  const registry = { get: jest.fn(() => channel) };
  const config = { get: jest.fn((key: string) => options.config?.[key]) };
  const metrics = { recordNotificationAttempt: jest.fn(), setNotificationRecipientsDue: jest.fn() };

  const dispatcher = new NotificationDispatcherService(
    dataSource as never,
    messagesRepo as never,
    recipientsRepo as never,
    attemptsRepo as never,
    registry as never,
    config as never,
    metrics as never,
  );
  return { dispatcher, channel, qb, manager, messagesRepo, recipientsRepo, attemptsRepo, metrics, maxQb };
}

/** Mudanças gravadas no destinatário pelo fechamento da tentativa (1º UPDATE com where por id+processing). */
const closing = (recipientsRepo: { update: jest.Mock }): [Row, Row] => {
  const call = recipientsRepo.update.mock.calls.find(([where]) => where.status === 'processing');
  if (!call) throw new Error('nenhum UPDATE de fechamento da tentativa foi feito');
  return call as [Row, Row];
};

describe('NotificationDispatcherService', () => {
  describe('reivindicação (claim)', () => {
    it('reivindica com SKIP LOCKED, só pending/scheduled vencidos, mais prioritários primeiro', async () => {
      const { dispatcher, qb } = makeDispatcher();
      await dispatcher.processDue(10);

      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
      expect(qb.where).toHaveBeenCalledWith('r.status IN (:...statuses)', { statuses: ['pending', 'scheduled'] });
      expect(qb.andWhere.mock.calls[0][0]).toBe('r.nextAttemptAt <= :now');
      expect(qb.orderBy).toHaveBeenCalledWith('r.priorityRank', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('r.nextAttemptAt', 'ASC');
      expect(qb.limit).toHaveBeenCalledWith(10);
    });

    it('marca como processing e incrementa attempt_count na mesma transação', async () => {
      const { dispatcher, manager } = makeDispatcher({ rows: [recipient({ id: 'a' }), recipient({ id: 'b', status: 'scheduled' })] });
      await dispatcher.processDue();

      const [, where, changes] = manager.update.mock.calls[0];
      expect(where.id.value).toEqual(['a', 'b']);
      expect(changes.status).toBe('processing');
      expect(changes.lockedAt).toBeInstanceOf(Date);
      expect(changes.attemptCount()).toBe('attempt_count + 1');
    });

    it('dispatchMessage restringe a reivindicação à notificação', async () => {
      const { dispatcher, qb } = makeDispatcher();
      const outcome = await dispatcher.dispatchMessage('msg-1');
      expect(qb.andWhere).toHaveBeenCalledWith('r.notificationId = :notificationId', { notificationId: 'msg-1' });
      expect(outcome).toEqual({ claimed: 1 });
    });

    it('sem nada vencido não envia nem consulta mais nada', async () => {
      const { dispatcher, manager, channel, messagesRepo } = makeDispatcher({ rows: [] });
      await expect(dispatcher.processDue()).resolves.toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
      expect(channel.send).not.toHaveBeenCalled();
      expect(messagesRepo.find).not.toHaveBeenCalled();
    });

    it('publica o backlog (vencidos) como métrica a cada ciclo', async () => {
      const { dispatcher, metrics } = makeDispatcher({ rows: [] });
      await dispatcher.processDue();
      expect(metrics.setNotificationRecipientsDue).toHaveBeenCalledWith(4);
    });

    it('reivindicação inválida (estado que não pode virar processing) aborta antes de gravar', async () => {
      const { dispatcher, manager } = makeDispatcher({ rows: [recipient({ status: 'sent' })] });
      await expect(dispatcher.processDue()).rejects.toThrow('Transição de notificação inválida: sent → processing');
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('sucesso', () => {
    it('repassa ao canal o HTML pronto guardado na notificação (metadata.html)', async () => {
      const { dispatcher, channel } = makeDispatcher({
        rows: [recipient()],
        messages: [message({ metadata: { kind: 'score_alert', html: '<table>ok</table>' } })],
      });
      await dispatcher.processDue();
      expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ html: '<table>ok</table>' }));
    });

    it('sem HTML guardado, o canal recebe html nulo (faz a própria versão)', async () => {
      const { dispatcher, channel } = makeDispatcher({ rows: [recipient()] });
      await dispatcher.processDue();
      expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ html: null }));
    });

    it('grava sent com provedor e id do provedor; limpa erros e trava', async () => {
      const { dispatcher, recipientsRepo, attemptsRepo, metrics, channel } = makeDispatcher({
        rows: [recipient({ lastError: 'antigo' })],
      });
      await dispatcher.processDue();

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'msg-1',
          recipientId: 'rec-1',
          attemptNumber: 1,
          title: 'Assunto',
          body: 'Corpo',
          recipient: { userId: null, displayName: 'Maria', address: 'maria@x.com' },
        }),
      );
      const [where, changes] = closing(recipientsRepo);
      expect(where).toEqual({ id: 'rec-1', status: 'processing', attemptCount: 1 });
      expect(changes).toMatchObject({
        status: 'sent',
        provider: 'smtp',
        providerMessageId: 'pm-1',
        deliveredAt: null,
        lockedAt: null,
        lastErrorCategory: null,
        lastError: null,
        failedAt: null,
      });
      expect(changes.sentAt).toBeInstanceOf(Date);
      expect(attemptsRepo.update).toHaveBeenCalledWith(
        'att-1',
        expect.objectContaining({ status: 'success', provider: 'smtp', providerMessageId: 'pm-1', durationMs: expect.any(Number) }),
      );
      expect(metrics.recordNotificationAttempt).toHaveBeenCalledWith('email', 'smtp', 'success', expect.any(Number));
    });

    it('registra a tentativa ANTES de enviar (started) com número sequencial', async () => {
      const { dispatcher, attemptsRepo, channel, maxQb } = makeDispatcher();
      maxQb.getRawOne.mockResolvedValue({ max: '2' });
      const order: string[] = [];
      attemptsRepo.save.mockImplementation(async (d: Row) => {
        order.push('attempt-saved');
        return { id: 'att-x', ...d };
      });
      channel.send.mockImplementation(async () => {
        order.push('send');
        return { status: 'sent', provider: 'smtp', providerMessageId: null };
      });
      await dispatcher.processDue();
      expect(order).toEqual(['attempt-saved', 'send']);
      expect(attemptsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'rec-1', attemptNumber: 3, status: 'started' }),
      );
    });

    it('delivered (in_app) grava deliveredAt', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher();
      channel.send.mockResolvedValue({ status: 'delivered', provider: 'in_app', providerMessageId: 'inbox-1' });
      await dispatcher.processDue();
      const [, changes] = closing(recipientsRepo);
      expect(changes.status).toBe('delivered');
      expect(changes.deliveredAt).toBeInstanceOf(Date);
    });

    it('envia o endereço normalizado pelo canal', async () => {
      const { dispatcher, channel } = makeDispatcher({ rows: [recipient({ address: ' Maria@X.com ' })] });
      channel.validateRecipient.mockReturnValue({ valid: true, normalizedAddress: 'maria@x.com' });
      await dispatcher.processDue();
      expect(channel.send.mock.calls[0][0].recipient.address).toBe('maria@x.com');
    });

    it('atualiza o estado agregado da notificação ao final', async () => {
      const { dispatcher, messagesRepo } = makeDispatcher({ recipientStatuses: ['sent', 'sent'] });
      await dispatcher.processDue();
      expect(messagesRepo.update).toHaveBeenCalledWith('msg-1', { status: 'sent', completedAt: expect.any(Date) });
    });
  });

  describe('falhas e retentativa', () => {
    it('falha transitória na 1ª tentativa → volta a pending com nextAttemptAt no futuro (backoff)', async () => {
      const { dispatcher, recipientsRepo, attemptsRepo, metrics, channel } = makeDispatcher();
      channel.send.mockRejectedValue(new NotificationChannelError('SMTP respondeu 421.', 'transient'));
      const before = Date.now();
      await dispatcher.processDue();

      const [, changes] = closing(recipientsRepo);
      expect(changes).toMatchObject({
        status: 'pending',
        provider: 'smtp',
        lockedAt: null,
        lastErrorCategory: 'transient',
        lastError: 'SMTP respondeu 421.',
        failedAt: null,
      });
      // backoff 30 s ± 20 %
      const delay = (changes.nextAttemptAt as Date).getTime() - before;
      expect(delay).toBeGreaterThanOrEqual(23_000);
      expect(delay).toBeLessThanOrEqual(37_000);
      expect(attemptsRepo.update).toHaveBeenCalledWith(
        'att-1',
        expect.objectContaining({ status: 'failed', errorCategory: 'transient', provider: 'smtp' }),
      );
      expect(metrics.recordNotificationAttempt).toHaveBeenCalledWith('email', 'smtp', 'retry', expect.any(Number));
    });

    it('backoff cresce a cada tentativa (2ª tentativa ≈ 60 s)', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher({ rows: [recipient({ attemptCount: 1 })] });
      channel.send.mockRejectedValue(new NotificationChannelError('x', 'timeout'));
      const before = Date.now();
      await dispatcher.processDue();
      const [, changes] = closing(recipientsRepo);
      const delay = (changes.nextAttemptAt as Date).getTime() - before;
      expect(delay).toBeGreaterThanOrEqual(47_000);
      expect(delay).toBeLessThanOrEqual(73_000);
    });

    it('esgotou as tentativas → failed definitivo (sem nextAttemptAt)', async () => {
      const { dispatcher, recipientsRepo, metrics, channel } = makeDispatcher({ rows: [recipient({ attemptCount: 2 })] }); // vira 3 = maxAttempts
      channel.send.mockRejectedValue(new NotificationChannelError('x', 'transient'));
      await dispatcher.processDue();
      const [where, changes] = closing(recipientsRepo);
      expect(where.attemptCount).toBe(3);
      expect(changes.status).toBe('failed');
      expect(changes.failedAt).toBeInstanceOf(Date);
      expect(changes).not.toHaveProperty('nextAttemptAt');
      expect(metrics.recordNotificationAttempt).toHaveBeenCalledWith('email', 'smtp', 'failed', expect.any(Number));
    });

    it.each(['permanent', 'invalid_recipient', 'not_configured'] as const)(
      'falha %s → failed na 1ª tentativa, sem retentativa',
      async (category) => {
        const { dispatcher, recipientsRepo, channel } = makeDispatcher();
        channel.send.mockRejectedValue(new NotificationChannelError('recusado', category));
        await dispatcher.processDue();
        const [, changes] = closing(recipientsRepo);
        expect(changes).toMatchObject({ status: 'failed', lastErrorCategory: category });
      },
    );

    it('rate limit: respeita o Retry-After do provedor quando maior que o backoff', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher();
      channel.send.mockRejectedValue(new NotificationChannelError('429', 'rate_limited', { retryAfterMs: 120_000, httpStatus: 429 }));
      const before = Date.now();
      await dispatcher.processDue();
      const [, changes] = closing(recipientsRepo);
      expect(changes.status).toBe('pending');
      expect((changes.nextAttemptAt as Date).getTime() - before).toBeGreaterThanOrEqual(119_000);
    });

    it('guarda o status HTTP na tentativa', async () => {
      const { dispatcher, attemptsRepo, channel } = makeDispatcher();
      channel.send.mockRejectedValue(new NotificationChannelError('503', 'transient', { httpStatus: 503 }));
      await dispatcher.processDue();
      expect(attemptsRepo.update).toHaveBeenCalledWith('att-1', expect.objectContaining({ httpStatus: 503 }));
    });

    it('erro inesperado (bug do adapter) é classificado como unknown e retentado', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher();
      channel.send.mockRejectedValue(new TypeError('x is undefined'));
      await dispatcher.processDue();
      const [, changes] = closing(recipientsRepo);
      expect(changes).toMatchObject({ status: 'pending', lastErrorCategory: 'unknown' });
    });

    it('respeita a política da própria notificação (maxAttempts 1 = sem retentativa)', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher({ messages: [message({ maxAttempts: 1 })] });
      channel.send.mockRejectedValue(new NotificationChannelError('x', 'transient'));
      await dispatcher.processDue();
      expect(closing(recipientsRepo)[1].status).toBe('failed');
    });

    it('destinatário inválido na hora do envio falha sem chamar o provedor', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher();
      channel.validateRecipient.mockReturnValue({ valid: false, reason: 'Destinatário sem e-mail válido.' });
      await dispatcher.processDue();
      expect(channel.send).not.toHaveBeenCalled();
      expect(closing(recipientsRepo)[1]).toMatchObject({
        status: 'failed',
        lastErrorCategory: 'invalid_recipient',
        lastError: 'Destinatário sem e-mail válido.',
      });
    });

    it('sanitiza o erro antes de gravar: sem e-mail, telefone, URL ou segredo', async () => {
      const { dispatcher, recipientsRepo, attemptsRepo, channel } = makeDispatcher();
      channel.send.mockRejectedValue(
        new NotificationChannelError(
          'falha para maria@x.com (+55 85 99999-1234) em https://smtp.x.com/send?token=abc apikey=SEGREDO',
          'permanent',
        ),
      );
      await dispatcher.processDue();
      for (const text of [closing(recipientsRepo)[1].lastError, attemptsRepo.update.mock.calls[0][1].errorMessage]) {
        expect(text).not.toContain('maria@x.com');
        expect(text).not.toContain('99999');
        expect(text).not.toContain('smtp.x.com');
        expect(text).not.toContain('SEGREDO');
      }
    });

    it('timeout do provedor vira falha `timeout` retentável', async () => {
      const { dispatcher, recipientsRepo, channel } = makeDispatcher({ config: { NOTIFICATIONS_SEND_TIMEOUT_MS: '30' } });
      channel.send.mockImplementation(() => new Promise(() => undefined)); // nunca resolve
      await dispatcher.processDue();
      expect(closing(recipientsRepo)[1]).toMatchObject({ status: 'pending', lastErrorCategory: 'timeout' });
    });
  });

  describe('robustez', () => {
    it('resultado atrasado é ignorado quando a tentativa já foi reivindicada por outro (versão do attempt_count)', async () => {
      const { dispatcher, recipientsRepo, metrics } = makeDispatcher();
      recipientsRepo.update.mockResolvedValue({ affected: 0 });
      await dispatcher.processDue();
      expect(metrics.recordNotificationAttempt).not.toHaveBeenCalled();
    });

    it('falha ao registrar o resultado de UM destinatário não derruba os demais do lote', async () => {
      const { dispatcher, attemptsRepo, channel, recipientsRepo } = makeDispatcher({
        rows: [recipient({ id: 'a' }), recipient({ id: 'b' })],
      });
      attemptsRepo.save.mockRejectedValueOnce(new Error('banco indisponível'));
      await expect(dispatcher.processDue()).resolves.toBe(2);
      expect(channel.send).toHaveBeenCalledTimes(1); // só o 2º chegou a enviar
      expect(recipientsRepo.update.mock.calls.some(([w]) => w.id === 'b' && w.status === 'processing')).toBe(true);
    });

    it('limita a concorrência de envio', async () => {
      const rows = Array.from({ length: 7 }, (_, i) => recipient({ id: `r${i}` }));
      const { dispatcher, channel } = makeDispatcher({ rows, config: { NOTIFICATIONS_DISPATCH_CONCURRENCY: '3' } });
      let running = 0;
      let peak = 0;
      channel.send.mockImplementation(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return { status: 'sent', provider: 'smtp', providerMessageId: null };
      });
      await dispatcher.processDue();
      expect(channel.send).toHaveBeenCalledTimes(7);
      expect(peak).toBeLessThanOrEqual(3);
      expect(peak).toBeGreaterThan(1);
    });

    it('notificação inexistente para o destinatário não quebra o lote', async () => {
      const { dispatcher, channel } = makeDispatcher({ messages: [] });
      await expect(dispatcher.processDue()).resolves.toBe(1);
      expect(channel.send).not.toHaveBeenCalled();
    });
  });

  describe('estado agregado', () => {
    it('não escreve quando nada mudou', async () => {
      const { dispatcher, messagesRepo } = makeDispatcher({ recipientStatuses: ['pending'] });
      messagesRepo.findOne.mockResolvedValue({ id: 'msg-1', status: 'pending', completedAt: null });
      await dispatcher.refreshMessageStatus('msg-1');
      expect(messagesRepo.update).not.toHaveBeenCalled();
    });

    it('terminal grava completedAt; reabrir (reenvio) limpa completedAt', async () => {
      const { dispatcher, messagesRepo } = makeDispatcher({ recipientStatuses: ['sent', 'failed'] });
      messagesRepo.findOne.mockResolvedValue({ id: 'msg-1', status: 'pending', completedAt: null });
      await dispatcher.refreshMessageStatus('msg-1');
      expect(messagesRepo.update).toHaveBeenLastCalledWith('msg-1', { status: 'partially_sent', completedAt: expect.any(Date) });

      const done = new Date('2026-10-01T00:00:00Z');
      messagesRepo.findOne.mockResolvedValue({ id: 'msg-1', status: 'failed', completedAt: done });
      const reopened = makeDispatcher({ recipientStatuses: ['pending'] });
      reopened.messagesRepo.findOne.mockResolvedValue({ id: 'msg-1', status: 'failed', completedAt: done });
      await reopened.dispatcher.refreshMessageStatus('msg-1');
      expect(reopened.messagesRepo.update).toHaveBeenLastCalledWith('msg-1', { status: 'pending', completedAt: null });
    });

    it('preserva o completedAt original quando o status terminal só muda de tipo', async () => {
      const done = new Date('2026-10-01T00:00:00Z');
      const { dispatcher, messagesRepo } = makeDispatcher({ recipientStatuses: ['sent'] });
      messagesRepo.findOne.mockResolvedValue({ id: 'msg-1', status: 'failed', completedAt: done });
      await dispatcher.refreshMessageStatus('msg-1');
      expect(messagesRepo.update).toHaveBeenCalledWith('msg-1', { status: 'sent', completedAt: done });
    });

    it('ignora notificação sem destinatários ou removida', async () => {
      const { dispatcher, messagesRepo, recipientsRepo } = makeDispatcher();
      recipientsRepo.find.mockResolvedValue([]);
      await dispatcher.refreshMessageStatus('msg-1');
      expect(messagesRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('recuperação de destinatários travados (worker morreu)', () => {
    it('devolve à fila e marca a tentativa como abandonada', async () => {
      const { dispatcher, recipientsRepo, attemptsRepo, metrics } = makeDispatcher({ rows: [] });
      recipientsRepo.find.mockResolvedValueOnce([recipient({ id: 'stuck', status: 'processing', attemptCount: 1, provider: 'smtp' })]);
      await expect(dispatcher.recoverStale()).resolves.toBe(1);

      const [where, changes] = recipientsRepo.update.mock.calls[0];
      expect(where).toEqual({ id: 'stuck', status: 'processing', attemptCount: 1 });
      expect(changes).toMatchObject({ status: 'pending', lockedAt: null, lastErrorCategory: 'unknown', failedAt: null });
      expect(attemptsRepo.update).toHaveBeenCalledWith(
        { recipientId: 'stuck', status: 'started' },
        expect.objectContaining({ status: 'abandoned', errorCategory: 'unknown' }),
      );
      expect(metrics.recordNotificationAttempt).toHaveBeenCalledWith('email', 'smtp', 'abandoned', 0);
    });

    it('sem orçamento de tentativas, vira failed em vez de voltar à fila', async () => {
      const { dispatcher, recipientsRepo } = makeDispatcher({ rows: [] });
      recipientsRepo.find.mockResolvedValueOnce([recipient({ id: 'stuck', status: 'processing', attemptCount: 3 })]);
      await dispatcher.recoverStale();
      expect(recipientsRepo.update.mock.calls[0][1]).toMatchObject({ status: 'failed' });
      expect(recipientsRepo.update.mock.calls[0][1].failedAt).toBeInstanceOf(Date);
    });

    it('só recupera quem está parado além do limite (padrão 5 min, configurável)', async () => {
      const { dispatcher, recipientsRepo } = makeDispatcher({ rows: [], config: { NOTIFICATIONS_STALE_PROCESSING_MS: '60000' } });
      recipientsRepo.find.mockResolvedValueOnce([]);
      const before = Date.now();
      await dispatcher.recoverStale();
      const [{ where }] = recipientsRepo.find.mock.calls[0];
      expect(where.status).toBe('processing');
      expect(before - where.lockedAt.value.getTime()).toBeGreaterThanOrEqual(59_000);
      expect(before - where.lockedAt.value.getTime()).toBeLessThan(65_000);
    });

    it('não conta como recuperado se outro processamento resolveu primeiro', async () => {
      const { dispatcher, recipientsRepo, attemptsRepo } = makeDispatcher({ rows: [] });
      recipientsRepo.find.mockResolvedValueOnce([recipient({ id: 'stuck', status: 'processing', attemptCount: 1 })]);
      recipientsRepo.update.mockResolvedValueOnce({ affected: 0 });
      await expect(dispatcher.recoverStale()).resolves.toBe(0);
      expect(attemptsRepo.update).not.toHaveBeenCalled();
    });

    it('processDue sempre tenta recuperar antes de reivindicar', async () => {
      const { dispatcher, recipientsRepo } = makeDispatcher({ rows: [] });
      recipientsRepo.find.mockResolvedValue([]);
      await dispatcher.processDue();
      expect(recipientsRepo.find).toHaveBeenCalled();
    });
  });
});
