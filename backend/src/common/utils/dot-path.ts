/** Resolves a dot-path (e.g. "header.numeroPedido" or "items.0.codigo") against a nested object/array. */
export function resolvePath(obj: unknown, path: string): unknown {
  if (!path.trim()) return undefined;

  let current: unknown = obj;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Resolves a dot-path to a normalized, deduped list of e-mails — accepts an array of emails/objects or a delimited string. */
export function resolveEmailList(obj: unknown, path: string): string[] {
  return toEmailList(resolvePath(obj, path));
}

/** Normalizes a value to a deduped list of e-mails — accepts an array of emails/objects or a delimited string. */
export function toEmailList(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;]/)
      : [];

  const emails = raw
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'email' in entry) {
        const email = (entry as { email?: unknown }).email;
        return typeof email === 'string' ? email : '';
      }
      return '';
    })
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  return [...new Set(emails)];
}
