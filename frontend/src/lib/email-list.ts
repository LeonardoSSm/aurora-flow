// Lista de e-mails digitada à mão (aprovadores externos). Mesmo critério do backend
// (normalizeEmailAddress): minúsculo, sem espaços, formato simples com ponto no domínio.
const EMAIL_RE = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;

/** Teto de aprovadores externos por aprovação (igual ao backend). */
export const MAX_EXTERNAL_APPROVERS = 10;
/** Tamanho da coluna no banco; e-mail maior que isso é recusado pelo servidor. */
export const MAX_EMAIL_LENGTH = 180;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email);
}

export interface ParsedEmailList {
  /** E-mails válidos, em minúsculas, sem repetição, na ordem digitada. */
  emails: string[];
  /** Trechos digitados que não são e-mail válido (sem repetição). */
  invalid: string[];
}

/** Aceita vírgula, ponto e vírgula, espaço e quebra de linha como separadores. */
export function parseEmailList(text: string): ParsedEmailList {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const value = part.trim().toLowerCase();
    if (!value) continue;
    if (isValidEmail(value)) {
      if (!emails.includes(value)) emails.push(value);
    } else if (!invalid.includes(part.trim())) {
      invalid.push(part.trim());
    }
  }
  return { emails, invalid };
}
