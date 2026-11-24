import { NotificationChannelError } from '../domain/notification-errors';
import type { NotificationDeliveryRequest } from './notification-channel';
import { WhatsAppChannel } from './whatsapp.channel';

function makeChannel(
  options: { available?: boolean; env?: Record<string, string | undefined> } = {},
) {
  const client = {
    isAvailable: jest.fn().mockReturnValue(options.available ?? true),
    sendOrThrow: jest.fn().mockResolvedValue({ messageId: 'wa-123', status: 'sent' }),
  };
  const env: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    WHATSAPP_PROVIDER: 'evolution',
    ...(options.env ?? {}),
  };
  const config = { get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback) };
  return { channel: new WhatsAppChannel(client as never, config as never), client };
}

const request = (overrides: Partial<NotificationDeliveryRequest> = {}): NotificationDeliveryRequest => ({
  notificationId: 'notif-1',
  recipientId: 'rec-1',
  attemptNumber: 1,
  title: null,
  body: 'Sua solicitação foi atualizada.',
  priority: 'normal',
  recipient: { userId: null, displayName: 'Maria', address: '(85) 99999-1234' },
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

const axiosError = (status?: number, extra: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  message: 'Request failed',
  ...(status ? { response: { status, headers: {} } } : {}),
  ...extra,
});

describe('WhatsAppChannel (contrato)', () => {
  describe('destinatário', () => {
    it('normaliza para dígitos com DDI 55', () => {
      const { channel } = makeChannel();
      expect(channel.validateRecipient({ userId: null, displayName: null, address: '(85) 99999-1234' })).toEqual({
        valid: true,
        normalizedAddress: '5585999991234',
      });
      expect(channel.validateRecipient({ userId: null, displayName: null, address: '+55 85 99999-1234' })).toMatchObject({
        normalizedAddress: '5585999991234',
      });
    });

    it.each([null, '', 'abc', '123'])('rejeita %p', (address) => {
      const { channel } = makeChannel();
      expect(channel.validateRecipient({ userId: 'u', displayName: null, address }).valid).toBe(false);
    });

    it('aceita o grupo pelo JID da Evolution, sem mexer nele', () => {
      const { channel } = makeChannel();
      expect(
        channel.validateRecipient({ userId: null, displayName: null, address: '120363025246125486@g.us' }),
      ).toEqual({ valid: true, normalizedAddress: '120363025246125486@g.us' });
    });

    it('respeita NOTIFICATIONS_DEFAULT_COUNTRY_CODE', () => {
      const { channel } = makeChannel({ env: { NOTIFICATIONS_DEFAULT_COUNTRY_CODE: '351' } });
      expect(channel.validateRecipient({ userId: null, displayName: null, address: '912345678' })).toMatchObject({
        normalizedAddress: '351912345678',
      });
    });

    it('telefone inválido falha como invalid_recipient sem chamar o provedor', async () => {
      const { channel, client } = makeChannel();
      const error = await failureOf(channel.send(request({ recipient: { userId: 'u', displayName: null, address: null } })));
      expect(error.category).toBe('invalid_recipient');
      expect(client.sendOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('payload enviado ao provedor', () => {
    it('envia para o grupo com o JID no destino', async () => {
      const { channel, client } = makeChannel();
      await channel.send(
        request({ recipient: { userId: null, displayName: null, address: '120363025246125486@g.us' } }),
      );
      expect(client.sendOrThrow).toHaveBeenCalledWith({
        to: '120363025246125486@g.us',
        message: 'Sua solicitação foi atualizada.',
      });
    });

    it('envia número normalizado e a mensagem', async () => {
      const { channel, client } = makeChannel();
      await channel.send(request());
      expect(client.sendOrThrow).toHaveBeenCalledWith({
        to: '5585999991234',
        message: 'Sua solicitação foi atualizada.',
      });
    });

    it('com título, usa-o em negrito na primeira linha', async () => {
      const { channel, client } = makeChannel();
      await channel.send(request({ title: 'Aprovação' }));
      expect(client.sendOrThrow.mock.calls[0][0].message).toBe('*Aprovação*\nSua solicitação foi atualizada.');
    });
  });

  describe('resultado', () => {
    it('sent → sent com o id do provedor', async () => {
      const { channel } = makeChannel();
      await expect(channel.send(request())).resolves.toEqual({
        status: 'sent',
        provider: 'evolution',
        providerMessageId: 'wa-123',
      });
    });

    it('queued (aceito para envio) conta como sent', async () => {
      const { channel, client } = makeChannel();
      client.sendOrThrow.mockResolvedValue({ messageId: 'wa-9', status: 'queued' });
      await expect(channel.send(request())).resolves.toMatchObject({ status: 'sent', providerMessageId: 'wa-9' });
    });

    it('failed devolvido pelo provedor → permanent, com erro sanitizado', async () => {
      const { channel, client } = makeChannel();
      client.sendOrThrow.mockResolvedValue({
        messageId: null,
        status: 'failed',
        error: 'numero 5585999991234 nao existe, apikey=SEGREDO',
      });
      const error = await failureOf(channel.send(request()));
      expect(error.category).toBe('permanent');
      expect(error.message).not.toContain('5585999991234');
      expect(error.message).not.toContain('SEGREDO');
    });
  });

  describe('erros do provedor (classificação)', () => {
    it('429 → rate_limited, respeitando Retry-After', async () => {
      const { channel, client } = makeChannel();
      client.sendOrThrow.mockRejectedValue({ isAxiosError: true, response: { status: 429, headers: { 'retry-after': '30' } } });
      const error = await failureOf(channel.send(request()));
      expect(error.category).toBe('rate_limited');
      expect(error.retryAfterMs).toBe(30_000);
      expect(error.httpStatus).toBe(429);
    });

    it.each([
      [axiosError(500), 'transient'],
      [axiosError(502), 'transient'],
      [axiosError(503), 'transient'],
      [axiosError(408), 'timeout'],
      [axiosError(400), 'permanent'],
      [axiosError(404), 'permanent'],
      [axiosError(401), 'not_configured'],
      [axiosError(403), 'not_configured'],
      [axiosError(undefined, { code: 'ECONNABORTED' }), 'timeout'],
      [axiosError(undefined, { code: 'ETIMEDOUT' }), 'timeout'],
      [axiosError(undefined, { code: 'ECONNREFUSED' }), 'transient'],
      [axiosError(undefined, { code: 'ENOTFOUND' }), 'transient'],
      [new Error('algo inesperado'), 'unknown'],
    ])('%j → %s', async (thrown, category) => {
      const { channel, client } = makeChannel();
      client.sendOrThrow.mockRejectedValue(thrown);
      const error = await failureOf(channel.send(request()));
      expect(error).toBeInstanceOf(NotificationChannelError);
      expect(error.category).toBe(category);
    });
  });

  describe('provedor não configurado (mock)', () => {
    it('fora de produção: usa o provedor simulado e grava `mock` como provedor', async () => {
      const { channel, client } = makeChannel({ available: false });
      await expect(channel.send(request())).resolves.toMatchObject({ status: 'sent', provider: 'mock' });
      expect(client.sendOrThrow).toHaveBeenCalledTimes(1);
      expect(channel.describe()).toMatchObject({ available: false, provider: 'mock' });
    });

    it('em produção: FALHA com not_configured (não deixa o mock “enviar”)', async () => {
      const { channel, client } = makeChannel({ available: false, env: { NODE_ENV: 'production' } });
      const error = await failureOf(channel.send(request()));
      expect(error.category).toBe('not_configured');
      expect(client.sendOrThrow).not.toHaveBeenCalled();
    });

    it('em produção, só com NOTIFICATIONS_ALLOW_MOCK_PROVIDERS=true explícito', async () => {
      const { channel } = makeChannel({
        available: false,
        env: { NODE_ENV: 'production', NOTIFICATIONS_ALLOW_MOCK_PROVIDERS: 'true' },
      });
      await expect(channel.send(request())).resolves.toMatchObject({ provider: 'mock' });
    });
  });

  it('describe() informa o provedor configurado', () => {
    expect(makeChannel({ available: true }).channel.describe()).toEqual({ available: true, provider: 'evolution' });
  });
});
