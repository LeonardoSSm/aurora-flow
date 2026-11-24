/** Identidade do produto independente (Aurora Ecosystem). */
export const PRODUCT_NAME = 'Aurora Flow';
export const PRODUCT_SERVICE = 'aurora-flow-backend';
export const METRICS_PREFIX = 'aurora_flow_';
export const REFRESH_COOKIE_NAME = 'aurora_flow_refresh';
export const DEFAULT_FLOW_QUEUE = 'aurora.flow.execution';
export const ERP_RETRY_QUEUE_NAME = 'aurora.flow.erp.retry';
export const WEBHOOK_SIGNATURE_HEADER = 'X-Aurora-Flow-Signature';

export const SEED_ADMIN_EMAIL = 'admin@aurora-flow.local';
export const SEED_ADMIN_NAME = 'Administrador Aurora Flow';
/** Senha local/testes apenas. Produção exige SEED_ADMIN_PASSWORD no ambiente. */
export const SEED_ADMIN_DEV_PASSWORD = 'AuroraFlow@123';

export function resolveSeedAdminPassword(): string | null {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') return null;
  return SEED_ADMIN_DEV_PASSWORD;
}
