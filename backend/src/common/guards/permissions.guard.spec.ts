import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { fakeProcessAccess } from '../../modules/access/testing/fake-process-access';

function makeContext(user: { role: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(requiredPermission: string | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(requiredPermission),
  } as unknown as Reflector;
}

describe('PermissionsGuard', () => {
  it('allows any authenticated user through when no @RequirePermission() is set', async () => {
    const guard = new PermissionsGuard(makeReflector(undefined), { getScope: jest.fn() } as never, fakeProcessAccess() as never);

    await expect(guard.canActivate(makeContext({ role: 'viewer' }))).resolves.toBe(true);
  });

  it('throws ForbiddenException when there is no authenticated user', async () => {
    const guard = new PermissionsGuard(
      makeReflector('reports.view'),
      { getScope: jest.fn() } as never,
      fakeProcessAccess() as never,
    );

    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the role scope for the permission is "none"', async () => {
    const permissionsService = { getScope: jest.fn().mockResolvedValue('none') };
    const guard = new PermissionsGuard(
      makeReflector('reports.view'),
      permissionsService as never, fakeProcessAccess() as never,
    );

    await expect(guard.canActivate(makeContext({ role: 'editor' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(permissionsService.getScope).toHaveBeenCalledWith('editor', 'reports.view');
  });

  it('allows access and stashes the resolved scope when the role holds the permission', async () => {
    const permissionsService = { getScope: jest.fn().mockResolvedValue('all') };
    const guard = new PermissionsGuard(
      makeReflector('reports.view'),
      permissionsService as never, fakeProcessAccess() as never,
    );
    const request: { user?: { role: string }; permissionScope?: string } = {
      user: { role: 'admin' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.permissionScope).toBe('all');
  });
});

describe('PermissionsGuard — permissão de processo', () => {
  const contextOf = (user: { sub: string; role: string }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  it('vale ter o código em ALGUM processo — o perfil não é consultado', async () => {
    const permissions = { getScope: jest.fn() };
    const guard = new PermissionsGuard(
      makeReflector('solicitations.act'),
      permissions as never,
      fakeProcessAccess({ members: { u1: { 'form-a': { 'solicitations.act': 'all' } } } }) as never,
    );

    await expect(guard.canActivate(contextOf({ sub: 'u1', role: 'qualquer' }))).resolves.toBe(true);
    expect(permissions.getScope).not.toHaveBeenCalled();
  });

  it('código antigo (apelido) vale pelo novo: solicitations.manage = criar, atuar ou reatribuir', async () => {
    const guard = new PermissionsGuard(
      makeReflector('solicitations.manage'),
      { getScope: jest.fn() } as never,
      fakeProcessAccess({ members: { u1: { 'form-a': { 'solicitations.reassign': 'all' } } } }) as never,
    );
    await expect(guard.canActivate(contextOf({ sub: 'u1', role: 'x' }))).resolves.toBe(true);
  });

  it('sem o código em processo nenhum: 403, mesmo que o perfil antigo o tivesse', async () => {
    const guard = new PermissionsGuard(
      makeReflector('forms.edit'),
      { getScope: jest.fn().mockResolvedValue('all') } as never,
      fakeProcessAccess({ members: { u1: { 'form-a': { 'solicitations.view': 'all' } } } }) as never,
    );
    await expect(guard.canActivate(contextOf({ sub: 'u1', role: 'manager' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('acesso total pelo perfil passa em qualquer código de processo', async () => {
    const guard = new PermissionsGuard(
      makeReflector('forms.edit'),
      { getScope: jest.fn() } as never,
      fakeProcessAccess({ fullAccessRoles: ['admin'] }) as never,
    );
    await expect(guard.canActivate(contextOf({ sub: 'adm', role: 'admin' }))).resolves.toBe(true);
  });
});
