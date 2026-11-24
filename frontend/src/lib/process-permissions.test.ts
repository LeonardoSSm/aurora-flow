import { canInProcess } from './process-permissions';

const session = {
  permissions: { 'users.manage': 'all', 'solicitations.act': 'all', 'solicitations.manage': 'all' } as const,
  processPermissions: {
    'form-a': { 'solicitations.view': 'own', 'solicitations.act': 'all', 'flows.manage': 'all' },
    'form-b': {},
  } as const,
  processesFullAccess: false,
};

describe('canInProcess — o que a pessoa pode em cada processo', () => {
  it('com processo: vale só o vínculo com ELE', () => {
    expect(canInProcess(session, 'solicitations.act', 'form-a')).toBe(true);
    expect(canInProcess(session, 'solicitations.act', 'form-b')).toBe(false);
    expect(canInProcess(session, 'solicitations.act', 'form-sem-vinculo')).toBe(false);
  });

  it('códigos antigos valem pelos novos', () => {
    expect(canInProcess(session, 'solicitations.manage', 'form-a')).toBe(true);
    expect(canInProcess(session, 'automations.manage', 'form-a')).toBe(true);
    expect(canInProcess(session, 'solicitations.manage', 'form-b')).toBe(false);
  });

  it('vínculo sem caixinha ainda vê o processo (forms.view)', () => {
    expect(canInProcess(session, 'forms.view', 'form-b')).toBe(true);
    expect(canInProcess(session, 'forms.view', 'form-x')).toBe(false);
  });

  it('sem processo: em algum processo (menus); permissão de sistema ignora o processo', () => {
    expect(canInProcess(session, 'solicitations.act')).toBe(true);
    expect(canInProcess(session, 'users.manage', 'form-b')).toBe(true);
    expect(canInProcess(session, 'roles.manage', 'form-a')).toBe(false);
  });

  it('acesso total: tudo em todo processo', () => {
    const full = { permissions: {}, processPermissions: {}, processesFullAccess: true };
    expect(canInProcess(full, 'forms.edit', 'qualquer')).toBe(true);
  });
});
