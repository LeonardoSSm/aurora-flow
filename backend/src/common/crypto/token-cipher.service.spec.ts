import { TokenCipherService } from './token-cipher.service';

function makeService(keyBase64: string | undefined): TokenCipherService {
  return new TokenCipherService({ get: () => keyBase64 } as never);
}

const VALID_KEY = Buffer.alloc(32, 0xab).toString('base64');

describe('TokenCipherService', () => {
  let service: TokenCipherService;

  beforeEach(() => {
    service = makeService(VALID_KEY);
  });

  describe('encrypt/decrypt round-trip', () => {
    it.each([
      ['token OAuth típico', 'ya29.a0AfH6SMBUqlT-xyzABCDEF_1234567890'],
      ['token longo', 'a'.repeat(500)],
      ['string vazia', ''],
    ])('%s', (_label, plaintext) => {
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });
  });

  it('produz ciphertexts diferentes para o mesmo plaintext (IV aleatório)', () => {
    const c1 = service.encrypt('same-input');
    const c2 = service.encrypt('same-input');
    expect(c1).not.toBe(c2);
    expect(service.decrypt(c1)).toBe('same-input');
    expect(service.decrypt(c2)).toBe('same-input');
  });

  it('ciphertext tem prefixo v1.', () => {
    expect(service.encrypt('test')).toMatch(/^v1\./);
  });

  it('rejeita payload com versão errada', () => {
    expect(() => service.decrypt('v2.aGVsbG8.d29ybGQ.dGVzdA')).toThrow();
  });

  it('rejeita payload com número incorreto de segmentos', () => {
    expect(() => service.decrypt('v1.abc.def')).toThrow();
    expect(() => service.decrypt('v1.abc.def.ghi.extra')).toThrow();
  });

  it('rejeita payload com auth tag adulterado', () => {
    const encrypted = service.encrypt('secret-token');
    const parts = encrypted.split('.');
    parts[2] = Buffer.alloc(16, 0xff).toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });

  it('rejeita payload com ciphertext adulterado', () => {
    const encrypted = service.encrypt('secret-token');
    const parts = encrypted.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] ^= 0xff;
    parts[3] = ct.toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });

  it('lança quando a chave não está configurada (encrypt)', () => {
    const unconfigured = makeService(undefined);
    expect(() => unconfigured.encrypt('test')).toThrow('GOOGLE_TOKEN_ENCRYPTION_KEY');
  });

  it('lança quando a chave não está configurada (decrypt)', () => {
    const unconfigured = makeService(undefined);
    expect(() => unconfigured.decrypt('v1.a.b.c')).toThrow('GOOGLE_TOKEN_ENCRYPTION_KEY');
  });

  it('lança na inicialização quando a chave decodifica para menos de 32 bytes', () => {
    const shortKey = Buffer.alloc(16, 0xab).toString('base64');
    expect(() => makeService(shortKey)).toThrow(/32 bytes/);
  });
});
