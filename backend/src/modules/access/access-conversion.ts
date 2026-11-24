import type { PermissionScope } from '../../common/constants/permission-catalog';
import {
  FULL_PROCESS_GRANTS,
  type ProcessPermissionScope,
} from '../../common/constants/process-permission-catalog';

/**
 * Converte o acesso de hoje (perfil global + atribuição ao formulário) em vínculos pessoa × processo.
 *
 * Função pura: recebe as linhas do banco e devolve o que gravar. A migration grava; o relatório
 * "antes × depois" (scripts/access-report.ts) só mostra. A regra repete a do sistema antigo
 * (scope-filter.helper / form-access.helper) de propósito, sem importar aqueles helpers: a migration
 * tem de dar o mesmo resultado amanhã, mesmo que eles mudem.
 */

export interface ConversionUser {
  id: string;
  role: string;
  areaId: string | null;
}

export interface ConversionForm {
  id: string;
  createdBy: string | null;
  areaId: string | null;
  status: string;
}

export interface ConversionInput {
  /** perfil → código → escopo (linha ausente = 'none'). */
  roleGrants: ReadonlyMap<string, ReadonlyMap<string, PermissionScope>>;
  users: readonly ConversionUser[];
  forms: readonly ConversionForm[];
  /** formulário → pessoas atribuídas (form_assignees). */
  assignees: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ConvertedMembership {
  formId: string;
  userId: string;
  /** Por que a pessoa ganhou o vínculo — vai para o relatório. */
  reason: 'criador' | 'atribuído' | 'perfil';
  grants: Record<string, ProcessPermissionScope>;
}

export interface ConversionResult {
  /** Perfis que viam e operavam todos os processos: ganham `processes.full_access`. */
  fullAccessRoles: string[];
  memberships: ConvertedMembership[];
}

/** De onde vem cada permissão do vínculo no perfil antigo (basta um dos códigos). */
const SOURCES: Readonly<Record<string, readonly string[]>> = {
  'solicitations.view': ['solicitations.view'],
  'solicitations.create': ['solicitations.manage'],
  'solicitations.act': ['solicitations.manage'],
  'solicitations.reassign': ['solicitations.manage'],
  'solicitations.regenerate_token': ['solicitations.regenerate_token'],
  'comments.view_internal': ['comments.view_internal'],
  'attachments.upload': ['attachments.upload'],
  'attachments.manage_all': ['attachments.manage_all'],
  'approvals.manage': ['approvals.manage'],
  // "Ver todas as aprovações" era approvals.decide com escopo que alcança o formulário.
  'approvals.view_all': ['approvals.decide'],
  'responses.view': ['responses.view'],
  'responses.view_sensitive': ['responses.view_sensitive'],
  'responses.export': ['responses.export'],
  'analytics.view': ['analytics.view'],
  'analytics.manage': ['dashboards.manage'],
  'forms.edit': ['forms.edit'],
  'kanban_phases.manage': ['kanban_phases.manage'],
  'forms.publish': ['forms.publish'],
  'flows.view': ['flows.view'],
  'flows.manage': ['flows.manage', 'automations.manage', 'standard_questions.manage'],
};

/** Códigos antigos com escopo: o escopo decide se valem NO formulário. Os outros valiam em todo processo visível. */
const SCOPABLE = new Set([
  'forms.view',
  'forms.edit',
  'forms.publish',
  'responses.view',
  'solicitations.view',
  'solicitations.manage',
  'flows.view',
  'flows.manage',
  'analytics.view',
  'approvals.decide',
]);

const SCOPE_RANK: Record<PermissionScope, number> = { none: 0, assigned: 1, own: 2, area: 3, all: 4 };

export function convertAccess(input: ConversionInput): ConversionResult {
  const scopeOf = (role: string, code: string): PermissionScope =>
    input.roleGrants.get(role)?.get(code) ?? 'none';

  const fullAccessRoles = [...input.roleGrants.keys()].filter(
    (role) => scopeOf(role, 'forms.view') === 'all' && scopeOf(role, 'solicitations.view') === 'all',
  );
  const fullAccess = new Set(fullAccessRoles);

  /** O escopo antigo alcança o formulário inteiro? (criador/área/tudo — o mesmo de hasScopeAccess) */
  const reachesForm = (user: ConversionUser, form: ConversionForm, scope: PermissionScope): boolean => {
    if (scope === 'all') return true;
    if (scope === 'own') return form.createdBy === user.id;
    if (scope === 'area') {
      if (!user.areaId) return user.role === 'manager' || !form.areaId;
      return !form.areaId || form.areaId === user.areaId;
    }
    return false; // 'none' e 'assigned' (o "atribuído" dos cards, não do formulário)
  };

  const memberships: ConvertedMembership[] = [];
  for (const user of input.users) {
    if (fullAccess.has(user.role)) continue;

    for (const form of input.forms) {
      const isCreator = form.createdBy === user.id;
      const isAssigned = input.assignees.get(form.id)?.has(user.id) ?? false;

      if (isCreator) {
        memberships.push({ formId: form.id, userId: user.id, reason: 'criador', grants: { ...FULL_PROCESS_GRANTS } });
        continue;
      }

      // Rascunho não aparecia ao leitor sem atribuição (regra de status do perfil `viewer`).
      const seesByForms =
        reachesForm(user, form, scopeOf(user.role, 'forms.view')) &&
        !(user.role === 'viewer' && form.status !== 'published');
      const seesByBoard = reachesForm(user, form, scopeOf(user.role, 'solicitations.view'));
      if (!isAssigned && !seesByForms && !seesByBoard) continue;

      const grantFor = (processCode: string, sources: readonly string[]): ProcessPermissionScope | null => {
        // O maior escopo entre os códigos de origem.
        let best: { code: string; scope: PermissionScope } | null = null;
        for (const code of sources) {
          const scope = scopeOf(user.role, code);
          if (scope !== 'none' && (!best || SCOPE_RANK[scope] > SCOPE_RANK[best.scope])) best = { code, scope };
        }
        if (!best) return null;
        // Atribuição vencia o escopo: valia o processo inteiro.
        if (isAssigned) return 'all';
        if (!SCOPABLE.has(best.code)) return 'all';
        if (reachesForm(user, form, best.scope)) return 'all';
        // Só os cards que abriu ou dos quais é responsável — o "próprio"/"atribuído" de solicitações.
        if (processCode === 'solicitations.view') return 'own';
        return null;
      };

      const grants: Record<string, ProcessPermissionScope> = {};
      for (const [processCode, sources] of Object.entries(SOURCES)) {
        const granted = grantFor(processCode, sources);
        if (granted) grants[processCode] = granted;
      }
      memberships.push({ formId: form.id, userId: user.id, reason: isAssigned ? 'atribuído' : 'perfil', grants });
    }
  }

  return { fullAccessRoles, memberships };
}
