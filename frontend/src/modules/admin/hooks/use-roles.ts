import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import {
  createRole,
  deleteRole,
  fetchPermissionCatalog,
  fetchRole,
  fetchRoleOptions,
  fetchRoles,
  patchUserRole,
  updateRole,
  updateRolePermissions,
  type CreateRolePayload,
  type RolePermissionEntry,
  type UpdateRolePayload,
} from '../services/roles-api';

export function useRolesQuery() {
  return useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: fetchRoles,
  });
}

/** Lista leve de perfis (código + nome) para seletores — não exige `roles.manage`. */
export function useRoleOptionsQuery() {
  return useQuery({
    queryKey: queryKeys.roles.options(),
    queryFn: fetchRoleOptions,
    staleTime: 60_000,
  });
}

export function useRoleDetailQuery(code: string | null) {
  return useQuery({
    queryKey: queryKeys.roles.byCode(code ?? ''),
    queryFn: () => fetchRole(code as string),
    enabled: !!code,
  });
}

export function usePermissionCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.roles.permissionCatalog(),
    queryFn: fetchPermissionCatalog,
    staleTime: Infinity,
  });
}

export function useCreateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => createRole(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
    },
  });
}

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, payload }: { code: string; payload: UpdateRolePayload }) =>
      updateRole(code, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
    },
  });
}

export function useUpdateRolePermissionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, permissions }: { code: string; permissions: RolePermissionEntry[] }) =>
      updateRolePermissions(code, permissions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => deleteRole(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
    },
  });
}

export function useUpdateUserRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      currentRoleCode,
      userId,
      newRole,
    }: {
      currentRoleCode: string;
      userId: string;
      newRole: string;
    }) => patchUserRole(currentRoleCode, userId, newRole),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
    },
  });
}
