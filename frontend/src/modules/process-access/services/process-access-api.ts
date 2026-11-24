import type { ProcessPermissionScope } from '../../../lib/process-permissions';
import { api } from '../../../services/api';

/** Permissões marcadas num vínculo: código → escopo. O que não está, não pode. */
export type ProcessGrants = Record<string, ProcessPermissionScope>;

export type ProcessPermissionDefinition = {
  code: string;
  group: string;
  label: string;
  /** Escopos que a tela oferece; quase tudo é só 'all' (marcado ou não). */
  scopes: ProcessPermissionScope[];
};

export type ProcessAccessPreset = {
  key: string;
  label: string;
  description: string;
  grants: ProcessGrants;
};

export type ProcessAccessCatalog = {
  permissions: ProcessPermissionDefinition[];
  presets: ProcessAccessPreset[];
};

export type ProcessMember = {
  user: { id: string; fullName: string; email: string; role: string; isActive: boolean };
  grants: ProcessGrants;
  createdAt: string;
};

export type UserProcess = {
  formId: string;
  formName: string;
  status: string;
  /** Nulo = a pessoa não tem vínculo com o processo. */
  grants: ProcessGrants | null;
  /** Quem consulta pode mudar o acesso a este processo. */
  canManage: boolean;
};

export async function fetchProcessAccessCatalog(): Promise<ProcessAccessCatalog> {
  const { data } = await api.get<ProcessAccessCatalog>('/process-access/catalog');
  return data;
}

export async function fetchProcessMembers(formId: string): Promise<ProcessMember[]> {
  const { data } = await api.get<ProcessMember[]>(`/forms/${formId}/members`);
  return data;
}

export async function setProcessMember(formId: string, userId: string, grants: ProcessGrants): Promise<ProcessMember> {
  const { data } = await api.put<ProcessMember>(`/forms/${formId}/members/${userId}`, { grants });
  return data;
}

export async function removeProcessMember(formId: string, userId: string): Promise<void> {
  await api.delete(`/forms/${formId}/members/${userId}`);
}

export async function fetchUserProcesses(userId: string): Promise<UserProcess[]> {
  const { data } = await api.get<UserProcess[]>(`/users/${userId}/processes`);
  return data;
}
