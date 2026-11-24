import { GoogleAccessAuditService, ALLOWED_GOOGLE_SCOPES } from './google-access-audit.service';

type FetchResult = { status: number; body?: unknown } | Error;

const SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';

function makeService(
  users: Array<{ id: string; email: string; googleRefreshToken: string }>,
  responses: Record<string, FetchResult>,
) {
  const usersRepository = { find: jest.fn().mockResolvedValue(users) };
  const tokenCipher = {
    decrypt: jest.fn((value: string) => {
      if (value === 'ilegivel') throw new Error('bad decrypt');
      return `plain:${value}`;
    }),
  };
  const connectionService = { disconnectUserConnection: jest.fn().mockResolvedValue({}) };
  const config = { getOrThrow: (key: string) => `valor-${key}` };

  const fetchMock = jest.fn(async (_url: string, init: { body: URLSearchParams }) => {
    const token = init.body.get('refresh_token') ?? '';
    const result = responses[token];
    if (!result) throw new Error(`sem resposta simulada para ${token}`);
    if (result instanceof Error) throw result;
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body ?? {},
    };
  });
  global.fetch = fetchMock as never;

  const service = new GoogleAccessAuditService(
    config as never,
    tokenCipher as never,
    usersRepository as never,
    connectionService as never,
  );
  return { service, usersRepository, connectionService, fetchMock };
}

const user = (id: string, token = id) => ({ id, email: `${id}@tijucaalimentos.com`, googleRefreshToken: token });
const scopeResponse = (...scopes: string[]) => ({ status: 200, body: { scope: scopes.join(' ') } });

