import { lookup } from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google.internal.',
]);

function envAllowsPrivateUrls(): boolean {
  const raw = process.env.HTTP_ALLOW_PRIVATE_URLS?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

function isBlockedIPv4(ip: string): boolean {
  const p = ip.split('.').map((part) => Number(part));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.slice('::ffff:'.length);
    return isIP(v4) === 4 ? isBlockedIPv4(v4) : true;
  }
  return false;
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(address);
  return true;
}

/**
 * Impede SSRF em ações HTTP/webhook: só http(s) para hosts públicos, salvo
 * HTTP_ALLOW_PRIVATE_URLS (desenvolvimento/testes contra loopback controlado).
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  if (envAllowsPrivateUrls()) return;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL de destino inválida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Apenas URLs http(s) são permitidas.');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('Destino HTTP bloqueado (rede interna ou metadados).');
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new Error('Destino HTTP bloqueado (endereço privado).');
    }
    return;
  }

  const resolved = await lookup(hostname, { all: true });
  if (resolved.length === 0 || resolved.some((entry) => isBlockedAddress(entry.address))) {
    throw new Error('Destino HTTP bloqueado (resolução para rede privada).');
  }
}
