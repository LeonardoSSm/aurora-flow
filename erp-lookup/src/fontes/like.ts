/**
 * Caractere de escape do LIKE. Usar `!` com `ESCAPE '!'` explícito (em vez da barra padrão)
 * funciona igual com ou sem o modo NO_BACKSLASH_ESCAPES do MySQL.
 */
export const ESCAPE_LIKE = '!';

/** Padrão "contém" para `LIKE ? ESCAPE '!'`: `%` e `_` digitados pelo usuário viram literais. */
export function padraoContem(texto: string): string {
  const escapado = texto.replace(/[!%_]/g, (caractere) => `${ESCAPE_LIKE}${caractere}`);
  return `%${escapado}%`;
}
