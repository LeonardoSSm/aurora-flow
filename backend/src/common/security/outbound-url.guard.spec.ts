import { assertSafeOutboundUrl } from './outbound-url.guard';

describe('assertSafeOutboundUrl', () => {
  const previous = process.env.HTTP_ALLOW_PRIVATE_URLS;

  afterEach(() => {
    if (previous === undefined) delete process.env.HTTP_ALLOW_PRIVATE_URLS;
    else process.env.HTTP_ALLOW_PRIVATE_URLS = previous;
  });

  it('recusa loopback e metadados', async () => {
    delete process.env.HTTP_ALLOW_PRIVATE_URLS;
    await expect(assertSafeOutboundUrl('http://127.0.0.1/x')).rejects.toThrow(/privado|interna/i);
    await expect(assertSafeOutboundUrl('http://localhost/x')).rejects.toThrow(/interna/i);
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest')).rejects.toThrow(/privado/i);
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow(/http/i);
  });

  it('aceita https público', async () => {
    delete process.env.HTTP_ALLOW_PRIVATE_URLS;
    await expect(assertSafeOutboundUrl('https://example.com/hook')).resolves.toBeUndefined();
  });

  it('HTTP_ALLOW_PRIVATE_URLS libera loopback para testes locais', async () => {
    process.env.HTTP_ALLOW_PRIVATE_URLS = 'true';
    await expect(assertSafeOutboundUrl('http://127.0.0.1:9/hook')).resolves.toBeUndefined();
  });
});
