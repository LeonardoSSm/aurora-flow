import * as crypto from 'crypto';
import { HmacService } from './hmac.service';

describe('HmacService', () => {
  let service: HmacService;

  beforeEach(() => {
    service = new HmacService();
  });

  it('sign produz o mesmo output para o mesmo input', () => {
    const first = service.sign('secret', '{"ok":true}');
    const second = service.sign('secret', '{"ok":true}');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verify retorna true para assinatura valida', () => {
    const signature = service.sign('secret', 'payload');

    expect(service.verify('secret', 'payload', `sha256=${signature}`)).toBe(true);
  });

  it('verify retorna false para assinatura adulterada', () => {
    const signature = service.sign('secret', 'payload');
    const tampered = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;

    expect(service.verify('secret', 'payload', tampered)).toBe(false);
  });

  it('verify usa timingSafeEqual para comparar assinaturas validas em formato', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const signature = service.sign('secret', 'payload');

    expect(service.verify('secret', 'payload', signature)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
