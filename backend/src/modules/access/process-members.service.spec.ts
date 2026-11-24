import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProcessMembersService } from './process-members.service';
import { fakeProcessAccess } from './testing/fake-process-access';

const gestor = { sub: 'gestor', role: 'operador' };
const operador = { sub: 'operador', role: 'operador' };
const admin = { sub: 'adm', role: 'admin' };

function makeService(options: { existing?: Record<string, string> | null } = {}) {
  const processAccess = fakeProcessAccess({
    fullAccessRoles: ['admin'],
    members: {
      gestor: { 'form-a': { 'process.access.manage': 'all' } },
      operador: { 'form-a': { 'solicitations.view': 'all' } },
    },
  });
  const member = options.existing
    ? {
        formId: 'form-a',
        userId: 'pessoa',
        permissions: Object.entries(options.existing).map(([permissionCode, scope]) => ({ permissionCode, scope })),
      }
    : null;
  const emit = jest.fn();
  const service = new ProcessMembersService(
    { transaction: jest.fn((cb: (m: unknown) => unknown) => cb({})) } as never,
    { emit } as never,
    processAccess,
    {
      exists: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'form-a')),
      find: jest.fn().mockResolvedValue([
        { id: 'form-a', name: 'A', status: 'published' },
        { id: 'form-b', name: 'B', status: 'published' },
      ]),
    } as never,
    { findOne: jest.fn().mockResolvedValue(member), find: jest.fn().mockResolvedValue(member ? [member] : []) } as never,
    {
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'pessoa' ? { id: 'pessoa', fullName: 'Pessoa', email: 'p@x', role: 'operador', isActive: true } : null,
        ),
      ),
    } as never,
  );
  return { service, processAccess, emit };
}

describe('ProcessMembersService — quem mexe no acesso (decisão 5)', () => {
  it('"gerenciar quem tem acesso" no processo, ou acesso total, pode; os demais não', async () => {
    await expect(makeService().service.listMembers('form-a', gestor)).resolves.toEqual([]);
    await expect(makeService().service.listMembers('form-a', admin)).resolves.toEqual([]);
    await expect(makeService().service.listMembers('form-a', operador)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('processo inexistente: 404', async () => {
    await expect(makeService().service.listMembers('nada', admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcessMembersService.setMember', () => {
  it('grava as permissões e manda para a auditoria como "grant" (não havia vínculo)', async () => {
    const { service, processAccess, emit } = makeService();

    await service.setMember('form-a', 'pessoa', { 'solicitations.view': 'own', 'solicitations.act': 'all' }, gestor);

    expect(processAccess.writeMember).toHaveBeenCalledWith(
      expect.anything(),
      'form-a',
      'pessoa',
      { 'solicitations.view': 'own', 'solicitations.act': 'all' },
      'gestor',
    );
    expect(emit).toHaveBeenCalledWith(
      'process_members.changed',
      expect.objectContaining({ action: 'grant', formId: 'form-a', userId: 'pessoa', previous: null }),
    );
  });

  it('troca de permissões vai como "update", com o antes', async () => {
    const { service, emit } = makeService({ existing: { 'solicitations.view': 'all' } });

    await service.setMember('form-a', 'pessoa', { 'solicitations.view': 'own' }, gestor);

    expect(emit).toHaveBeenCalledWith(
      'process_members.changed',
      expect.objectContaining({ action: 'update', previous: { 'solicitations.view': 'all' } }),
    );
  });

  it.each([
    ['código fora do catálogo', { 'roles.manage': 'all' }],
    ['"só os meus" onde não existe', { 'forms.edit': 'own' }],
    ['escopo inventado', { 'solicitations.view': 'area' }],
  ])('recusa %s', async (_case, grants) => {
    const { service, processAccess } = makeService();
    await expect(service.setMember('form-a', 'pessoa', grants, gestor)).rejects.toBeInstanceOf(BadRequestException);
    expect(processAccess.writeMember).not.toHaveBeenCalled();
  });

  it('pessoa inexistente: 404', async () => {
    await expect(makeService().service.setMember('form-a', 'ninguem', {}, gestor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ProcessMembersService.removeMember', () => {
  it('tira o vínculo e audita como "revoke"', async () => {
    const { service, processAccess, emit } = makeService({ existing: { 'solicitations.view': 'all' } });

    await service.removeMember('form-a', 'pessoa', gestor);

    expect(processAccess.removeMember).toHaveBeenCalledWith(expect.anything(), 'form-a', 'pessoa');
    expect(emit).toHaveBeenCalledWith('process_members.changed', expect.objectContaining({ action: 'revoke', grants: {} }));
  });

  it('sem vínculo para tirar: 404', async () => {
    await expect(makeService().service.removeMember('form-a', 'pessoa', gestor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ProcessMembersService.listProcessesOfUser', () => {
  it('mostra os processos que quem consulta gerencia e os que a pessoa já tem', async () => {
    const { service } = makeService({ existing: { 'solicitations.view': 'all' } });

    const views = await service.listProcessesOfUser('pessoa', gestor);

    expect(views).toEqual([
      { formId: 'form-a', formName: 'A', status: 'published', grants: { 'solicitations.view': 'all' }, canManage: true },
    ]);
  });

  it('com acesso total, todos os processos', async () => {
    const views = await makeService().service.listProcessesOfUser('pessoa', admin);
    expect(views.map((view) => [view.formId, view.canManage, view.grants])).toEqual([
      ['form-a', true, null],
      ['form-b', true, null],
    ]);
  });
});
