import { GOOGLE_OAUTH_SCOPES, GoogleOAuthService } from './google-oauth.service';

const CONFIG: Record<string, string> = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo',
  GOOGLE_OAUTH_CALLBACK_URL: 'https://api.exemplo.com/api/integrations/google/callback',
  GOOGLE_WORKSPACE_DOMAIN: 'tijucaalimentos.com',
};

function makeService(hasRefreshToken = false): GoogleOAuthService {
  const config = {
    get: (key: string) => CONFIG[key],
    getOrThrow: (key: string) => {
      const value = CONFIG[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  };
  const stateHelper = { encodeState: () => 'state-token' };
  const connection = { userHasRefreshToken: jest.fn().mockResolvedValue(hasRefreshToken) };
  return new GoogleOAuthService(
    config as never,
    null as never,
    null as never,
    null as never,
    stateHelper as never,
    null as never,
    connection as never,
    null as never,
  );
}

describe('GoogleOAuthService — permissões pedidas ao Google', () => {
  it('pede só drive.file (arquivos criados pelo app), nunca o escopo amplo de todas as planilhas', async () => {
    const urls = [makeService().buildLoginUrl(), await makeService().buildConnectUrl('user-1')];
    for (const raw of urls) {
      const scopes = (new URL(raw).searchParams.get('scope') ?? '').split(' ');
      expect(scopes).toEqual(['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file']);
      expect(scopes).not.toContain('https://www.googleapis.com/auth/spreadsheets');
      expect(scopes).not.toContain('https://www.googleapis.com/auth/drive');
    }
  });

  it('a lista exportada é a mesma usada na URL', () => {
    const scope = new URL(makeService().buildLoginUrl()).searchParams.get('scope');
    expect(scope).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
  });

  it('NÃO acumula escopos já concedidos antes (sem include_granted_scopes)', () => {
    const params = new URL(makeService().buildLoginUrl()).searchParams;
    expect(params.has('include_granted_scopes')).toBe(false);
  });

  it('mantém restrição ao domínio da empresa, acesso offline e o callback configurado', () => {
    const params = new URL(makeService().buildLoginUrl()).searchParams;
    expect(params.get('hd')).toBe('tijucaalimentos.com');
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('redirect_uri')).toBe(CONFIG.GOOGLE_OAUTH_CALLBACK_URL);
    expect(params.get('client_id')).toBe(CONFIG.GOOGLE_OAUTH_CLIENT_ID);
  });

  it('conexão: força o consentimento quando o usuário ainda não tem refresh token', async () => {
    const first = new URL(await makeService(false).buildConnectUrl('user-1')).searchParams.get('prompt');
    const again = new URL(await makeService(true).buildConnectUrl('user-1')).searchParams.get('prompt');
    expect(first).toBe('consent');
    expect(again).toBe('select_account');
  });
});
