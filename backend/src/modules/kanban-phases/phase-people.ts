import type {
  KanbanPhaseApprovalMode,
  KanbanPhaseEntity,
  KanbanPhasePeople,
} from '../../database/entities/kanban-phase.entity';

type PeopleInput = Partial<KanbanPhasePeople> | null | undefined;

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

/** Sem repetição; ninguém escolhido vira `null` (= "qualquer perfil com acesso" para quem atua). */
export function normalizePhasePeople(input: PeopleInput): KanbanPhasePeople | null {
  const people: KanbanPhasePeople = { roleCodes: unique(input?.roleCodes), userIds: unique(input?.userIds) };
  if (people.roleCodes.length + people.userIds.length === 0) return null;
  // Ordem (aprovação em sequência): só chaves de quem está na lista; quem faltar vai para o fim.
  if (input?.order?.length) {
    const keys = [...people.userIds.map((id) => `user:${id}`), ...people.roleCodes.map((code) => `role:${code}`)];
    const known = new Set(keys);
    const order = unique(input.order).filter((key) => known.has(key));
    people.order = [...order, ...keys.filter((key) => !order.includes(key))];
  }
  return people;
}

export const PHASE_APPROVAL_MODES: readonly KanbanPhaseApprovalMode[] = ['any', 'all', 'sequential'];

/** Como criar a Approval da fase: paralela (basta um ou todos) ou em sequência, e a ordem. */
export function phaseApprovalRule(
  phase: Pick<KanbanPhaseEntity, 'approvalMode'>,
  approvers: KanbanPhasePeople,
): { mode: 'parallel' | 'sequential'; requireAll: boolean; assigneeOrder?: string[] } {
  const mode = phase.approvalMode ?? 'any';
  return {
    mode: mode === 'sequential' ? 'sequential' : 'parallel',
    requireAll: mode !== 'any',
    ...(mode === 'sequential' && approvers.order?.length ? { assigneeOrder: approvers.order } : {}),
  };
}

/**
 * O que os fluxos recebem da fase para "Criar aprovação" no modo "aprovador da fase": quem aprova
 * (perfis e usuários; o primeiro perfil para fluxos antigos) e a regra da fase.
 */
export function phaseApproverMetadata(
  phase: Pick<KanbanPhaseEntity, 'approvers' | 'approverRoleCode' | 'approvalMode'>,
): Record<string, unknown> {
  const approvers = phaseApprovers(phase);
  return {
    approverRoleCode: approvers?.roleCodes[0] ?? null,
    approverRoleCodes: approvers?.roleCodes ?? [],
    approverUserIds: approvers?.userIds ?? [],
    approvalMode: phase.approvalMode ?? 'any',
    approverOrder: approvers?.order ?? [],
  };
}

/** Fase gravada antes de existir a lista: o perfil único das colunas antigas. */
function legacy(roleCode: string | null | undefined): KanbanPhasePeople | null {
  return roleCode ? { roleCodes: [roleCode], userIds: [] } : null;
}

/** Quem atua (preenche campos, pede aprovação). `null` = qualquer um com acesso à solicitação. */
export function phaseActors(
  phase: Pick<KanbanPhaseEntity, 'actors' | 'actorRoleCode'>,
): KanbanPhasePeople | null {
  return normalizePhasePeople(phase.actors) ?? legacy(phase.actorRoleCode);
}

/** Quem aprova a saída da fase (quando `requiresApproval`). */
export function phaseApprovers(
  phase: Pick<KanbanPhaseEntity, 'approvers' | 'approverRoleCode'>,
): KanbanPhasePeople | null {
  return normalizePhasePeople(phase.approvers) ?? legacy(phase.approverRoleCode);
}

/** Basta casar um: o perfil do usuário está na lista ou o próprio usuário está. */
export function isPhasePerson(
  people: KanbanPhasePeople | null,
  user: { sub: string; role: string },
): boolean {
  if (!people) return true;
  return people.roleCodes.includes(user.role) || people.userIds.includes(user.sub);
}

/**
 * Sujeito da mensagem de recusa: `o perfil "x"` quando é só um perfil (o texto de sempre) ou
 * `quem foi escolhido para atuar nesta fase (perfil "a" ou 2 usuários)`.
 */
export function describePhasePeople(people: KanbanPhasePeople): string {
  if (people.userIds.length === 0 && people.roleCodes.length === 1) {
    return `o perfil "${people.roleCodes[0]}"`;
  }
  const parts: string[] = [];
  if (people.roleCodes.length) {
    const roles = people.roleCodes.map((code) => `"${code}"`).join(', ');
    parts.push(`${people.roleCodes.length > 1 ? 'perfis' : 'perfil'} ${roles}`);
  }
  if (people.userIds.length) {
    parts.push(`${people.userIds.length} usuário${people.userIds.length > 1 ? 's' : ''}`);
  }
  return `quem foi escolhido para atuar nesta fase (${parts.join(' ou ')})`;
}
