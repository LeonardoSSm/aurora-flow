import type {
  KanbanPhaseEntity,
  KanbanPhaseVisibility,
} from '../../database/entities/kanban-phase.entity';

type VisibilityInput = Partial<KanbanPhaseVisibility> | null | undefined;

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

/** Grava sem repetição; tudo vazio vira `null` (= todos veem), o mesmo que nunca ter configurado. */
export function normalizePhaseVisibility(input: VisibilityInput): KanbanPhaseVisibility | null {
  const normalized = {
    roleCodes: unique(input?.roleCodes),
    areaIds: unique(input?.areaIds),
    userIds: unique(input?.userIds),
  };
  const restricted =
    normalized.roleCodes.length + normalized.areaIds.length + normalized.userIds.length > 0;
  return restricted ? normalized : null;
}

export type PhaseViewer = { sub: string; role: string; areaId?: string | null };

/**
 * A fase aparece para quem casa com PELO MENOS UM critério: perfil, área ou usuário. Sem restrição,
 * aparece para todos. `seesAll` é quem gerencia fases (`kanban_phases.manage`).
 */
export function canSeePhase(
  phase: Pick<KanbanPhaseEntity, 'visibleTo'>,
  viewer: PhaseViewer,
  seesAll: boolean,
): boolean {
  if (seesAll) return true;
  const visibility = normalizePhaseVisibility(phase.visibleTo);
  if (!visibility) return true;
  return (
    visibility.roleCodes.includes(viewer.role) ||
    (!!viewer.areaId && visibility.areaIds.includes(viewer.areaId)) ||
    visibility.userIds.includes(viewer.sub)
  );
}
