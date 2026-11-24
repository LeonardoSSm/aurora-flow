import { UserNoticeService } from './user-notice.service';

function makeService(): {
  service: UserNoticeService;
  notifications: { enqueue: jest.Mock; dispatch: jest.Mock };
  push: { sendToUsers: jest.Mock };
} {
  const notifications = {
    enqueue: jest.fn().mockResolvedValue({ message: { id: 'msg-1' }, recipients: [], created: true }),
    dispatch: jest.fn().mockResolvedValue({}),
  };
  const push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new UserNoticeService(notifications as never, push as never),
    notifications,
    push,
  };
}

const base = { kind: 'approval', title: 'Aprovação pendente', body: '"X" aguarda sua decisão.' };

describe('UserNoticeService', () => {
  it('vai para o sino (in_app, com link) e para o app, sem repetidos nem quem agiu', async () => {
    const { service, notifications, push } = makeService();

    await service.notify({
      ...base,
      userIds: ['u1', 'u2', 'u1', null, undefined, 'ator'],
      exceptUserIds: ['ator'],
      pushTitle: '✅ Aprovação pendente',
      link: '/aprovacoes?id=a1',
      solicitationId: 's1',
      pushData: { approvalId: 'a1' },
    });

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'in_app',
        title: 'Aprovação pendente',
        recipients: [
          { source: 'user', userId: 'u1' },
          { source: 'user', userId: 'u2' },
        ],
        origin: { solicitationId: 's1' },
        metadata: { kind: 'approval', link: '/aprovacoes?id=a1' },
        idempotencyKey: null,
      }),
    );
    expect(notifications.dispatch).toHaveBeenCalledWith('msg-1');
    expect(push.sendToUsers).toHaveBeenCalledWith(['u1', 'u2'], {
      title: '✅ Aprovação pendente',
      body: base.body,
      data: { type: 'approval', solicitationId: 's1', approvalId: 'a1' },
    });
  });

  it('ninguém para avisar (só quem agiu) → não faz nada', async () => {
    const { service, notifications, push } = makeService();
    await service.notify({ ...base, userIds: ['ator', null], exceptUserIds: ['ator'] });
    expect(notifications.enqueue).not.toHaveBeenCalled();
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  it('dedupeKey: mesma chave → mesma idempotencyKey (≤ 100 caracteres); já existente não despacha de novo', async () => {
    const { service, notifications } = makeService();
    notifications.enqueue.mockResolvedValue({ message: { id: 'msg-1' }, recipients: [], created: false });

    await service.notify({ ...base, userIds: ['u1'], dedupeKey: 'sla:s1:2026:breached' });
    await service.notify({ ...base, userIds: ['u1'], dedupeKey: 'sla:s1:2026:breached' });

    const [first, second] = notifications.enqueue.mock.calls.map((call) => call[0].idempotencyKey);
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(100);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('muitos destinatários (perfil grande) vão em lotes de 50', async () => {
    const { service, notifications } = makeService();
    const userIds = Array.from({ length: 120 }, (_, i) => `u${i}`);
    await service.notify({ ...base, userIds });
    expect(notifications.enqueue.mock.calls.map((call) => call[0].recipients.length)).toEqual([50, 50, 20]);
  });

  it('falha no sino não impede o push nem lança (a ação de origem segue)', async () => {
    const { service, notifications, push } = makeService();
    notifications.enqueue.mockRejectedValue(new Error('banco fora'));
    push.sendToUsers.mockRejectedValue(new Error('expo fora'));

    await expect(service.notify({ ...base, userIds: ['u1'] })).resolves.toBeUndefined();
    expect(push.sendToUsers).toHaveBeenCalled();
  });
});