describe('GoogleAccessAuditService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  describe('auditoria (dryRun) — não altera nada', () => {
    it('classifica quem tem acesso amplo e quem está certo, sem desconectar ninguém', async () => {
      const { service, connectionService } = makeService([user('amplo'), user('certo')], {
        'plain:amplo': scopeResponse('openid', 'email', 'profile', SHEETS, DRIVE_FILE),
        'plain:certo': scopeResponse('openid', 'email', 'profile', DRIVE_FILE),
      });

      const report = await service.run({ apply: false });

      expect(connectionService.disconnectUserConnection).not.toHaveBeenCalled();
      expect(report).toMatchObject({ dryRun: true, checked: 2, withBroadAccess: 1, revoked: 0, ok: 1, failed: 0 });
      expect(report.users).toEqual([
        { userId: 'amplo', email: 'amplo@tijucaalimentos.com', action: 'would_revoke', excessScopes: [SHEETS] },
        { userId: 'certo', email: 'certo@tijucaalimentos.com', action: 'ok', excessScopes: [] },
      ]);
    });

    it('token já morto vira would_clear_invalid', async () => {
      const { service } = makeService([user('morto')], { 'plain:morto': { status: 400 } });
      const report = await service.run({ apply: false });
      expect(report.users[0].action).toBe('would_clear_invalid');
    });
  });

  describe('aplicação (apply)', () => {
    it('desconecta (e portanto revoga no Google) só quem tem acesso excedente', async () => {
      const { service, connectionService } = makeService([user('amplo'), user('certo')], {
        'plain:amplo': scopeResponse('openid', SHEETS),
        'plain:certo': scopeResponse('openid', 'email', 'profile', DRIVE_FILE),
      });

      const report = await service.run({ apply: true });

      expect(connectionService.disconnectUserConnection).toHaveBeenCalledTimes(1);
      expect(connectionService.disconnectUserConnection).toHaveBeenCalledWith('amplo');
      expect(report).toMatchObject({ dryRun: false, checked: 2, withBroadAccess: 1, revoked: 1, ok: 1 });
      expect(report.users.find((u) => u.userId === 'amplo')?.action).toBe('revoked');
    });

    it('limpa token já morto (invalid_grant) e token ilegível', async () => {
      const { service, connectionService } = makeService(
        [user('morto'), user('x', 'ilegivel')],
        { 'plain:morto': { status: 400 } },
      );
      const report = await service.run({ apply: true });
      expect(connectionService.disconnectUserConnection).toHaveBeenCalledTimes(2);
      expect(report.clearedInvalid).toBe(2);
      expect(report.users.map((u) => u.action)).toEqual(['cleared_invalid', 'cleared_invalid']);
    });

    it('erro do Google ou de rede NÃO desconecta ninguém e é reportado', async () => {
      const { service, connectionService } = makeService([user('a'), user('b')], {
        'plain:a': { status: 503 },
        'plain:b': new Error('rede fora do ar'),
      });
      const report = await service.run({ apply: true });
      expect(connectionService.disconnectUserConnection).not.toHaveBeenCalled();
      expect(report.failed).toBe(2);
      expect(report.users.map((u) => u.error)).toEqual(['Google respondeu 503', 'rede fora do ar']);
    });

    it('falha ao desconectar um usuário não interrompe os demais', async () => {
      const { service, connectionService } = makeService([user('a'), user('b')], {
        'plain:a': scopeResponse(SHEETS),
        'plain:b': scopeResponse(SHEETS),
      });
      connectionService.disconnectUserConnection.mockRejectedValueOnce(new Error('banco indisponível'));

      const report = await service.run({ apply: true });

      expect(connectionService.disconnectUserConnection).toHaveBeenCalledTimes(2);
      expect(report.users[0]).toMatchObject({ action: 'error', error: 'banco indisponível' });
      expect(report.users[1].action).toBe('revoked');
      expect(report).toMatchObject({ revoked: 1, failed: 1 });
    });

    it('sem usuários conectados devolve um relatório vazio', async () => {
      const { service } = makeService([], {});
      await expect(service.run({ apply: true })).resolves.toMatchObject({ checked: 0, withBroadAccess: 0, users: [] });
    });
  });

  describe('o que é “acesso excedente”', () => {
    it.each([
      [[SHEETS], [SHEETS]],
      [['https://www.googleapis.com/auth/drive'], ['https://www.googleapis.com/auth/drive']],
      [['https://www.googleapis.com/auth/spreadsheets.readonly'], ['https://www.googleapis.com/auth/spreadsheets.readonly']],
      [[SHEETS, 'https://www.googleapis.com/auth/drive.readonly'], [SHEETS, 'https://www.googleapis.com/auth/drive.readonly']],
    ])('%j conta como excedente', async (granted, excess) => {
      const { service } = makeService([user('u')], { 'plain:u': scopeResponse(DRIVE_FILE, ...granted) });
      const report = await service.run({ apply: false });
      expect(report.users[0].excessScopes).toEqual(excess);
    });

    it('identidade e drive.file (inclusive as formas antigas de userinfo) são permitidos', async () => {
      const { service } = makeService([user('u')], {
        'plain:u': scopeResponse(
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          DRIVE_FILE,
        ),
      });
      expect((await service.run({ apply: false })).users[0].action).toBe('ok');
      expect(ALLOWED_GOOGLE_SCOPES.has(SHEETS)).toBe(false);
    });
  });

  describe('segurança', () => {
    it('consulta o endpoint de token do Google com as credenciais do app e o refresh token decifrado', async () => {
      const { service, fetchMock } = makeService([user('u')], { 'plain:u': scopeResponse(DRIVE_FILE) });
      await service.run({ apply: false });

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: URLSearchParams }];
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(init.method).toBe('POST');
      expect(init.body.get('grant_type')).toBe('refresh_token');
      expect(init.body.get('refresh_token')).toBe('plain:u');
      expect(init.body.get('client_id')).toBe('valor-GOOGLE_OAUTH_CLIENT_ID');
    });

    it('o relatório nunca contém token (nem cifrado, nem decifrado)', async () => {
      const { service } = makeService([user('u', 'segredo-cifrado')], {
        'plain:segredo-cifrado': scopeResponse(SHEETS),
      });
      const json = JSON.stringify(await service.run({ apply: true }));
      expect(json).not.toContain('segredo-cifrado');
      expect(json).not.toContain('plain:');
    });

    it('só considera usuários que têm refresh token guardado', async () => {
      const { service, usersRepository } = makeService([], {});
      await service.run({ apply: false });
      const [{ where }] = usersRepository.find.mock.calls[0] as [{ where: { googleRefreshToken: { type: string; child: { type: string } } } }];
      expect(where.googleRefreshToken.type).toBe('not');
      expect(where.googleRefreshToken.child.type).toBe('isNull');
    });
  });
});
