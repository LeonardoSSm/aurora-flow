import type { NotificationChannelError } from '../domain/notification-errors';
import { InAppChannel } from './in-app.channel';
import type { NotificationDeliveryRequest } from './notification-channel';

function makeChannel(user: { id: string; isActive: boolean } | null = { id: 'u-1', isActive: true }) {
  const inbox = {
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    save: jest.fn((data: Record<string, unknown>) => Promise.resolve({ id: 'inbox-1', ...data })),
  };
  const users = { findOne: jest.fn().mockResolvedValue(user) };
  return { channel: new InAppChannel(inbox as never, users as never), inbox, users };
}

const request = (overrides: Partial<NotificationDeliveryRequest> = {}): NotificationDeliveryRequest => ({
  notificationId: 'notif-1',
  recipientId: 'rec-1',
  attemptNumber: 1,
  title: 'Nova aprovação',
  body: 'Você tem uma aprovação pendente.',
  priority: 'normal',
  recipient: { userId: 'u-1', displayName: 'Maria', address: null },
  ...overrides,
});

async function failureOf(promise: Promise<unknown>): Promise<NotificationChannelError> {
  try {
    await promise;
  } catch (error) {
    return error as NotificationChannelError;
  }
  throw new Error('esperava falha');
}

describe('InAppChannel (contrato)', () => {
  it('só aceita destinatário com usuário do sistema', () => {
    const { channel } = makeChannel();
    expect(channel.validateRecipient({ userId: 'u-1', displayName: null, address: null }).valid).toBe(true);
    const invalid = channel.validateRecipient({ userId: null, displayName: null, address: 'x@x.com' });
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toBeDefined();
  });

  it('grava na caixa de entrada do usuário e devolve `delivered` com o id da linha', async () => {
    const { channel, inbox } = makeChannel();
    await expect(channel.send(request())).resolves.toEqual({
      status: 'delivered',
      provider: 'in_app',
      providerMessageId: 'inbox-1',
    });
    expect(inbox.save).toHaveBeenCalledWith({
      userId: 'u-1',
      title: 'Nova aprovação',
      message: 'Você tem uma aprovação pendente.',
      link: null,
    });
  });

  it('grava o link interno que o aviso abre; endereço externo é descartado', async () => {
    const { channel, inbox } = makeChannel();
    await channel.send(request({ link: '/aprovacoes?id=a1' }));
    expect(inbox.save.mock.calls[0][0].link).toBe('/aprovacoes?id=a1');

    for (const link of ['https://evil.example', '//evil.example', '/\\evil.example','javascript:alert(1)']) {
      inbox.save.mockClear();
      await channel.send(request({ link }));
      expect(inbox.save.mock.calls[0][0].link).toBeNull();
    }
  });

  it('respeita os limites das colunas (title 150, message 500)', async () => {
    const { channel, inbox } = makeChannel();
    await channel.send(request({ title: 't'.repeat(400), body: 'm'.repeat(900) }));
    const saved = inbox.save.mock.calls[0][0];
    expect(saved.title).toHaveLength(150);
    expect(saved.message).toHaveLength(500);
  });

  it('título ausente grava null', async () => {
    const { channel, inbox } = makeChannel();
    await channel.send(request({ title: null }));
    expect(inbox.save.mock.calls[0][0].title).toBeNull();
  });

  it.each([
    ['usuário inexistente', null],
    ['usuário inativo', { id: 'u-1', isActive: false }],
  ])('%s → invalid_recipient e nada é gravado', async (_name, user) => {
    const { channel, inbox } = makeChannel(user);
    const error = await failureOf(channel.send(request()));
    expect(error.category).toBe('invalid_recipient');
    expect(inbox.save).not.toHaveBeenCalled();
  });

  it('sem userId → invalid_recipient', async () => {
    const { channel } = makeChannel();
    const error = await failureOf(channel.send(request({ recipient: { userId: null, displayName: null, address: null } })));
    expect(error.category).toBe('invalid_recipient');
  });

  it('está sempre disponível (não depende de provedor externo)', () => {
    expect(makeChannel().channel.describe()).toEqual({ available: true, provider: 'in_app' });
  });
});
