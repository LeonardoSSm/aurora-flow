import {
  EXTERNAL_APPROVAL_TOKEN_LENGTH,
  generateApprovalToken,
  hashApprovalToken,
  isPlausibleApprovalToken,
} from './external-approval-token';

describe('external-approval-token', () => {
  it('gera token de 43 caracteres base64url (256 bits) e o hash SHA-256 em hex', () => {
    const { token, hash } = generateApprovalToken();

    expect(token).toHaveLength(EXTERNAL_APPROVAL_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it('o hash é determinístico e derivado do token', () => {
    const { token, hash } = generateApprovalToken();

    expect(hashApprovalToken(token)).toBe(hash);
    expect(hashApprovalToken(`${token}x`)).not.toBe(hash);
  });

  it('não repete tokens (amostra de 500)', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateApprovalToken().token));

    expect(tokens.size).toBe(500);
  });

  it.each([
    ['token válido', 'A'.repeat(43), true],
    ['curto demais', 'A'.repeat(42), false],
    ['longo demais', 'A'.repeat(44), false],
    ['caractere inválido', `${'A'.repeat(42)}!`, false],
    ['injeção SQL', `${'A'.repeat(30)}' OR '1'='1`, false],
    ['vazio', '', false],
    ['não-string', 12345, false],
    ['nulo', null, false],
  ])('isPlausibleApprovalToken: %s', (_label, value, expected) => {
    expect(isPlausibleApprovalToken(value)).toBe(expected);
  });
});
