import { createHash, randomBytes } from 'crypto';

/**
 * Token da sessão da LOPS IA: curto para a IA repetir sem errar — `tf-7K3D-Q9MZ-XPA2-H4NB`.
 * 16 caracteres do alfabeto de Crockford (sem I, L, O, U, que se confundem) = 80 bits de acaso;
 * a chave da LOPS IA e o limite de chamadas fecham o resto. Na volta aceita minúsculas, sem os
 * hífens e as trocas comuns (O→0, I/L→1).
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 16;
const PREFIX = 'tf-';

export function newSessionToken(): string {
  const bytes = randomBytes(10); // 80 bits → 16 símbolos de 5 bits
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `${PREFIX}${out.match(/.{4}/g)?.join('-') ?? out}`;
}

/** Forma canônica (16 símbolos) ou null se não parece um token nosso. */
export function canonicalSessionToken(received: string): string | null {
  const cleaned = received
    .trim()
    .toUpperCase()
    .replace(/^TF[-_\s]?/, '')
    .replace(/[-_\s]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== LENGTH) return null;
  for (const char of cleaned) {
    if (!ALPHABET.includes(char)) return null;
  }
  return cleaned;
}

export function hashSessionToken(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}
