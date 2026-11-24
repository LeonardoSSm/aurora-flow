import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RoleEntity, RolePermissionEntity, UserEntity } from '../../database/entities';
import { RolesService } from './roles.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRole(overrides: Partial<RoleEntity> = {}): RoleEntity {
  return {
    code: 'editor',
    name: 'Editor',
    description: null,
    color: 'green',
    isSystem: true,
    permissions: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as unknown as RoleEntity;
}

function makeGrant(overrides: Partial<RolePermissionEntity> = {}): RolePermissionEntity {
  return {
    id: 'grant-id',
    roleId: 'editor',
    permissionCode: 'forms.view',
    scope: 'own',
    ...overrides,
  } as unknown as RolePermissionEntity;
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-id',
    fullName: 'Maria Souza',
    email: 'maria@formhub.local',
    role: 'editor',
    isActive: true,
    lastLoginAt: null,
    ...overrides,
  } as unknown as UserEntity;
}

function makeRolesRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockImplementation((entity: object) => Promise.resolve(entity)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeRolePermissionsRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeUsersRepo() {
  return {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
}

function makeUsersService() {
  return {
    update: jest.fn().mockImplementation((_id: string, dto: object) => Promise.resolve({ ...dto })),
  };
}

function makePermissionsService() {
  return {
    invalidate: jest.fn(),
    hasAny: jest.fn().mockResolvedValue(true),
    getScope: jest.fn().mockResolvedValue('all'),
  };
}

function makeService() {
  const rolesRepo = makeRolesRepo();
  const rolePermissionsRepo = makeRolePermissionsRepo();
  const usersRepo = makeUsersRepo();
  const usersService = makeUsersService();
  const permissionsService = makePermissionsService();

  const service = new RolesService(
    rolesRepo as never,
    rolePermissionsRepo as never,
    usersRepo as never,
    usersService as never,
    permissionsService as never,
  );

  return { service, rolesRepo, rolePermissionsRepo, usersRepo, usersService, permissionsService };
}

// ─── findAll ─────────────────────────────────────────────────────────────────

describe('RolesService.findAll', () => {
  it('mapeia cada RoleEntity para um DTO com permissions como mapa código→escopo', async () => {
    const { service, rolesRepo, usersRepo } = makeService();
    rolesRepo.find.mockResolvedValue([
      makeRole({ code: 'admin', permissions: [makeGrant({ permissionCode: 'forms.view', scope: 'all' })] }),
    ]);
    usersRepo.count.mockResolvedValue(2);

    const result = await service.findAll();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('admin');
    expect(result[0].permissions).toEqual({ 'forms.view': 'all' });
    expect(result[0].userCount).toBe(2);
  });

  it('conta usuários ativos separadamente', async () => {
    const { service, rolesRepo, usersRepo } = makeService();
    rolesRepo.find.mockResolvedValue([makeRole()]);
    usersRepo.count.mockImplementation(({ where }: { where: { isActive?: boolean } }) =>
      Promise.resolve(where.isActive ? 2 : 5),
    );

    const [role] = await service.findAll();

    expect(role.userCount).toBe(5);
    expect(role.activeUserCount).toBe(2);
  });
});

// ─── findOne ─────────────────────────────────────────────────────────────────

describe('RolesService.findOne', () => {
  it('retorna DTO com lista de usuários do perfil', async () => {
    const { service, rolesRepo, usersRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'admin' }));
    usersRepo.find.mockResolvedValue([
      makeUser({ id: 'u1', isActive: true }),
      makeUser({ id: 'u2', isActive: false }),
    ]);

    const result = await service.findOne('admin');

    expect(result.code).toBe('admin');
    expect(result.users).toHaveLength(2);
    expect(result.userCount).toBe(2);
    expect(result.activeUserCount).toBe(1);
  });

  it('lança NotFoundException quando o código não existe', async () => {
    const { service, rolesRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('RolesService.create', () => {
  it('cria o perfil e grava as permissões informadas', async () => {
    const { service, rolesRepo, rolePermissionsRepo, permissionsService } = makeService();
    rolesRepo.findOne
      .mockResolvedValueOnce(null) // uniqueness check
      .mockResolvedValueOnce(makeRole({ code: 'auditor', name: 'Auditor' })); // findAndReturn

    const result = await service.create({
      code: 'auditor',
      name: 'Auditor',
      permissions: [{ code: 'audit.view', scope: 'all' }],
    });

    expect(rolesRepo.save).toHaveBeenCalled();
    expect(rolePermissionsRepo.delete).toHaveBeenCalledWith({ roleId: 'auditor', permissionCode: expect.anything() });
    expect(rolePermissionsRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ roleId: 'auditor', permissionCode: 'audit.view', scope: 'all' }),
    ]);
    expect(permissionsService.invalidate).toHaveBeenCalledWith('auditor');
    expect(result.code).toBe('auditor');
  });

  it('lança BadRequestException quando o código já existe', async () => {
    const { service, rolesRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'editor' }));

    await expect(
      service.create({ code: 'editor', name: 'Duplicado' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException para código de permissão desconhecido', async () => {
    const { service, rolesRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        code: 'auditor',
        name: 'Auditor',
        permissions: [{ code: 'not.a.real.permission', scope: 'all' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dashboard.view_forms_stats saiu do catálogo: o resumo do Início segue o vínculo com o processo', async () => {
    const { service, rolesRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        code: 'auditor',
        name: 'Auditor',
        permissions: [{ code: 'dashboard.view_forms_stats', scope: 'all' }],
      }),
    ).rejects.toThrow('Código de permissão desconhecido: "dashboard.view_forms_stats".');
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('RolesService.update', () => {
  it('atualiza apenas os campos informados', async () => {
    const { service, rolesRepo } = makeService();
    const role = makeRole({ code: 'editor', name: 'Editor', color: 'green' });
    rolesRepo.findOne.mockResolvedValue(role);

    await service.update('editor', { name: 'Editor Sênior' });

    expect(rolesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Editor Sênior', color: 'green' }),
    );
  });
});

// ─── updatePermissions ────────────────────────────────────────────────────────

describe('RolesService.updatePermissions', () => {
  it('substitui a matriz de permissões do perfil', async () => {
    const { service, rolesRepo, rolePermissionsRepo, permissionsService } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'editor' }));
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await service.updatePermissions('editor', [{ code: 'forms.view', scope: 'area' }]);

    expect(rolePermissionsRepo.delete).toHaveBeenCalledWith({ roleId: 'editor', permissionCode: expect.anything() });
    expect(rolePermissionsRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ roleId: 'editor', permissionCode: 'forms.view', scope: 'area' }),
    ]);
    expect(permissionsService.invalidate).toHaveBeenCalledWith('editor');
  });

  it('troca só os códigos de sistema e os enviados: as linhas antigas de processo ficam para desfazer o deploy', async () => {
    const { service, rolesRepo, rolePermissionsRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'editor' }));
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await service.updatePermissions('editor', [{ code: 'audit.view', scope: 'all' }]);

    const [criteria] = rolePermissionsRepo.delete.mock.calls[0] as [{ roleId: string; permissionCode: { value: string[] } }];
    expect(criteria.roleId).toBe('editor');
    expect(criteria.permissionCode.value).toEqual(expect.arrayContaining(['audit.view', 'roles.manage', 'item_lists.manage']));
    // Códigos de processo que a tela não mostra (e o código anterior lê) não são apagados.
    expect(criteria.permissionCode.value).not.toContain('forms.view');
    expect(criteria.permissionCode.value).not.toContain('solicitations.view');
  });

  it('omite entradas com scope "none" (linha ausente = none implícito)', async () => {
    const { service, rolesRepo, rolePermissionsRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'editor' }));
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await service.updatePermissions('editor', [
      { code: 'forms.view', scope: 'own' },
      { code: 'forms.publish', scope: 'none' },
    ]);

    expect(rolePermissionsRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ permissionCode: 'forms.view', scope: 'own' }),
    ]);
  });

  it('lança BadRequestException se a edição deixaria zero perfis com roles.manage', async () => {
    const { service, rolesRepo, rolePermissionsRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'admin' }));
    // Only 'admin' currently holds roles.manage, and no other role does.
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await expect(
      service.updatePermissions('admin', [{ code: 'roles.manage', scope: 'none' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException se a edição deixaria zero perfis com acesso total aos processos', async () => {
    const { service, rolesRepo, rolePermissionsRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'admin' }));
    const grants = [
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
      makeGrant({ roleId: 'admin', permissionCode: 'processes.full_access', scope: 'all' }),
    ];
    rolePermissionsRepo.find.mockImplementation(({ where }: { where?: { permissionCode?: string } } = {}) =>
      Promise.resolve(grants.filter((g) => !where?.permissionCode || g.permissionCode === where.permissionCode)),
    );

    // Mantém roles.manage, mas tira o acesso total do único perfil que o tinha.
    await expect(
      service.updatePermissions('admin', [{ code: 'roles.manage', scope: 'all' }]),
    ).rejects.toThrow('acesso total aos processos');
  });

  it('permite remover roles.manage de um perfil se outro perfil ainda o detém', async () => {
    const { service, rolesRepo, rolePermissionsRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'manager' }));
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
      makeGrant({ roleId: 'manager', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await expect(
      service.updatePermissions('manager', [{ code: 'roles.manage', scope: 'none' }]),
    ).resolves.toBeDefined();
  });
});

