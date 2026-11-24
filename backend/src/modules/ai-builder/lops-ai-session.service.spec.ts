import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { fakeProcessAccess } from '../access/testing/fake-process-access';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { LopsAiAuthGuard } from './lops-ai-auth.guard';
import { canonicalSessionToken, newSessionToken } from './lops-ai-session-token';
import { LopsAiSessionService } from './lops-ai-session.service';

const KEY = 'k'.repeat(40);
const TOKEN_FORMAT = /^tf-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    LOPS_AI_INBOUND_API_KEY: KEY,
    GOOGLE_WORKSPACE_DOMAIN: 'tijucaalimentos.com',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) };
}

const ana = {
  id: 'user-ana',
  fullName: 'Ana Processos',
  email: 'ana@tijucaalimentos.com',
  role: 'manager',
  roleDefinition: { name: 'Gerente' },
  areaId: 'area-1',
  area: { name: 'Compras' },
  isActive: true,
  tokenVersion: 3,
};

type StoredSession = {
  id: string;
  tokenHash: string;
  userId: string;
  tokenVersion: number;
  expiresAt: Date;
  lastUsedAt: Date | null;
};

/** Tabela lops_ai_sessions em memória. */
function makeSessionsRepository() {
  const rows: StoredSession[] = [];
  return {
    rows,
    create: jest.fn((data: Omit<StoredSession, 'id'>) => ({ ...data })),
    save: jest.fn((row: Omit<StoredSession, 'id'>) => {
      const saved = { id: `s${rows.length + 1}`, ...row };
      rows.push(saved);
      return Promise.resolve(saved);
    }),
    findOne: jest.fn(({ where }: { where: { tokenHash: string } }) =>
      Promise.resolve(rows.find((row) => row.tokenHash === where.tokenHash) ?? null),
    ),
    update: jest.fn((id: string, patch: Partial<StoredSession>) => {
      Object.assign(rows.find((row) => row.id === id) ?? {}, patch);
      return Promise.resolve();
    }),
    delete: jest.fn(() => Promise.resolve()),
  };
}

function makeService(options: { config?: Record<string, string | undefined>; user?: object | null; allowed?: boolean } = {}) {
  const user = options.user === undefined ? ana : options.user;
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(user),
  };
  const usersRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn().mockResolvedValue(user),
    findOneOrFail: jest.fn().mockResolvedValue(user),
  };
  const permissions = {
    hasAny: jest.fn((_role: string, code: string) =>
      Promise.resolve(code === 'ai.copilot.use' ? (options.allowed ?? true) : code !== 'forms.create'),
    ),
  };
  const audit = { log: jest.fn() };
  const sessionsRepository = makeSessionsRepository();
  const service = new LopsAiSessionService(
    makeConfig(options.config) as never,
    permissions as never,
    audit as never,
    usersRepository as never,
    sessionsRepository as never,
    // Sem vínculo nenhum: o que vale para processo é poder criar processo.
    fakeProcessAccess(),
  );
  return { service, usersRepository, sessionsRepository, audit };
}

describe('token curto da sessão', () => {
  it('tf- e 4 grupos de 4, sem letras que se confundem, e não repete', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newSessionToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(TOKEN_FORMAT);
  });

  it('aceita minúsculas, sem hífens e as trocas O→0, I/L→1; recusa o que não é token', () => {
    expect(canonicalSessionToken('tf-7k3d-q9mz-xpa2-h4nb')).toBe('7K3DQ9MZXPA2H4NB');
    expect(canonicalSessionToken(' TF 7K3D Q9MZ XPA2 H4NB ')).toBe('7K3DQ9MZXPA2H4NB');
    expect(canonicalSessionToken('tf-7K3D-Q9MZ-XPA2-H4NO')).toBe('7K3DQ9MZXPA2H4N0');
    expect(canonicalSessionToken('tf-7K3D-Q9MZ-XPA2-H4NI')).toBe(canonicalSessionToken('tf-7K3D-Q9MZ-XPA2-H4NL'));
    expect(canonicalSessionToken('tf-7K3D-Q9MZ-XPA2')).toBeNull();
    expect(canonicalSessionToken('tf-7K3D-Q9MZ-XPA2-H4NU')).toBeNull();
    expect(canonicalSessionToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig')).toBeNull();
  });
});

