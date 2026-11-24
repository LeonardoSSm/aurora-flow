import { GoogleConnectionService } from './google-connection.service';
import type { UserEntity } from '../../../database/entities';

function makeService(): GoogleConnectionService {
  return new GoogleConnectionService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

function user(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    googleRefreshToken: null,
    googleConnectedAt: null,
    googleDisconnectedAt: null,
    googleAccessToken: null,
    googleTokenExpiresAt: null,
    googleAccountEmail: null,
    googleSub: null,
    ...overrides,
  } as UserEntity;
}

describe('GoogleConnectionService.isUserGoogleConnected', () => {
  const svc = makeService();

  it('returns false when googleRefreshToken is null', () => {
    expect(svc.isUserGoogleConnected(user({ googleRefreshToken: null }))).toBe(false);
  });

  it('returns false when googleRefreshToken is empty string', () => {
    expect(svc.isUserGoogleConnected(user({ googleRefreshToken: '' }))).toBe(false);
  });

  it('returns true when refresh token is set and never disconnected', () => {
    expect(
      svc.isUserGoogleConnected(user({ googleRefreshToken: 'token', googleDisconnectedAt: null })),
    ).toBe(true);
  });

  it('returns true when connectedAt is more recent than disconnectedAt', () => {
    const connectedAt = new Date('2024-06-01T12:00:00Z');
    const disconnectedAt = new Date('2024-06-01T10:00:00Z'); // earlier
    expect(
      svc.isUserGoogleConnected(
        user({
          googleRefreshToken: 'token',
          googleConnectedAt: connectedAt,
          googleDisconnectedAt: disconnectedAt,
        }),
      ),
    ).toBe(true);
  });

  it('returns false when disconnectedAt is more recent than connectedAt', () => {
    const connectedAt = new Date('2024-06-01T10:00:00Z');
    const disconnectedAt = new Date('2024-06-01T12:00:00Z'); // later
    expect(
      svc.isUserGoogleConnected(
        user({
          googleRefreshToken: 'token',
          googleConnectedAt: connectedAt,
          googleDisconnectedAt: disconnectedAt,
        }),
      ),
    ).toBe(false);
  });

  it('returns false when disconnectedAt equals connectedAt (not strictly greater)', () => {
    const ts = new Date('2024-06-01T10:00:00Z');
    expect(
      svc.isUserGoogleConnected(
        user({ googleRefreshToken: 'token', googleConnectedAt: ts, googleDisconnectedAt: ts }),
      ),
    ).toBe(false);
  });

  it('returns false when refresh token is set but connectedAt is null and disconnectedAt is set', () => {
    expect(
      svc.isUserGoogleConnected(
        user({
          googleRefreshToken: 'token',
          googleConnectedAt: null,
          googleDisconnectedAt: new Date(),
        }),
      ),
    ).toBe(false);
  });
});

describe('GoogleConnectionService.disconnectUserConnection — revoga o token no Google', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function makeWithRepo(stored: UserEntity) {
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue(stored),
      save: jest.fn((u: UserEntity) => Promise.resolve(u)),
    };
    const tokenCipher = { decrypt: jest.fn((value: string) => `plain:${value}`) };
    const eventEmitter = { emit: jest.fn() };
    const config = { get: (key: string) => 'valor-' + key, getOrThrow: (key: string) => 'valor-' + key };
    const service = new GoogleConnectionService(
      config as never,
      tokenCipher as never,
      eventEmitter as never,
      usersRepository as never,
      null as never,
    );
    return { service, usersRepository, tokenCipher };
  }

  it('apaga o token local e revoga o refresh token (decifrado) no endpoint de revogação do Google', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as never;
    const { service, usersRepository } = makeWithRepo(user({ googleRefreshToken: 'cifrado', googleAccessToken: 'a' }));

    const status = await service.disconnectUserConnection('user-1');

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ googleRefreshToken: null, googleAccessToken: null }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('token=plain%3Acifrado');
    expect(status.status).not.toBe('connected');
    expect(status.disconnectedAt).not.toBeNull();
  });

  it('a desconexão local NÃO depende do Google: erro de rede ou resposta de erro não a impedem', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('rede fora do ar')) as never;
    const first = makeWithRepo(user({ googleRefreshToken: 'cifrado' }));
    await expect(first.service.disconnectUserConnection('user-1')).resolves.toMatchObject({ status: expect.not.stringMatching(/^connected$/) });
    expect(first.usersRepository.save).toHaveBeenCalled();

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as never;
    const second = makeWithRepo(user({ googleRefreshToken: 'cifrado' }));
    await expect(second.service.disconnectUserConnection('user-1')).resolves.toMatchObject({ status: expect.not.stringMatching(/^connected$/) });
  });

  it('token ilegível (chave de cifra trocada) também não impede desconectar', async () => {
    global.fetch = jest.fn() as never;
    const { service, tokenCipher } = makeWithRepo(user({ googleRefreshToken: 'cifrado' }));
    tokenCipher.decrypt.mockImplementation(() => {
      throw new Error('bad decrypt');
    });
    await expect(service.disconnectUserConnection('user-1')).resolves.toMatchObject({ status: expect.not.stringMatching(/^connected$/) });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sem refresh token guardado não chama o Google', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const { service } = makeWithRepo(user({ googleRefreshToken: null }));
    await service.disconnectUserConnection('user-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
