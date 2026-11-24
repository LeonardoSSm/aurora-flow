import { BadRequestException } from '@nestjs/common';

// Public TLDs that indicate an internet-facing domain
const PUBLIC_TLDS = new Set([
  'com', 'net', 'org', 'io', 'dev', 'app', 'cloud', 'co',
  'info', 'gov', 'edu', 'biz', 'me', 'br', 'us', 'uk',
]);

function isPrivateIp(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Rejects URLs that resolve to internet-facing hosts. Shared by every
 * outbound ERP call site (operations, health checks, and token refresh)
 * so none of them can be used to exfiltrate credentials to a public host.
 *
 * Accepts: private IPs (10.x, 172.16-31.x, 192.168.x), localhost,
 * hostnames without a TLD, and hostnames listed in allowedHosts.
 */
export function validateInternalErpUrl(url: string, allowedHosts: string[]): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new BadRequestException(`URL do ERP inválida: "${url}".`);
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') return;

  const normalizedAllowedHosts = allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (normalizedAllowedHosts.includes(hostname.toLowerCase())) return;

  if (isPrivateIp(hostname)) return;

  // Hostnames with no dot have no TLD → treat as internal (e.g. erp-interno)
  if (!hostname.includes('.')) return;

  const parts = hostname.split('.');
  const tld = parts[parts.length - 1].toLowerCase();
  const tldPlus = parts.slice(-2).join('.').toLowerCase(); // e.g. com.br

  if (PUBLIC_TLDS.has(tld) || PUBLIC_TLDS.has(tldPlus)) {
    throw new BadRequestException(
      `URL do ERP aponta para domínio público "${hostname}". ` +
        `Apenas IPs privados, hostnames internos ou domínios em ALLOWED_ERP_HOSTS são permitidos.`,
    );
  }
}