describe('LopsAiSessionService', () => {
  it('abre a sessão para usuário ativo do domínio com a permissão; guarda só o hash e o token volta como o usuário', async () => {
    const { service, audit, sessionsRepository } = makeService();
    const session = await service.createSession('  Ana@TijucaAlimentos.com ');

    expect(session.token).toMatch(TOKEN_FORMAT);
    expect(sessionsRepository.rows).toHaveLength(1);
    expect(sessionsRepository.rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sessionsRepository.rows)).not.toContain(session.token.slice(3));
    expect(session.user).toEqual(
      expect.objectContaining({
        email: 'ana@tijucaalimentos.com',
        roleName: 'Gerente',
        areaName: 'Compras',
        // Quem não cria processo e não tem vínculo não configura fases nem fluxos pela IA.
        permissions: expect.objectContaining({ 'ai.copilot.use': true, 'forms.create': false, 'flows.manage': true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'lops_ai.session_created' }));

    const expected = {
      sub: 'user-ana',
      email: 'ana@tijucaalimentos.com',
      fullName: 'Ana Processos',
      role: 'manager',
      tokenVersion: 3,
      areaId: 'area-1',
    };
    await expect(service.verify(session.token)).resolves.toEqual(expected);
    // A IA às vezes muda caixa ou tira os hífens: continua valendo.
    await expect(service.verify(session.token.toLowerCase().replace(/-/g, ''))).resolves.toEqual(expected);
  });

  it('recusa e-mail de outro domínio, usuário inexistente e perfil sem permissão', async () => {
    await expect(makeService().service.createSession('ana@gmail.com')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(makeService({ user: null }).service.createSession('x@tijucaalimentos.com')).rejects.toThrow(
      'não tem usuário ativo',
    );
    await expect(makeService({ allowed: false }).service.createSession(ana.email)).rejects.toThrow(
      'ai.copilot.use',
    );
  });

  it('sem a chave configurada (ou curta demais) a integração fica desligada', async () => {
    await expect(
      makeService({ config: { LOPS_AI_INBOUND_API_KEY: undefined } }).service.createSession(ana.email),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      makeService({ config: { LOPS_AI_INBOUND_API_KEY: 'curta' } }).service.createSession(ana.email),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('token mal copiado, desconhecido ou o JWT do login não valem', async () => {
    const { service } = makeService();
    const { token } = await service.createSession(ana.email);
    await expect(service.verify(token.slice(0, -1))).rejects.toThrow('formato errado');
    await expect(service.verify(newSessionToken())).rejects.toThrow('inválida ou expirada');
    await expect(service.verify('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWFuYSJ9.assinatura')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('cada uso renova a validade; parada além do prazo, a sessão cai', async () => {
    const { service, sessionsRepository } = makeService({ config: { LOPS_AI_SESSION_TTL_MINUTES: '60' } });
    const { token } = await service.createSession(ana.email);
    const row = sessionsRepository.rows[0];

    // Último uso há 10 min, faltando 5 min para vencer: usar empurra a validade para +60 min.
    row.lastUsedAt = new Date(Date.now() - 10 * 60_000);
    row.expiresAt = new Date(Date.now() + 5 * 60_000);
    await service.verify(token);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);

    row.expiresAt = new Date(Date.now() - 1000);
    await expect(service.verify(token)).rejects.toThrow('inválida ou expirada');
  });

  it('trocar a senha (tokenVersion) derruba a sessão', async () => {
    const { service, usersRepository } = makeService();
    const { token } = await service.createSession(ana.email);
    usersRepository.findOne.mockResolvedValue({ ...ana, tokenVersion: 4 });
    await expect(service.verify(token)).rejects.toThrow('encerrada');
  });
});

describe('LopsAiAuthGuard', () => {
  function contextFor(headers: Record<string, string>, ip = '10.0.0.5', apiKeyOnly = false) {
    const request: Record<string, unknown> = {
      ip,
      header: (name: string) => headers[name.toLowerCase()],
    };
    const handler = () => undefined;
    if (apiKeyOnly) Reflect.defineMetadata('lopsAiApiKeyOnly', true, handler);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('exige a chave da LOPS IA e o token da pessoa; monta request.user', async () => {
    const { service } = makeService();
    const guard = new LopsAiAuthGuard(new Reflector(), service);
    const { token } = await service.createSession(ana.email);

    await expect(guard.canActivate(contextFor({ 'x-api-key': 'errada' }).context)).rejects.toThrow(
      'Chave da LOPS IA inválida.',
    );
    await expect(guard.canActivate(contextFor({ 'x-api-key': KEY }).context)).rejects.toThrow(
      'token de sessão',
    );

    const { context, request } = contextFor({ 'x-api-key': KEY, authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(expect.objectContaining({ sub: 'user-ana', role: 'manager' }));
  });

  it('a rota de abrir sessão só pede a chave', async () => {
    const guard = new LopsAiAuthGuard(new Reflector(), makeService().service);
    await expect(guard.canActivate(contextFor({ 'x-api-key': KEY }, '1.1.1.1', true).context)).resolves.toBe(true);
  });

  it('com lista de IPs, recusa outra origem', async () => {
    const { service } = makeService({ config: { LOPS_AI_ALLOWED_IPS: '10.0.0.5, 10.0.0.6' } });
    const guard = new LopsAiAuthGuard(new Reflector(), service);
    await expect(
      guard.canActivate(contextFor({ 'x-api-key': KEY }, '::ffff:10.0.0.9', true).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(contextFor({ 'x-api-key': KEY }, '::ffff:10.0.0.6', true).context),
    ).resolves.toBe(true);
  });
});
