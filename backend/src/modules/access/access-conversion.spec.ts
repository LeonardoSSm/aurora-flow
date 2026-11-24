import type { PermissionScope } from '../../common/constants/permission-catalog';
import { FULL_PROCESS_GRANTS } from '../../common/constants/process-permission-catalog';
import { convertAccess, type ConversionForm, type ConversionUser } from './access-conversion';

/** A semente dos 4 perfis (migration RolesAndPermissions + ResponsesViewDetailPermission). */
const SEED: Record<string, Record<string, PermissionScope>> = {
  admin: {
    'forms.view': 'all',
    'forms.edit': 'all',
    'solicitations.view': 'all',
    'solicitations.manage': 'all',
    'flows.manage': 'all',
  },
  manager: {
    'forms.view': 'area',
    'forms.create': 'all',
    'forms.edit': 'area',
    'forms.publish': 'area',
    'responses.view': 'area',
    'responses.export': 'all',
    'responses.view_sensitive': 'all',
    'solicitations.view': 'area',
    'solicitations.manage': 'area',
    'comments.view_internal': 'all',
    'flows.view': 'all',
    'flows.manage': 'all',
    'analytics.view': 'all',
    'approvals.decide': 'all',
    'approvals.manage': 'all',
    'attachments.manage_all': 'all',
    'kanban_phases.manage': 'all',
  },
  editor: {
    'forms.view': 'own',
    'forms.create': 'all',
    'forms.edit': 'own',
    'forms.publish': 'own',
    'responses.view': 'own',
    'solicitations.view': 'own',
    'solicitations.manage': 'own',
    'flows.view': 'own',
    'flows.manage': 'own',
    'analytics.view': 'own',
    'approvals.decide': 'assigned',
    'kanban_phases.manage': 'all',
  },
  viewer: {
    'forms.view': 'area',
    'responses.view': 'assigned',
    'solicitations.view': 'assigned',
    'flows.view': 'assigned',
    'analytics.view': 'assigned',
    'approvals.decide': 'assigned',
  },
};

const roleGrants = new Map(
  Object.entries(SEED).map(([role, codes]) => [role, new Map(Object.entries(codes))] as const),
);

const users: ConversionUser[] = [
  { id: 'admin', role: 'admin', areaId: null },
  { id: 'gestor-a', role: 'manager', areaId: 'area-a' },
  { id: 'gestor-sem-area', role: 'manager', areaId: null },
  { id: 'editor', role: 'editor', areaId: 'area-a' },
  { id: 'leitor-a', role: 'viewer', areaId: 'area-a' },
];

const forms: ConversionForm[] = [
  { id: 'do-editor', createdBy: 'editor', areaId: 'area-b', status: 'published' },
  { id: 'area-a', createdBy: 'admin', areaId: 'area-a', status: 'published' },
  { id: 'area-a-rascunho', createdBy: 'admin', areaId: 'area-a', status: 'draft' },
  { id: 'area-b', createdBy: 'admin', areaId: 'area-b', status: 'published' },
  { id: 'sem-area', createdBy: 'admin', areaId: null, status: 'published' },
];

function run(assignees: Record<string, string[]> = {}) {
  return convertAccess({
    roleGrants,
    users,
    forms,
    assignees: new Map(Object.entries(assignees).map(([form, ids]) => [form, new Set(ids)])),
  });
}

const membershipOf = (result: ReturnType<typeof run>, userId: string, formId: string) =>
  result.memberships.find((m) => m.userId === userId && m.formId === formId);
const formsOf = (result: ReturnType<typeof run>, userId: string) =>
  result.memberships.filter((m) => m.userId === userId).map((m) => m.formId).sort();

describe('convertAccess — do perfil global ao vínculo por processo', () => {
  it('perfil que via e operava tudo ganha acesso total, sem vínculo por processo', () => {
    const result = run();
    expect(result.fullAccessRoles).toEqual(['admin']);
    expect(formsOf(result, 'admin')).toEqual([]);
  });

  it('o criador vira membro completo, com tudo marcado', () => {
    const membership = membershipOf(run(), 'editor', 'do-editor');
    expect(membership).toMatchObject({ reason: 'criador', grants: FULL_PROCESS_GRANTS });
  });

  it('gestor: os processos da área e os sem área, com o que o perfil dava neles', () => {
    const result = run();
    expect(formsOf(result, 'gestor-a')).toEqual(['area-a', 'area-a-rascunho', 'sem-area']);
    expect(membershipOf(result, 'gestor-a', 'area-a')?.grants).toEqual({
      'solicitations.view': 'all',
      'solicitations.create': 'all',
      'solicitations.act': 'all',
      'solicitations.reassign': 'all',
      'comments.view_internal': 'all',
      'attachments.manage_all': 'all',
      'approvals.manage': 'all',
      'approvals.view_all': 'all',
      'responses.view': 'all',
      'responses.view_sensitive': 'all',
      'responses.export': 'all',
      'analytics.view': 'all',
      'forms.edit': 'all',
      'kanban_phases.manage': 'all',
      'forms.publish': 'all',
      'flows.view': 'all',
      'flows.manage': 'all',
    });
  });

  it('gestor sem área (exceção antiga do perfil manager) via todos os processos', () => {
    expect(formsOf(run(), 'gestor-sem-area')).toEqual(['area-a', 'area-a-rascunho', 'area-b', 'do-editor', 'sem-area']);
  });

  it('editor: só o que criou; nos atribuídos, tudo o que o perfil tinha, no processo inteiro', () => {
    const result = run({ 'area-b': ['editor'] });
    expect(formsOf(result, 'editor')).toEqual(['area-b', 'do-editor']);
    const assigned = membershipOf(result, 'editor', 'area-b');
    expect(assigned?.reason).toBe('atribuído');
    expect(assigned?.grants).toMatchObject({ 'solicitations.view': 'all', 'forms.edit': 'all', 'flows.manage': 'all' });
    // O que o perfil não tinha não aparece, nem com atribuição.
    expect(assigned?.grants['responses.export']).toBeUndefined();
    expect(assigned?.grants['process.access.manage']).toBeUndefined();
  });

  it('leitor: processos publicados da área, vendo só os cards atribuídos a ele', () => {
    const result = run();
    expect(formsOf(result, 'leitor-a')).toEqual(['area-a', 'sem-area']); // rascunho fica de fora
    expect(membershipOf(result, 'leitor-a', 'area-a')?.grants).toEqual({ 'solicitations.view': 'own' });
  });

  it('ninguém ganha "gerenciar acesso" a não ser o criador', () => {
    const result = run({ 'area-b': ['editor', 'leitor-a'] });
    const withAccessManage = result.memberships.filter((m) => m.grants['process.access.manage']);
    expect(withAccessManage.every((m) => m.reason === 'criador')).toBe(true);
  });
});
