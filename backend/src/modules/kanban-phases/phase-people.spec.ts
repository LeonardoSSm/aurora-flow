import {
  isPhasePerson,
  normalizePhasePeople,
  phaseActors,
  phaseApprovalRule,
  phaseApproverMetadata,
  phaseApprovers,
} from './phase-people';

describe('phase-people', () => {
  it('ninguém escolhido vira null; tira repetições', () => {
    expect(normalizePhasePeople({ roleCodes: [], userIds: [] })).toBeNull();
    expect(normalizePhasePeople({ roleCodes: ['a', ' a '], userIds: ['u'] })).toEqual({ roleCodes: ['a'], userIds: ['u'] });
  });

  it('lê o formato novo e, em fase antiga, o perfil único', () => {
    expect(phaseActors({ actors: { roleCodes: ['logistica'], userIds: ['u1'] }, actorRoleCode: 'logistica' })).toEqual({
      roleCodes: ['logistica'],
      userIds: ['u1'],
    });
    expect(phaseActors({ actors: null, actorRoleCode: 'operador' })).toEqual({ roleCodes: ['operador'], userIds: [] });
    expect(phaseApprovers({ approvers: null, approverRoleCode: null })).toBeNull();
  });

  it('basta casar perfil ou usuário; sem lista, qualquer um', () => {
    const people = { roleCodes: ['logistica'], userIds: ['u1'] };
    expect(isPhasePerson(people, { sub: 'x', role: 'logistica' })).toBe(true);
    expect(isPhasePerson(people, { sub: 'u1', role: 'vendedor' })).toBe(true);
    expect(isPhasePerson(people, { sub: 'x', role: 'vendedor' })).toBe(false);
    expect(isPhasePerson(null, { sub: 'x', role: 'vendedor' })).toBe(true);
  });
});

describe('aprovação de fase com várias pessoas', () => {
  it('a ordem guarda só quem está na lista, sem repetir; quem faltar vai para o fim', () => {
    expect(
      normalizePhasePeople({ roleCodes: ['gerente'], userIds: ['u-1', 'u-2'], order: ['user:u-2', 'role:gerente', 'user:u-2', 'user:fora'] }),
    ).toEqual({ roleCodes: ['gerente'], userIds: ['u-1', 'u-2'], order: ['user:u-2', 'role:gerente', 'user:u-1'] });
    expect(normalizePhasePeople({ roleCodes: ['gerente'], userIds: [] })).toEqual({ roleCodes: ['gerente'], userIds: [] });
  });

  it('regra da fase vira o modo da aprovação', () => {
    const people = { roleCodes: ['gerente'], userIds: ['u-1'], order: ['user:u-1', 'role:gerente'] };
    expect(phaseApprovalRule({ approvalMode: 'any' }, people)).toEqual({ mode: 'parallel', requireAll: false });
    expect(phaseApprovalRule({ approvalMode: 'all' }, people)).toEqual({ mode: 'parallel', requireAll: true });
    expect(phaseApprovalRule({ approvalMode: 'sequential' }, people)).toEqual({
      mode: 'sequential',
      requireAll: true,
      assigneeOrder: ['user:u-1', 'role:gerente'],
    });
  });

  it('os fluxos recebem quem aprova, o primeiro perfil (fluxos antigos) e a regra', () => {
    expect(
      phaseApproverMetadata({
        approvers: { roleCodes: ['gerente', 'diretoria'], userIds: ['u-1'] },
        approverRoleCode: 'gerente',
        approvalMode: 'all',
      }),
    ).toEqual({
      approverRoleCode: 'gerente',
      approverRoleCodes: ['gerente', 'diretoria'],
      approverUserIds: ['u-1'],
      approvalMode: 'all',
      approverOrder: [],
    });
  });
});
