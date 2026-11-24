import type { NotificationMessageEntity } from '../../../database/entities';
import { toNotificationView, type NotificationMessageView } from './notification.presenter';

function recipientOf(view: NotificationMessageView, id: string): NotificationMessageView['recipients'][number] {
  const found = view.recipients.find((r) => r.id === id);
  if (!found) throw new Error(`destinatário ${id} não encontrado na projeção`);
  return found;
}

function entity(): NotificationMessageEntity {
  const createdAt = new Date('2026-10-05T12:00:00Z');
  return {
    id: 'msg-1',
    channel: 'email',
    status: 'partially_sent',
    priority: 'high',
    title: 'Assunto confidencial',
    body: 'Corpo com dados do processo',
    scheduledFor: null,
    flowId: 'flow-1',
    flowExecutionId: 'exec-1',
    nodeId: 'n1',
    solicitationId: 'sol-1',
    maxAttempts: 3,
    createdAt,
    completedAt: null,
    cancelledAt: null,
    metadata: { missingVariables: ['x', 7], deliveryMode: 'immediate' },
    recipients: [
      {
        id: 'r2',
        source: 'custom',
        userId: null,
        displayName: 'João',
        address: 'joao@empresa.com',
        status: 'failed',
        attemptCount: 3,
        provider: 'smtp',
        providerMessageId: null,
        lastErrorCategory: 'timeout',
        lastError: 'Tempo esgotado ao enviar.',
        nextAttemptAt: new Date('2026-10-05T12:05:00Z'),
        sentAt: null,
        deliveredAt: null,
        failedAt: new Date('2026-10-05T12:06:00Z'),
        cancelledAt: null,
        createdAt: new Date('2026-10-05T12:00:02Z'),
        attempts: [
          { attemptNumber: 2, status: 'failed', provider: 'smtp', errorCategory: 'timeout', errorMessage: 'x', httpStatus: null, startedAt: createdAt, finishedAt: createdAt, durationMs: 5 },
          { attemptNumber: 1, status: 'failed', provider: 'smtp', errorCategory: 'timeout', errorMessage: 'x', httpStatus: null, startedAt: createdAt, finishedAt: createdAt, durationMs: 9 },
        ],
      },
      {
        id: 'r1',
        source: 'user',
        userId: 'u-1',
        displayName: 'Maria Souza',
        address: 'maria.souza@empresa.com',
        status: 'sent',
        attemptCount: 1,
        provider: 'smtp',
        providerMessageId: '<abc@smtp>',
        lastErrorCategory: null,
        lastError: null,
        nextAttemptAt: createdAt,
        sentAt: createdAt,
        deliveredAt: null,
        failedAt: null,
        cancelledAt: null,
        createdAt: new Date('2026-10-05T12:00:01Z'),
      },
    ],
  } as unknown as NotificationMessageEntity;
}

describe('toNotificationView', () => {
  describe('quem pode gerenciar (flows.manage)', () => {
    it('vê conteúdo, nomes, endereços e o id do provedor', () => {
      const view = toNotificationView(entity(), { canViewDetails: true });
      expect(view).toMatchObject({ title: 'Assunto confidencial', body: 'Corpo com dados do processo' });
      const maria = recipientOf(view, 'r1');
      expect(maria).toMatchObject({
        displayName: 'Maria Souza',
        address: 'maria.souza@empresa.com',
        providerMessageId: '<abc@smtp>',
      });
    });
  });

  describe('quem só pode ver (flows.view)', () => {
    const view = toNotificationView(entity(), { canViewDetails: false });

    it('NÃO recebe título nem corpo', () => {
      expect(view.title).toBeNull();
      expect(view.body).toBeNull();
    });

    it('recebe endereços mascarados, sem nome e sem id do provedor', () => {
      const maria = recipientOf(view, 'r1');
      expect(maria.address).toBe('ma***@empresa.com');
      expect(maria.displayName).toBeNull();
      expect(maria.providerMessageId).toBeNull();
      const json = JSON.stringify(view);
      expect(json).not.toContain('maria.souza@empresa.com');
      expect(json).not.toContain('joao@empresa.com');
      expect(json).not.toContain('Assunto confidencial');
      expect(json).not.toContain('Maria Souza');
    });

    it('mas continua vendo estados, erros e métricas de entrega', () => {
      expect(view.status).toBe('partially_sent');
      const joao = recipientOf(view, 'r2');
      expect(joao).toMatchObject({
        status: 'failed',
        lastErrorCategory: 'timeout',
        lastError: 'Tempo esgotado ao enviar.',
        attemptCount: 3,
        provider: 'smtp',
      });
    });
  });

  it('ordena os destinatários por criação e as tentativas por número', () => {
    const view = toNotificationView(entity(), { canViewDetails: true });
    expect(view.recipients.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(view.recipients[1].attempts?.map((a) => a.attemptNumber)).toEqual([1, 2]);
    expect(view.recipients[0].attempts).toBeUndefined();
  });

  it('expõe correlação com a origem e só variáveis ausentes textuais', () => {
    const view = toNotificationView(entity(), { canViewDetails: false });
    expect(view).toMatchObject({ flowId: 'flow-1', flowExecutionId: 'exec-1', nodeId: 'n1', solicitationId: 'sol-1' });
    expect(view.missingVariables).toEqual(['x']);
  });

  it('endereço ausente permanece nulo (não vira string vazia mascarada)', () => {
    const e = entity();
    e.recipients[0].address = null;
    expect(recipientOf(toNotificationView(e, { canViewDetails: false }), 'r2').address).toBeNull();
  });

  it('não devolve campos internos da entidade', () => {
    const view = toNotificationView(entity(), { canViewDetails: true }) as unknown as Record<string, unknown>;
    expect(view).not.toHaveProperty('metadata');
    expect(view).not.toHaveProperty('idempotencyKey');
    expect(view.recipients).toBeDefined();
    const recipient = (view.recipients as Array<Record<string, unknown>>)[0];
    expect(recipient).not.toHaveProperty('recipientKey');
    expect(recipient).not.toHaveProperty('lockedAt');
  });
});
