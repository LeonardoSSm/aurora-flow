import type { KanbanPhaseVisibility } from '../types';
import { visibilityCount } from './phase-draft';

/** Resumo curto para chips: "Todos" ou os nomes escolhidos ("Logística, Ana +2"). */
export function visibilitySummary(
  restrict: boolean,
  visibleTo: KanbanPhaseVisibility,
  roleOptions: ReadonlyArray<{ code: string; name: string }>,
): string {
  if (!restrict || visibilityCount(visibleTo) === 0) return 'todos';
  const names = visibleTo.roleCodes.map((code) => roleOptions.find((role) => role.code === code)?.name ?? code);
  const others = visibleTo.areaIds.length + visibleTo.userIds.length;
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length + others;
  if (shown.length === 0) {
    const parts = [
      visibleTo.areaIds.length ? `${visibleTo.areaIds.length} área${visibleTo.areaIds.length > 1 ? 's' : ''}` : null,
      visibleTo.userIds.length ? `${visibleTo.userIds.length} usuário${visibleTo.userIds.length > 1 ? 's' : ''}` : null,
    ].filter(Boolean);
    return parts.join(' + ');
  }
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}
