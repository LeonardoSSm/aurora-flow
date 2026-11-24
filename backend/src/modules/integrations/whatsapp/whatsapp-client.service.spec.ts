import { WhatsAppClientService } from './whatsapp-client.service';
import type { IWhatsAppProvider } from './whatsapp-provider.interface';

function makeProvider(overrides: Partial<IWhatsAppProvider> = {}): jest.Mocked<IWhatsAppProvider> {
  return {
    sendMessage: jest.fn(),
    isConfigured: jest.fn(() => false),
    ...overrides,
  } as jest.Mocked<IWhatsAppProvider>;
}

describe('WhatsAppClientService', () => {
  it('send chama provider.sendMessage com os dados corretos', async () => {
    const provider = makeProvider();
    provider.sendMessage.mockResolvedValue({ messageId: 'msg-id', status: 'sent' });
    const service = new WhatsAppClientService(provider);

    await expect(
      service.send({ to: '5585999999999', message: 'Olá', sessionId: 'session-1' }),
    ).resolves.toEqual({ messageId: 'msg-id', status: 'sent' });

    expect(provider.sendMessage).toHaveBeenCalledWith({
      to: '5585999999999',
      message: 'Olá',
      sessionId: 'session-1',
    });
  });

  it('send em falha do provider retorna failed e não lança', async () => {
    const provider = makeProvider();
    provider.sendMessage.mockRejectedValue(new Error('provider offline'));
    const service = new WhatsAppClientService(provider);

    await expect(service.send({ to: '5585999999999', message: 'Teste' })).resolves.toEqual({
      messageId: null,
      status: 'failed',
      error: 'provider offline',
    });
  });

  it('isAvailable retorna false quando provider é mock', () => {
    const provider = makeProvider({ isConfigured: jest.fn(() => false) });
    const service = new WhatsAppClientService(provider);

    expect(service.isAvailable()).toBe(false);
    expect(provider.isConfigured).toHaveBeenCalled();
  });
});
