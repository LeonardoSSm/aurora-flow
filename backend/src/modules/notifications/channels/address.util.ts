const EMAIL_RE = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

/** E-mail normalizado (minúsculo, sem espaços) ou `null` se inválido. */
export function normalizeEmailAddress(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value || value.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_RE.test(value) ? value : null;
}

/**
 * Telefone para WhatsApp: só dígitos, com DDI. Sem `+` e com até 11 dígitos (formato nacional),
 * prefixa o DDI padrão (Brasil, 55). Aceita 10–15 dígitos no final; zeros à esquerda (prefixo de
 * tronco) são descartados. Devolve `null` se não parecer um telefone.
 */
export function normalizePhoneNumber(
  raw: string | null | undefined,
  defaultCountryCode = '55',
): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const hasPlus = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (!hasPlus) digits = digits.replace(/^0+/, '');
  if (!digits) return null;
  if (!hasPlus && digits.length <= 11) digits = `${defaultCountryCode}${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Grupo do WhatsApp pelo JID que a Evolution API devolve (`120363025246125486@g.us`; grupos antigos:
 * `5585999991234-1596737011@g.us`). O próprio JID vai no `number` do envio.
 */
const WHATSAPP_GROUP_JID_RE = /^\d{10,30}(?:-\d{6,15})?@g\.us$/;

/** Destinatário de WhatsApp: JID de grupo (minúsculo, sem espaços) ou telefone (ver normalizePhoneNumber). */
export function normalizeWhatsAppAddress(
  raw: string | null | undefined,
  defaultCountryCode = '55',
): string | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (WHATSAPP_GROUP_JID_RE.test(text)) return text;
  return normalizePhoneNumber(raw, defaultCountryCode);
}
