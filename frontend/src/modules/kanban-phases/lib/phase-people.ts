import type { KanbanPhase, KanbanPhasePeople } from '../types';

export const NO_PEOPLE: KanbanPhasePeople = { roleCodes: [], userIds: [] };

function people(list: KanbanPhasePeople | null | undefined, legacyRole: string | null): KanbanPhasePeople {
  const roleCodes = list?.roleCodes ?? [];
  const userIds = list?.userIds ?? [];
  if (roleCodes.length + userIds.length > 0) {
    return list?.order?.length ? { roleCodes, userIds, order: list.order } : { roleCodes, userIds };
  }
  return legacyRole ? { roleCodes: [legacyRole], userIds: [] } : { roleCodes: [], userIds: [] };
}

/** Quem atua (fase antiga: o perfil único). Listas vazias = qualquer um. */
export function phaseActors(phase: Pick<KanbanPhase, 'actors' | 'actorRoleCode'>): KanbanPhasePeople {
  return people(phase.actors, phase.actorRoleCode);
}

export function phaseApprovers(phase: Pick<KanbanPhase, 'approvers' | 'approverRoleCode'>): KanbanPhasePeople {
  return people(phase.approvers, phase.approverRoleCode);
}

export function peopleCount(list: KanbanPhasePeople): number {
  return list.roleCodes.length + list.userIds.length;
}

/** Mesma regra do backend (phase-people.ts): perfil OU usuário da lista; lista vazia = qualquer um. */
export function isPhasePerson(list: KanbanPhasePeople, user: { id: string; role: string } | null | undefined): boolean {
  if (peopleCount(list) === 0) return true;
  if (!user) return false;
  return list.roleCodes.includes(user.role) || list.userIds.includes(user.id);
}

/** "Logística, Financeiro +1 usuário" para chips; `fallback` quando ninguém foi escolhido. */
export function peopleSummary(
  list: KanbanPhasePeople,
  roleOptions: ReadonlyArray<{ code: string; name: string }>,
  fallback: string,
): string {
  if (peopleCount(list) === 0) return fallback;
  const roles = list.roleCodes.map((code) => roleOptions.find((role) => role.code === code)?.name ?? code);
  const shown = roles.slice(0, 2);
  const extraRoles = roles.length - shown.length;
  const users = list.userIds.length;
  const parts = [shown.join(', ')].filter(Boolean);
  if (extraRoles > 0) parts.push(`+${extraRoles}`);
  if (users > 0) parts.push(`${shown.length ? '+' : ''}${users} usuário${users > 1 ? 's' : ''}`);
  return parts.join(' ');
}
