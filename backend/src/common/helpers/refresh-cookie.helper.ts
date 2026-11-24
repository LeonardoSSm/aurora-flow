import type { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'formhub_refresh';

/**
 * O cookie de refresh sai `secure` em produção. Navegador nenhum guarda um cookie `secure`
 * vindo de uma página HTTP (fora de localhost), e aí recarregar a página desloga. Para um
 * ambiente servido por HTTP com NODE_ENV=production (ex.: homologação acessada pelo IP),
 * AUTH_COOKIE_SECURE=false desliga só esse atributo. Sem a variável, vale o NODE_ENV.
 */
export function isRefreshCookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return env.NODE_ENV === 'production';
}

export function buildRefreshCookieOptions(env: NodeJS.ProcessEnv = process.env): CookieOptions {
  return {
    httpOnly: true,
    secure: isRefreshCookieSecure(env),
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
