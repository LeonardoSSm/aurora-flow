import { buildRefreshCookieOptions, isRefreshCookieSecure } from './refresh-cookie.helper';

describe('isRefreshCookieSecure', () => {
  it('sem AUTH_COOKIE_SECURE segue o NODE_ENV', () => {
    expect(isRefreshCookieSecure({ NODE_ENV: 'production' })).toBe(true);
    expect(isRefreshCookieSecure({ NODE_ENV: 'development' })).toBe(false);
    expect(isRefreshCookieSecure({})).toBe(false);
  });

  it('AUTH_COOKIE_SECURE=false desliga o secure mesmo em produção', () => {
    expect(isRefreshCookieSecure({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })).toBe(false);
    expect(isRefreshCookieSecure({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: '0' })).toBe(false);
    expect(isRefreshCookieSecure({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: ' FALSE ' })).toBe(false);
  });

  it('AUTH_COOKIE_SECURE=true liga o secure fora de produção', () => {
    expect(isRefreshCookieSecure({ NODE_ENV: 'development', AUTH_COOKIE_SECURE: 'true' })).toBe(true);
    expect(isRefreshCookieSecure({ AUTH_COOKIE_SECURE: '1' })).toBe(true);
  });

  it('valor vazio ou desconhecido cai no NODE_ENV', () => {
    expect(isRefreshCookieSecure({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: '' })).toBe(true);
    expect(isRefreshCookieSecure({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'talvez' })).toBe(true);
  });
});

describe('buildRefreshCookieOptions', () => {
  it('mantém os demais atributos do cookie de refresh', () => {
    expect(buildRefreshCookieOptions({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  });
});
