import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_COST_FACTOR } from '../../common/constants/security.constants';
import type { UserEntity } from '../../database/entities';
import { UsersService } from './users.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-id',
    fullName: 'João Silva',
    email: 'joao@formhub.local',
    passwordHash: 'hash',
    role: 'editor',
    isActive: true,
    tokenVersion: 0,
    googleSub: null,
    googleAccountEmail: null,
    googleRefreshToken: null,
    googleAccessToken: null,
    googleTokenExpiresAt: null,
    googleConnectedAt: null,
    googleDisconnectedAt: null,
    googleLastUsedAt: null,
    lastLoginAt: null,
    forms: [],
    assignedForms: [],
    googleLinkedForms: [],
    auditEvents: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    normalizeEmail: jest.fn(),
    ...overrides,
  } as unknown as UserEntity;
}

// ─── Mock repository factory ──────────────────────────────────────────────────

function makeQb() {
  const qb: Record<string, jest.Mock> = {};
  const chain = (name: string) => {
    qb[name] = jest.fn().mockReturnValue(qb);
    return qb;
  };
  ['addSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take', 'update', 'set', 'execute'].forEach(
    chain,
  );
  qb['getOne'] = jest.fn().mockResolvedValue(null);
  qb['getManyAndCount'] = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}

function makeRepo() {
  const qb = makeQb();
  return {
    _qb: qb,
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((data: Partial<UserEntity>) => ({ ...data })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

function makeRolesRepo() {
  return {
    exists: jest.fn().mockResolvedValue(true),
  };
}

function makePermissionsService() {
  return {
    hasAny: jest.fn().mockResolvedValue(true),
  };
}

// ─── create ───────────────────────────────────────────────────────────────────

describe('UsersService.create', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('usa bcrypt com o custo correto ao criar usuário', async () => {
    repo.findOne.mockResolvedValue(null);
    const saved = makeUser();
    repo.save.mockResolvedValue(saved);

    const hashSpy = jest.spyOn(bcrypt, 'hash');
    await service.create({ fullName: 'Novo', email: 'novo@test.com', password: 'Senha@123', role: 'editor' });

    expect(hashSpy).toHaveBeenCalledWith('Senha@123', BCRYPT_COST_FACTOR);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordDefinedAt: expect.any(Date) }),
    );
  });

  it('sem senha, pré-cadastra: hash aleatório, passwordDefinedAt nulo e área gravada', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockResolvedValue(makeUser({ passwordDefinedAt: null }));
    const hashSpy = jest.spyOn(bcrypt, 'hash');
    hashSpy.mockClear();

    const result = await service.create({
      fullName: 'Gestora',
      email: 'gestora@test.com',
      role: 'editor',
      areaId: 'area-id',
    });

    const [randomSecret, cost] = hashSpy.mock.calls[0];
    expect(typeof randomSecret).toBe('string');
    expect((randomSecret as string).length).toBeGreaterThanOrEqual(32);
    expect(cost).toBe(BCRYPT_COST_FACTOR);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordDefinedAt: null, areaId: 'area-id', isActive: true }),
    );
    expect(result.hasPassword).toBe(false);
  });

  it('não inclui passwordHash no DTO retornado', async () => {
    repo.findOne.mockResolvedValue(null);
    const saved = makeUser();
    repo.save.mockResolvedValue(saved);

    const result = await service.create({ fullName: 'Novo', email: 'novo@test.com', password: 'Senha@123', role: 'editor' });

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('lança ConflictException quando e-mail já existe', async () => {
    repo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.create({ fullName: 'Novo', email: 'joao@formhub.local', password: 'Senha@123', role: 'editor' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('UsersService.update', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('invalida sessões quando a senha é alterada', async () => {
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);
    repo.save.mockResolvedValue(user);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('novo-hash' as never);

    const invalidateSpy = jest.spyOn(service, 'invalidateAllSessions');

    await service.update('user-id', { password: 'Nova@123' });

    expect(invalidateSpy).toHaveBeenCalledWith('user-id');
  });

  it('invalida sessões quando a role é alterada', async () => {
    const user = makeUser({ role: 'editor' });
    repo.findOne.mockResolvedValue(user);
    repo.save.mockResolvedValue(user);

    const invalidateSpy = jest.spyOn(service, 'invalidateAllSessions');

    await service.update('user-id', { role: 'admin' });

    expect(invalidateSpy).toHaveBeenCalledWith('user-id');
  });

  it('invalida sessões quando o usuário é desativado', async () => {
    const user = makeUser({ isActive: true });
    repo.findOne.mockResolvedValue(user);
    repo.save.mockResolvedValue({ ...user, isActive: false });

    const invalidateSpy = jest.spyOn(service, 'invalidateAllSessions');

    await service.update('user-id', { isActive: false });

    expect(invalidateSpy).toHaveBeenCalledWith('user-id');
  });

  it('não invalida sessões quando apenas o nome é alterado', async () => {
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);
    repo.save.mockResolvedValue({ ...user, fullName: 'Outro Nome' });

    const invalidateSpy = jest.spyOn(service, 'invalidateAllSessions');

    await service.update('user-id', { fullName: 'Outro Nome' });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('lança NotFoundException quando usuário não existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.update('ghost-id', { fullName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ─── deactivate ───────────────────────────────────────────────────────────────

describe('UsersService.deactivate', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('define isActive=false e invalida sessões', async () => {
    const user = makeUser({ isActive: true });
    repo.findOne.mockResolvedValue(user);
    repo.save.mockResolvedValue({ ...user, isActive: false });

    const invalidateSpy = jest.spyOn(service, 'invalidateAllSessions');

    const result = await service.deactivate('user-id');

    expect(invalidateSpy).toHaveBeenCalledWith('user-id');
    expect(result.isActive).toBe(false);
  });

  it('lança NotFoundException para id inexistente', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.deactivate('ghost-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── findOne (público) ────────────────────────────────────────────────────────

describe('UsersService.findOne', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('retorna UserResponseDto quando o usuário existe', async () => {
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);

    const result = await service.findOne('user-id');

    expect(result).not.toHaveProperty('passwordHash');
    expect(result.id).toBe('user-id');
  });

  it('lança NotFoundException quando usuário não existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('ghost-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── _internalFindOneEntity ───────────────────────────────────────────────────

describe('UsersService._internalFindOneEntity', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('retorna a entidade quando encontrada', async () => {
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);

    const result = await service._internalFindOneEntity('user-id');

    expect(result).toBe(user);
  });

  it('retorna null quando não encontrada', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service._internalFindOneEntity('ghost-id');

    expect(result).toBeNull();
  });
});

// ─── findActiveByEmail ─────────────────────────────────────────────────────────

describe('UsersService.findActiveByEmail', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('normaliza o e-mail e filtra apenas usuários ativos', async () => {
    const user = makeUser();
    repo.findOne.mockResolvedValue(user);

    const result = await service.findActiveByEmail('  Aprovador@Empresa.Com  ');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'aprovador@empresa.com', isActive: true },
    });
    expect(result).toBe(user);
  });

  it('retorna null quando o usuário não existe ou está inativo', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.findActiveByEmail('inativo@empresa.com');

    expect(result).toBeNull();
  });
});

// ─── _internalFindByEmail ─────────────────────────────────────────────────────

describe('UsersService._internalFindByEmail', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('normaliza o e-mail para letras minúsculas sem espaços', async () => {
    const qb = repo._qb;
    qb['getOne'].mockResolvedValue(makeUser());

    await service._internalFindByEmail('  Admin@FormHub.Local  ');

    expect(qb['where']).toHaveBeenCalledWith('user.email = :email', {
      email: 'admin@formhub.local',
    });
  });

  it('retorna null quando e-mail não existe', async () => {
    repo._qb['getOne'].mockResolvedValue(null);

    const result = await service._internalFindByEmail('ninguem@formhub.local');

    expect(result).toBeNull();
  });
});

// ─── findAssignable ───────────────────────────────────────────────────────────

describe('UsersService.findAssignable', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;
  let permissionsService: ReturnType<typeof makePermissionsService>;

  beforeEach(() => {
    repo = makeRepo();
    permissionsService = makePermissionsService();
    service = new UsersService(repo as never, makeRolesRepo() as never, permissionsService as never);
  });

  it('sem assignableAs, retorna todos os usuários ativos sem consultar permissões', async () => {
    const users = [
      makeUser({ id: 'u1', role: 'editor' }),
      makeUser({ id: 'u2', role: 'viewer' }),
    ];
    repo.find.mockResolvedValue(users);

    const result = await service.findAssignable();

    expect(result).toBe(users);
    expect(permissionsService.hasAny).not.toHaveBeenCalled();
  });

  it('com assignableAs, filtra usuários cujo perfil não detém a permissão', async () => {
    const users = [
      makeUser({ id: 'u1', role: 'editor' }),
      makeUser({ id: 'u2', role: 'viewer' }),
    ];
    repo.find.mockResolvedValue(users);
    permissionsService.hasAny.mockImplementation((role: string) =>
      Promise.resolve(role === 'editor'),
    );

    const result = await service.findAssignable('approvals.decide');

    expect(result.map((u) => u.id)).toEqual(['u1']);
    expect(permissionsService.hasAny).toHaveBeenCalledWith('editor', 'approvals.decide');
    expect(permissionsService.hasAny).toHaveBeenCalledWith('viewer', 'approvals.decide');
  });
});

// ─── ensureSeedAdmin ──────────────────────────────────────────────────────────

describe('UsersService.ensureSeedAdmin', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new UsersService(repo as never, makeRolesRepo() as never, makePermissionsService() as never);
  });

  it('não cria novo registro quando admin já existe (idempotente)', async () => {
    repo.findOne.mockResolvedValue(makeUser({ email: 'admin@formhub.local' }));

    await service.ensureSeedAdmin();

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cria o admin seed quando ainda não existe', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockResolvedValue(makeUser({ email: 'admin@formhub.local', role: 'admin' }));

    await service.ensureSeedAdmin();

    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedEntity = repo.save.mock.calls[0][0] as { role: string; email: string };
    expect(savedEntity.role).toBe('admin');
    expect(savedEntity.email).toBe('admin@aurora-flow.local');
  });

  it('usa bcrypt com o custo correto ao criar o seed', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockResolvedValue(makeUser());
    const hashSpy = jest.spyOn(bcrypt, 'hash');

    await service.ensureSeedAdmin();

    expect(hashSpy).toHaveBeenCalledWith('AuroraFlow@123', BCRYPT_COST_FACTOR);
  });
});
