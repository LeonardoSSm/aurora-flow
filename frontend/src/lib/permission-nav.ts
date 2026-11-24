/**
 * Shared "which nav items can this user see" filter — previously duplicated
 * independently in sidebar-nav.tsx, admin-module-nav.tsx and each item's
 * `.roles` field. An item with no `permissions` is visible to everyone;
 * otherwise it's visible if the user holds at least one of the listed codes
 * (mirrors the old "role is in the allowed list" any-of semantics).
 */
export function filterByPermission<T extends { permissions?: readonly string[] }>(
  items: readonly T[],
  hasPermission: (code: string) => boolean,
): T[] {
  return items.filter(
    (item) => !item.permissions?.length || item.permissions.some((code) => hasPermission(code)),
  );
}
