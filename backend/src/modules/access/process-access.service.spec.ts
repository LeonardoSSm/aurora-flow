import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { cardAllowed, type AccessActor, ProcessAccessService } from './process-access.service';
import { fakeProcessAccess, grantsFor } from './testing/fake-process-access';

const actor = (sub: string, role = 'operador'): AccessActor => ({ sub, role });

describe('ProcessGrants — o que a pessoa pode em cada processo', () => {
  const grants = grantsFor('u1', false, {
    'form-a': { 'solicitations.view': 'all', 'solicitations.act': 'all', 'flows.manage': 'all' },
    'form-b': { 'solicitations.view': 'own' },
    'form-c': {},
  });

  it('o código do vínculo vale só no processo em que está marcado', () => {
    expect(grants.scope('form-a', 'solicitations.act')).toBe('all');
    expect(grants.scope('form-b', 'solicitations.act')).toBe('none');
    expect(grants.scope('form-x', 'solicitations.view')).toBe('none');
  });

  it('"ver solicitações" pode ser só dos próprios cards', () => {
    expect(grants.scope('form-b', 'solicitations.view')).toBe('own');
  });

  it('vínculo sem nenhuma caixinha ainda é vínculo: vê o processo (forms.view)', () => {
    expect(grants.isMember('form-c')).toBe(true);
    expect(grants.scope('form-c', 'forms.view')).toBe('all');
    expect(grants.scope('form-x', 'forms.view')).toBe('none');
  });

  it('códigos antigos valem pelos novos (apelidos)', () => {
    expect(grants.scope('form-a', 'solicitations.manage')).toBe('all'); // atuar
    expect(grants.scope('form-a', 'automations.manage')).toBe('all'); // fluxos
    expect(grants.scope('form-a', 'standard_questions.manage')).toBe('all');
    expect(grants.scope('form-b', 'solicitations.manage')).toBe('none');
  });

  it('em algum processo / lista de processos por código', () => {
    expect(grants.hasAnywhere('flows.manage')).toBe(true);
    expect(grants.hasAnywhere('forms.edit')).toBe(false);
    expect(grants.formIds('solicitations.view')).toEqual({ all: ['form-a'], own: ['form-b'] });
  });

  it('acesso total: tudo em todo processo', () => {
    const full = grantsFor('adm', true);
    expect(full.scope('qualquer', 'forms.edit')).toBe('all');
    expect(full.isMember('qualquer')).toBe(true);
    expect(full.hasAnywhere('process.access.manage')).toBe(true);
  });
});

describe('cardAllowed — a regra do card', () => {
  const card = (overrides: Partial<{ formId: string | null; createdBy: string | null; assigneeId: string | null }> = {}) => ({
    formId: 'form-a',
    createdBy: 'outra',
    assigneeId: null,
    ...overrides,
  });

  it('ver: todos os cards com "ver" total; só os próprios com "só os meus"', () => {
    const all = grantsFor('u1', false, { 'form-a': { 'solicitations.view': 'all' } });
    const own = grantsFor('u1', false, { 'form-a': { 'solicitations.view': 'own' } });
    expect(cardAllowed(all, card(), 'u1', 'solicitations.view')).toBe(true);
    expect(cardAllowed(own, card(), 'u1', 'solicitations.view')).toBe(false);
    expect(cardAllowed(own, card({ assigneeId: 'u1' }), 'u1', 'solicitations.view')).toBe(true);
  });

  it('o próprio pedido se vê sem vínculo nenhum — mas não se age nele', () => {
    const none = grantsFor('u1', false);
    expect(cardAllowed(none, card({ createdBy: 'u1' }), 'u1', 'solicitations.view')).toBe(true);
    expect(cardAllowed(none, card({ createdBy: 'u1' }), 'u1', 'solicitations.act')).toBe(false);
  });

  it('agir pede o código E ver o card', () => {
    const actOnly = grantsFor('u1', false, { 'form-a': { 'solicitations.act': 'all', 'solicitations.view': 'own' } });
    expect(cardAllowed(actOnly, card(), 'u1', 'solicitations.act')).toBe(false);
    expect(cardAllowed(actOnly, card({ assigneeId: 'u1' }), 'u1', 'solicitations.act')).toBe(true);
  });

  it('card de outro processo: nada', () => {
    const grants = grantsFor('u1', false, { 'form-a': { 'solicitations.view': 'all' } });
    expect(cardAllowed(grants, card({ formId: 'form-b' }), 'u1', 'solicitations.view')).toBe(false);
  });

  it('card sem processo: só o próprio (ou acesso total)', () => {
    const grants = grantsFor('u1', false, { 'form-a': { 'solicitations.view': 'all' } });
    expect(cardAllowed(grants, card({ formId: null }), 'u1', 'solicitations.view')).toBe(false);
    expect(cardAllowed(grants, card({ formId: null, createdBy: 'u1' }), 'u1', 'solicitations.act')).toBe(true);
    expect(cardAllowed(grantsFor('adm', true), card({ formId: null }), 'adm', 'solicitations.act')).toBe(true);
  });
});

