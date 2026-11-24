import type { PermissionScope, ProcessPermissionMap } from '../api/types';

/*
 * Espelho de frontend/src/lib/permissions.ts e process-permissions.ts: o app esconde o que a
 * pessoa não pode fazer. Quem garante é o backend.
 */

const SCOPE_RANK: Record<PermissionScope, number> = { none: 0, own: 1, assigned: 1, area: 2, all: 3 };

export function hasPermission(
  permissions: Record<string, PermissionScope> | undefined | null,
  code: string,
  minScope: PermissionScope = 'own',
): boolean {
  const scope = permissions?.[code] ?? 'none';
  if (scope === 'none') return false;
  return SCOPE_RANK[scope] >= SCOPE_RANK[minScope];
}

const PROCESS_PERMISSION_CODES = new Set([
  'solicitations.view',
  'solicitations.create',
  'solicitations.act',
  'solicitations.reassign',
  'solicitations.regenerate_token',
  'comments.view_internal',
  'attachments.upload',
  'attachments.manage_all',
  'approvals.manage',
  'approvals.view_all',
  'responses.view',
  'responses.view_sensitive',
  'responses.export',
  'analytics.view',
  'analytics.manage',
  'forms.edit',
  'kanban_phases.manage',
  'forms.publish',
  'flows.view',
  'flows.manage',
  'process.access.manage',
]);

const PROCESS_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  'forms.view': [],
  'solicitations.manage': ['solicitations.create', 'solicitations.act', 'solicitations.reassign'],
  'responses.view_detail': ['responses.view'],
  'automations.manage': ['flows.manage'],
  'standard_questions.manage': ['flows.manage'],
};

function isProcessPermission(code: string): boolean {
  return PROCESS_PERMISSION_CODES.has(code) || code in PROCESS_PERMISSION_ALIASES;
}

export function canInProcess(
  session: {
    permissions: Record<string, PermissionScope> | null | undefined;
    processPermissions: ProcessPermissionMap | null | undefined;
    processesFullAccess: boolean | null | undefined;
  },
  code: string,
  formId?: string | null,
): boolean {
  if (!formId || !isProcessPermission(code)) return hasPermission(session.permissions, code);
  if (session.processesFullAccess) return true;
  const granted = session.processPermissions?.[formId];
  if (!granted) return false;
  const codes = PROCESS_PERMISSION_ALIASES[code] ?? [code];
  if (codes.length === 0) return true;
  return codes.some((candidate) => granted[candidate] !== undefined);
}
