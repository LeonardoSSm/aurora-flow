import { MockWhatsAppProvider } from './mock-whatsapp.provider';

describe('MockWhatsAppProvider', () => {
  it('isConfigured sempre retorna false', () => {
    const provider = new MockWhatsAppProvider();

    expect(provider.isConfigured()).toBe(false);
  });

  it('sendMessage retorna mensagem mockada enviada', async () => {
    const provider = new MockWhatsAppProvider();

    const result = await provider.sendMessage({
      to: '5585999999999',
      message: 'Mensagem de teste',
    });

    expect(result.status).toBe('sent');
    expect(result.messageId).toMatch(/^mock-/);
  });
});