describe('ProcessAccessService — processo', () => {
  const form = { id: 'form-a', name: 'A' };
  const formsRepository = { findOne: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'form-a' ? form : null)) };

  it('assertFormAccess: inexistente 404; sem o código 403; com um dos códigos passa', async () => {
    const service = fakeProcessAccess({
      formsRepository,
      members: { u1: { 'form-a': { 'flows.view': 'all' } } },
    });
    await expect(service.assertFormAccess('nada', actor('u1'), 'forms.view')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertFormAccess('form-a', actor('u1'), 'forms.edit')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertFormAccess('form-a', actor('u1'), ['forms.edit', 'flows.view'])).resolves.toBe(form);
  });

  it('ver o processo: vínculo, ou um card próprio dele; senão 403', async () => {
    const solicitationsRepository = {
      createQueryBuilder: jest.fn(() => {
        const qb = { where: jest.fn(), andWhere: jest.fn(), getExists: jest.fn().mockResolvedValue(false) };
        qb.where.mockReturnValue(qb);
        qb.andWhere.mockReturnValue(qb);
        return qb;
      }),
    };
    const service = fakeProcessAccess({
      formsRepository,
      solicitationsRepository,
      members: { membro: { 'form-a': {} } },
    });
    await expect(service.assertProcessVisible('form-a', actor('membro'))).resolves.toBe(form);
    await expect(service.assertProcessVisible('form-a', actor('estranho'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('canManageAccess: "gerenciar acesso" no processo ou acesso total (decisão 5)', async () => {
    const service = fakeProcessAccess({
      fullAccessRoles: ['admin'],
      members: { gestor: { 'form-a': { 'process.access.manage': 'all' } }, op: { 'form-a': { 'solicitations.view': 'all' } } },
    });
    await expect(service.canManageAccess(actor('gestor'), 'form-a')).resolves.toBe(true);
    await expect(service.canManageAccess(actor('op'), 'form-a')).resolves.toBe(false);
    await expect(service.canManageAccess(actor('adm', 'admin'), 'form-a')).resolves.toBe(true);
  });
});

describe('ProcessAccessService — filtros de lista', () => {
  const qb = () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    return { calls, andWhere: (sql: string, params?: Record<string, unknown>) => (calls.push([sql, params]), undefined) };
  };
  const service = fakeProcessAccess();

  it('cards: os próprios em qualquer lugar e todos dos processos com "ver" total', () => {
    const q = qb();
    service.applySolicitationScopeWith(
      q as never,
      grantsFor('u1', false, { 'form-a': { 'solicitations.view': 'all' }, 'form-b': { 'solicitations.view': 'own' } }),
    );
    expect(q.calls).toEqual([
      [
        '(solicitation.created_by = :scopeActorId OR solicitation.assignee_id = :scopeActorId OR solicitation.form_id IN (:...scopeAllFormIds))',
        { scopeActorId: 'u1', scopeAllFormIds: ['form-a'] },
      ],
    ]);
  });

  it('cards com acesso total: sem filtro', () => {
    const q = qb();
    service.applySolicitationScopeWith(q as never, grantsFor('adm', true));
    expect(q.calls).toEqual([]);
  });

  it('processos: só os com vínculo; sem vínculo nenhum, lista vazia', () => {
    const q = qb();
    service.applyFormScope(q as never, grantsFor('u1', false, { 'form-a': {} }), 'form.id');
    expect(q.calls[0][0]).toMatch(/^form\.id IN \(:\.\.\.scopeFormIds\w+\)$/);
    expect(Object.values(q.calls[0][1] ?? {})).toEqual([['form-a']]);

    const empty = qb();
    service.applyFormScope(empty as never, grantsFor('u1', false), 'form.id');
    expect(empty.calls).toEqual([['1 = 0', undefined]]);
  });
});

describe('ProcessAccessService — sessão do front', () => {
  it('sistema vem do perfil (sem os códigos de processo); processo vem do maior escopo entre vínculos', async () => {
    const service = fakeProcessAccess({
      members: {
        u1: {
          'form-a': { 'solicitations.view': 'own', 'flows.view': 'all' },
          'form-b': { 'solicitations.view': 'all', 'solicitations.act': 'all' },
        },
      },
    });
    (service as unknown as { permissions: { getAllForRole: jest.Mock } }).permissions.getAllForRole.mockResolvedValue({
      'users.manage': 'all',
      'flows.view': 'all',
      'solicitations.view': 'all', // linha antiga do perfil: não vale mais
      'forms.edit': 'own',
    });

    const session = await service.sessionPermissions(actor('u1'));

    expect(session.permissions).toMatchObject({
      'users.manage': 'all',
      'flows.view': 'all',
      'solicitations.view': 'all',
      'solicitations.act': 'all',
      'solicitations.manage': 'all', // apelido para as telas que ainda perguntam o código antigo
      'forms.view': 'all',
    });
    expect(session.permissions['forms.edit']).toBeUndefined();
    expect(session.processPermissions['form-a']).toEqual({ 'solicitations.view': 'own', 'flows.view': 'all' });
    expect(session.processesFullAccess).toBe(false);
  });
});

describe('ProcessAccessService — cache das permissões', () => {
  it('carrega uma vez por pessoa e recarrega depois de invalidar', async () => {
    const getRawMany = jest.fn().mockResolvedValue([{ formId: 'form-a', code: 'flows.view', scope: 'all' }]);
    const qb = { leftJoin: jest.fn(), select: jest.fn(), addSelect: jest.fn(), where: jest.fn(), getRawMany };
    for (const key of ['leftJoin', 'select', 'addSelect', 'where'] as const) qb[key].mockReturnValue(qb);
    const service = new ProcessAccessService(
      { hasAny: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
      {} as never,
      {} as never,
      { createQueryBuilder: jest.fn(() => qb) } as never,
      {} as never,
    );

    await service.grantsOf(actor('u1'));
    const second = await service.grantsOf(actor('u1'));
    expect(getRawMany).toHaveBeenCalledTimes(1);
    expect(second.scope('form-a', 'flows.view')).toBe('all');

    service.invalidate('u1');
    await service.grantsOf(actor('u1'));
    expect(getRawMany).toHaveBeenCalledTimes(2);
  });
});

describe('ProcessAccessService — gravar vínculo', () => {
  it('troca todas as permissões; ignora código fora do catálogo; "só os meus" só em ver solicitações', async () => {
    const saved: unknown[] = [];
    const permissions = {
      delete: jest.fn(),
      create: jest.fn((row: unknown) => row),
      save: jest.fn((rows: unknown[]) => saved.push(...rows)),
    };
    const members = { findOne: jest.fn().mockResolvedValue({ id: 'm1' }), save: jest.fn(), create: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) => (entity.name === 'FormMemberEntity' ? members : permissions)),
    };
    // De verdade (o fake só registra a gravação).
    const service = new ProcessAccessService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await service.writeMember(
      manager as never,
      'form-a',
      'u1',
      { 'solicitations.view': 'own', 'forms.edit': 'own', 'inventado.x': 'all' } as never,
      'admin',
    );

    expect(permissions.delete).toHaveBeenCalledWith({ memberId: 'm1' });
    expect(saved).toEqual([
      { memberId: 'm1', permissionCode: 'solicitations.view', scope: 'own' },
      { memberId: 'm1', permissionCode: 'forms.edit', scope: 'all' },
    ]);
  });
});
