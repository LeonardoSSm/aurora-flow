import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { NotificationChannelError } from '../domain/notification-errors';
import { inlineImagesFor } from '../email-assets/email-inline-images';
import { EmailChannel } from './email.channel';
import type { NotificationDeliveryRequest } from './notification-channel';

type MailerMock = {
  isConfigured: jest.Mock;
  sendDetailed: jest.Mock;
};

function makeChannel(
  options: { configured?: boolean; env?: Record<string, string | undefined> } = {},
) {
  const mailer: MailerMock = {
    isConfigured: jest.fn().mockReturnValue(options.configured ?? true),
    sendDetailed: jest.fn().mockResolvedValue({
      messageId: '<provider-id@smtp>',
      accepted: ['maria@x.com'],
      rejected: [],
    }),
  };
  const env: Record<string, string | undefined> = { NODE_ENV: 'test', ...(options.env ?? {}) };
  const config = { get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback) };
  // Imagem enviada pela tela (banco): só "img-1" existe.
  const emailImages = {
    getContent: jest.fn(async (id: string) =>
      id === 'img-1' ? { content: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png', name: 'arte.png' } : null,
    ),
  };
  return { channel: new EmailChannel(mailer as never, config as never, emailImages as never), mailer, emailImages };
}

const request = (overrides: Partial<NotificationDeliveryRequest> = {}): NotificationDeliveryRequest => ({
  notificationId: 'notif-1',
  recipientId: 'rec-1',
  attemptNumber: 1,
  title: 'Seu pedido foi aprovado',
  body: 'Olá Maria,\nseu pedido foi aprovado.',
  priority: 'normal',
  recipient: { userId: null, displayName: 'Maria', address: 'Maria@X.com' },
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

describe('EmailChannel (contrato)', () => {
  const originalFrom = process.env.SMTP_FROM;
  afterEach(() => {
    if (originalFrom === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = originalFrom;
  });

  describe('destinatário', () => {
    it('normaliza e valida o e-mail', () => {
      const { channel } = makeChannel();
      expect(channel.validateRecipient({ userId: null, displayName: null, address: ' Maria@X.COM ' })).toEqual({
        valid: true,
        normalizedAddress: 'maria@x.com',
      });
      for (const address of [null, '', 'sem-arroba', 'a@b', 'a@b.com, c@d.com']) {
        expect(channel.validateRecipient({ userId: 'u', displayName: null, address }).valid).toBe(false);
      }
    });

    it('falha como invalid_recipient (sem chamar o SMTP) se o e-mail for inválido', async () => {
      const { channel, mailer } = makeChannel();
      const error = await failureOf(
        channel.send(request({ recipient: { userId: null, displayName: null, address: 'nao-e-email' } })),
      );
      expect(error.category).toBe('invalid_recipient');
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
    });
  });

  describe('payload enviado ao provedor', () => {
    it('envia para o endereço normalizado, com texto original e HTML escapado', async () => {
      const { channel, mailer } = makeChannel();
      await channel.send(request({ body: 'Oi <b>Maria</b> & "amigos"\n<script>alert(1)</script>' }));

      const sent = mailer.sendDetailed.mock.calls[0][0];
      expect(sent.to).toEqual(['maria@x.com']);
      expect(sent.subject).toBe('Seu pedido foi aprovado');
      expect(sent.text).toBe('Oi <b>Maria</b> & "amigos"\n<script>alert(1)</script>');
      expect(sent.html).toContain('Oi &lt;b&gt;Maria&lt;/b&gt; &amp; &quot;amigos&quot;');
      expect(sent.html).not.toContain('<script>');
      expect(sent.html).not.toContain('<b>');
      expect(sent.html.startsWith('<div')).toBe(true);
    });

    it('usa o HTML pronto do sistema quando vier (ex.: aviso de pontuação), com o texto puro junto', async () => {
      const { channel, mailer } = makeChannel();
      await channel.send(request({ body: 'Texto puro', html: '<table><tr><td>Formatado</td></tr></table>' }));

      const sent = mailer.sendDetailed.mock.calls[0][0];
      expect(sent.html).toBe('<table><tr><td>Formatado</td></tr></table>');
      expect(sent.text).toBe('Texto puro');
    });

    it('anexa as imagens do sistema que o HTML referencia por cid (só arquivo que existe; nenhuma no texto comum)', async () => {
      const { channel, mailer } = makeChannel();
      await channel.send(
        request({ body: 'Texto', html: `<td background="cid:tijuca-fundo-57anos" style="background-image:url('cid:tijuca-fundo-57anos')"><img src="cid:desconhecida">` }),
      );
      const [anexo, ...resto] = mailer.sendDetailed.mock.calls[0][0].attachments;
      expect(resto).toEqual([]); // repetida conta uma vez; desconhecida fica de fora
      expect(anexo).toEqual(
        expect.objectContaining({ cid: 'tijuca-fundo-57anos', contentType: 'image/jpeg', filename: 'email-fundo-57anos.jpg' }),
      );
      expect(readFileSync(anexo.path).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG de verdade

      await channel.send(request({ body: 'cid:tijuca-fundo-57anos só como texto' }));
      expect(mailer.sendDetailed.mock.calls[1][0].attachments).toEqual([]);
    });

    it('anexa a imagem enviada pela tela (banco) que o HTML referencia; a que não existe mais fica de fora', async () => {
      const { channel, mailer } = makeChannel();
      await channel.send(
        request({ body: 'Texto', html: `<td background="cid:email-image-img-1"><td background="cid:email-image-apagada">` }),
      );
      const { attachments } = mailer.sendDetailed.mock.calls[0][0];
      expect(attachments).toEqual([
        { cid: 'email-image-img-1', filename: 'imagem.png', contentType: 'image/png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      ]);
    });

    it('imagem registrada que não está no disco fica de fora (o e-mail sai com o fundo de cor)', () => {
      expect(inlineImagesFor('<td background="cid:tijuca-fundo-57anos">', tmpdir())).toEqual([]);
    });

    it('o assunto nunca tem quebra de linha (anti header-injection)', async () => {
      const { channel, mailer } = makeChannel();
      await channel.send(request({ title: 'Oi\r\nBcc: espiao@x.com' }));
      const { subject } = mailer.sendDetailed.mock.calls[0][0];
      expect(subject).not.toMatch(/[\r\n]/);
      expect(subject).toBe('Oi Bcc: espiao@x.com');
    });

    it('usa assunto padrão quando o título é vazio e respeita o limite do canal', async () => {
      const { channel, mailer } = makeChannel();
      await channel.send(request({ title: null }));
      expect(mailer.sendDetailed.mock.calls[0][0].subject).toBe('Notificação');
      await channel.send(request({ title: 'a'.repeat(500) }));
      expect(mailer.sendDetailed.mock.calls[1][0].subject).toHaveLength(channel.limits.titleMax);
    });

    it('Message-ID é estável por destinatário (mesmo id em reenvios) e usa o domínio do remetente', async () => {
      process.env.SMTP_FROM = 'Tijuca Flow <no-reply@tijuca.com.br>';
      const { channel, mailer } = makeChannel();
      await channel.send(request({ attemptNumber: 1 }));
      await channel.send(request({ attemptNumber: 2 }));
      const [first, second] = mailer.sendDetailed.mock.calls.map((c) => c[0].messageId);
      expect(first).toBe('<notification-rec-1@tijuca.com.br>');
      expect(second).toBe(first);
    });

    it('Message-ID cai para um domínio padrão sem SMTP_FROM', async () => {
      delete process.env.SMTP_FROM;
      const { channel, mailer } = makeChannel();
      await channel.send(request());
      expect(mailer.sendDetailed.mock.calls[0][0].messageId).toMatch(/^<notification-rec-1@[^>]+>$/);
    });
  });

  describe('resultado', () => {
    it('aceito pelo SMTP → sent com o Message-ID devolvido', async () => {
      const { channel } = makeChannel();
      await expect(channel.send(request())).resolves.toEqual({
        status: 'sent',
        provider: 'smtp',
        providerMessageId: '<provider-id@smtp>',
      });
    });

    it('endereço recusado pelo servidor → invalid_recipient (permanente)', async () => {
      const { channel, mailer } = makeChannel();
      mailer.sendDetailed.mockResolvedValue({ messageId: null, accepted: [], rejected: ['maria@x.com'] });
      const error = await failureOf(channel.send(request()));
      expect(error.category).toBe('invalid_recipient');
    });
  });

  describe('erros do provedor (classificação)', () => {
    it.each([
      [{ code: 'EAUTH' }, 'not_configured'],
      [{ code: 'EENVELOPE' }, 'invalid_recipient'],
      [{ responseCode: 550 }, 'invalid_recipient'],
      [{ responseCode: 421 }, 'transient'],
      [{ responseCode: 451 }, 'transient'],
      [{ responseCode: 554 }, 'permanent'],
      [{ code: 'ETIMEDOUT' }, 'timeout'],
      [{ code: 'ECONNECTION' }, 'transient'],
      [{ code: 'ECONNRESET' }, 'transient'],
      [new Error('algo inesperado'), 'unknown'],
    ])('%j → %s', async (thrown, category) => {
      const { channel, mailer } = makeChannel();
      mailer.sendDetailed.mockRejectedValue(thrown);
      const error = await failureOf(channel.send(request()));
      expect(error).toBeInstanceOf(NotificationChannelError);
      expect(error.category).toBe(category);
    });

    it('a mensagem do erro não vaza o endereço do destinatário', async () => {
      const { channel, mailer } = makeChannel();
      mailer.sendDetailed.mockRejectedValue({ code: 'EENVELOPE', message: 'No recipients: maria@x.com' });
      const error = await failureOf(channel.send(request()));
      expect(error.message).not.toContain('maria@x.com');
    });
  });

  describe('SMTP não configurado', () => {
    it('fora de produção: modo simulado — não chama o SMTP e marca o provedor como `log`', async () => {
      const { channel, mailer } = makeChannel({ configured: false });
      await expect(channel.send(request())).resolves.toEqual({
        status: 'sent',
        provider: 'log',
        providerMessageId: null,
      });
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
      expect(channel.describe()).toMatchObject({ available: false, provider: 'log' });
    });

    it('em produção: FALHA com not_configured (nunca finge envio)', async () => {
      const { channel, mailer } = makeChannel({ configured: false, env: { NODE_ENV: 'production' } });
      const error = await failureOf(channel.send(request()));
      expect(error.category).toBe('not_configured');
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
    });

    it('em produção, só vira simulado se NOTIFICATIONS_ALLOW_MOCK_PROVIDERS=true for explícito', async () => {
      const { channel } = makeChannel({
        configured: false,
        env: { NODE_ENV: 'production', NOTIFICATIONS_ALLOW_MOCK_PROVIDERS: 'true' },
      });
      await expect(channel.send(request())).resolves.toMatchObject({ provider: 'log' });
    });

    it('fora de produção, NOTIFICATIONS_ALLOW_MOCK_PROVIDERS=false força a falha', async () => {
      const { channel } = makeChannel({ configured: false, env: { NOTIFICATIONS_ALLOW_MOCK_PROVIDERS: 'false' } });
      const error = await failureOf(channel.send(request()));
      expect(error.category).toBe('not_configured');
    });
  });

  it('describe() informa SMTP quando configurado', () => {
    expect(makeChannel({ configured: true }).channel.describe()).toEqual({ available: true, provider: 'smtp' });
  });
});
