import { createHash, randomBytes } from 'crypto';

/**
 * Token do link de convite (criar a senha). Mesmo esquema do link de aprovação externa:
 * 256 bits em base64url (43 caracteres), e o banco guarda só o SHA-256 em hex.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Descarta lixo antes de ir ao banco (formato errado nunca é um token nosso). */
export function isPlausibleInviteToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}
