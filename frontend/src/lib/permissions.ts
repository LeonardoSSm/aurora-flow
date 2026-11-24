export type PermissionScope = 'none' | 'own' | 'assigned' | 'area' | 'all';

const SCOPE_RANK: Record<PermissionScope, number> = {
  none: 0,
  own: 1,
  assigned: 1,
  area: 2,
  all: 3,
};

/**
 * Checks whether a permission map (as returned in the login/refresh payload)
 * grants `code` at least at `minScope`. Defaults to a plain "has any access"
 * check, which covers most UI gating (nav items, buttons) — most permissions
 * that gate UI visibility are non-scopable (boolean) anyway. `minScope` is
 * for the rarer case of requiring elevated access (e.g. 'area' or 'all').
 * 'own' and 'assigned' rank equally: they're different kinds of restriction,
 * not one stricter than the other.
 */
export function hasPermission(
  permissions: Record<string, PermissionScope> | undefined | null,
  code: string,
  minScope: PermissionScope = 'own',
): boolean {
  const scope = permissions?.[code] ?? 'none';
  if (scope === 'none') return false;
  return SCOPE_RANK[scope] >= SCOPE_RANK[minScope];
}
