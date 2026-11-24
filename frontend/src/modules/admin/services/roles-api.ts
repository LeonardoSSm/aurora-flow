import type { PermissionScope } from '../../../lib/permissions';
import { api } from '../../../services/api';

export type { PermissionScope };

export type PermissionDefinition = {
  code: string;
  module: string;
  action: string;
  label: string;
  scopable: boolean;
};

export type RolePermissionEntry = {
  code: string;
  scope: PermissionScope;
};

export type Role = {
  code: string;
  name: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  permissions: Record<string, PermissionScope>;
  userCount: number;
  activeUserCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RoleUserSummary = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type RoleDetail = Role & {
  users: RoleUserSummary[];
};

export type CreateRolePayload = {
  code: string;
  name: string;
  description?: string;
  color?: string;
  permissions?: RolePermissionEntry[];
};

export type UpdateRolePayload = {
  name?: string;
  description?: string;
  color?: string;
};

export async function fetchPermissionCatalog(): Promise<PermissionDefinition[]> {
  const { data } = await api.get<PermissionDefinition[]>('/permissions');
  return data;
}

export async function fetchRoles(): Promise<Role[]> {
  const { data } = await api.get<Role[]>('/roles');
  return data;
}

export type RoleOption = {
  code: string;
  name: string;
};

/** Lista leve (código + nome), sem o mapa de permissões — não exige `roles.manage`, usada em seletores de papel (ex.: config de fases do Kanban). */
export async function fetchRoleOptions(): Promise<RoleOption[]> {
  const { data } = await api.get<RoleOption[]>('/roles/options');
  return data;
}

export async function fetchRole(code: string): Promise<RoleDetail> {
  const { data } = await api.get<RoleDetail>(`/roles/${code}`);
  return data;
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  const { data } = await api.post<Role>('/roles', payload);
  return data;
}

export async function updateRole(code: string, payload: UpdateRolePayload): Promise<Role> {
  const { data } = await api.patch<Role>(`/roles/${code}`, payload);
  return data;
}

export async function updateRolePermissions(
  code: string,
  permissions: RolePermissionEntry[],
): Promise<Role> {
  const { data } = await api.put<Role>(`/roles/${code}/permissions`, { permissions });
  return data;
}

export async function deleteRole(code: string): Promise<void> {
  await api.delete(`/roles/${code}`);
}

export async function patchUserRole(
  currentRoleCode: string,
  userId: string,
  newRole: string,
): Promise<void> {
  await api.patch(`/roles/${currentRoleCode}/users/${userId}`, { newRole });
}
