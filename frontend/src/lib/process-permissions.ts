import { hasPermission, type PermissionScope } from './permissions';

/** Escopo de uma permissão no vínculo: tudo, ou só os cards da própria pessoa. */
export type ProcessPermissionScope = 'all' | 'own';

/** Permissões de cada processo com que a pessoa tem vínculo: processo → código → escopo. */
export type ProcessPermissionMap = Record<string, Record<string, ProcessPermissionScope>>;

/** Códigos do vínculo (espelho de process-permission-catalog.ts no backend). */
export const PROCESS_PERMISSION_CODES = new Set([
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
  'process.access.manage',
]);

/**
 * Códigos antigos que as telas ainda perguntam e o que valem dentro de um processo: basta um dos
 * códigos da lista. Lista vazia = basta ter vínculo.
 */
export const PROCESS_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  'forms.view': [],
  'solicitations.manage': ['solicitations.create', 'solicitations.act', 'solicitations.reassign'],
  'responses.view_detail': ['responses.view'],
  'automations.manage': [],
  'standard_questions.manage': [],
};

export function isProcessPermission(code: string): boolean {
  return PROCESS_PERMISSION_CODES.has(code) || code in PROCESS_PERMISSION_ALIASES;
}

export interface SessionPermissions {
  /** Sistema (do perfil) + o maior escopo de cada código de processo entre os vínculos. */
  permissions: Record<string, PermissionScope> | undefined | null;
  processPermissions: ProcessPermissionMap | undefined | null;
  processesFullAccess: boolean | undefined | null;
}

/**
 * Pode `code`? Com `formId`, NAQUELE processo (o que o backend confere); sem, em algum processo —
 * para menus e telas que não são de um processo só. Permissão de sistema ignora `formId`.
 */
export function canInProcess(session: SessionPermissions, code: string, formId?: string | null): boolean {
  if (!formId || !isProcessPermission(code)) return hasPermission(session.permissions, code);
  if (session.processesFullAccess) return true;
  const granted = session.processPermissions?.[formId];
  if (!granted) return false;
  const codes = PROCESS_PERMISSION_ALIASES[code] ?? [code];
  if (codes.length === 0) return true;
  return codes.some((candidate) => granted[candidate] !== undefined);
}
