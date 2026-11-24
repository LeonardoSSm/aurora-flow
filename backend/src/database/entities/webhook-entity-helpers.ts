import type { ValueTransformer } from 'typeorm';

const MASKED_VALUE = '[masked]';
const RESPONSE_BODY_LIMIT_BYTES = 10 * 1024;
const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'proxy-authorization']);

export function maskSensitiveHeaders(
  headers: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!headers) return null;

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? MASKED_VALUE : value,
    ]),
  );
}

export function truncateTextBytes(value: string | null | undefined): string | null {
  if (value == null) return null;
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.byteLength <= RESPONSE_BODY_LIMIT_BYTES) return value;
  return buffer.subarray(0, RESPONSE_BODY_LIMIT_BYTES).toString('utf8');
}

export const maskedHeadersTransformer: ValueTransformer = {
  to: (value: Record<string, unknown> | null | undefined) => maskSensitiveHeaders(value),
  from: (value: Record<string, unknown> | null) => value,
};

export const truncatedResponseBodyTransformer: ValueTransformer = {
  to: (value: string | null | undefined) => truncateTextBytes(value),
  from: (value: string | null) => value,
};