// ─── remove ──────────────────────────────────────────────────────────────────

describe('RolesService.remove', () => {
  it('exclui o perfil quando não há usuários nem violação da trava de roles.manage', async () => {
    const { service, rolesRepo, usersRepo, rolePermissionsRepo, permissionsService } =
      makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'auditor' }));
    usersRepo.count.mockResolvedValue(0);
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await service.remove('auditor');

    expect(rolesRepo.delete).toHaveBeenCalledWith({ code: 'auditor' });
    expect(permissionsService.invalidate).toHaveBeenCalledWith('auditor');
  });

  it('lança BadRequestException quando o perfil ainda tem usuários', async () => {
    const { service, rolesRepo, usersRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'editor' }));
    usersRepo.count.mockResolvedValue(3);

    await expect(service.remove('editor')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException se excluir deixaria zero perfis com roles.manage', async () => {
    const { service, rolesRepo, usersRepo, rolePermissionsRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'admin' }));
    usersRepo.count.mockResolvedValue(0);
    rolePermissionsRepo.find.mockResolvedValue([
      makeGrant({ roleId: 'admin', permissionCode: 'roles.manage', scope: 'all' }),
    ]);

    await expect(service.remove('admin')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança NotFoundException quando o código não existe', async () => {
    const { service, rolesRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(null);

    await expect(service.remove('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── updateUserRole ───────────────────────────────────────────────────────────

describe('RolesService.updateUserRole', () => {
  it('delega para UsersService.update com o novo código de perfil', async () => {
    const { service, rolesRepo, usersService } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'manager' }));

    await service.updateUserRole('user-id', 'manager');

    expect(usersService.update).toHaveBeenCalledWith('user-id', { role: 'manager' });
  });

  it('lança BadRequestException quando o perfil de destino não existe', async () => {
    const { service, rolesRepo } = makeService();
    rolesRepo.findOne.mockResolvedValue(null);

    await expect(service.updateUserRole('user-id', 'ghost')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('propaga NotFoundException do UsersService quando o usuário não existe', async () => {
    const { service, rolesRepo, usersService } = makeService();
    rolesRepo.findOne.mockResolvedValue(makeRole({ code: 'manager' }));
    usersService.update.mockRejectedValue(new NotFoundException('Usuário não encontrado.'));

    await expect(service.updateUserRole('ghost-id', 'manager')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
