import { createHash, randomBytes } from 'crypto';

/**
 * Token do link de aprovação externa.
 *
 * - 256 bits de entropia (`randomBytes(32)`), em base64url → 43 caracteres: não dá para adivinhar.
 * - O banco guarda só o **SHA-256** (hex). Quem lê o banco (ou um backup) não consegue montar um link.
 * - A busca é por igualdade do hash (índice único); com 256 bits de entropia não há ataque de
 *   temporização útil, então não precisa de comparação em tempo constante.
 */

export const EXTERNAL_APPROVAL_TOKEN_LENGTH = 43;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateApprovalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashApprovalToken(token) };
}

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Descarta lixo antes de ir ao banco (formato errado nunca é um token nosso). */
export function isPlausibleApprovalToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}
