import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PermissionScope } from '../../common/constants/permission-catalog';
import { RolePermissionEntity } from '../../database/entities';

/**
 * Resolves the data-access scope a role has for a given permission code.
 * Cached in memory keyed by role code (small: number of roles, not users) —
 * invalidated whenever a role's permissions are edited. This is what lets a
 * permission edit take effect for every holder of that role on their very
 * next request, without needing a new login (unlike a role *reassignment*,
 * which changes the JWT's `role` claim itself and is handled separately via
 * UsersService.update()'s existing tokenVersion bump).
 */
@Injectable()
export class PermissionsService {
  private cache = new Map<string, Map<string, PermissionScope>>();

  constructor(
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionsRepository: Repository<RolePermissionEntity>,
  ) {}

  async getScope(roleCode: string, permissionCode: string): Promise<PermissionScope> {
    const roleMap = await this.getRoleMap(roleCode);
    return roleMap.get(permissionCode) ?? 'none';
  }

  async hasAny(roleCode: string, permissionCode: string): Promise<boolean> {
    return (await this.getScope(roleCode, permissionCode)) !== 'none';
  }

  /** Full permission → scope map for a role, e.g. for embedding in a login/refresh payload. */
  async getAllForRole(roleCode: string): Promise<Record<string, PermissionScope>> {
    const roleMap = await this.getRoleMap(roleCode);
    return Object.fromEntries(roleMap);
  }

  /** Call after any role_permissions mutation. Omit roleCode to clear the whole cache. */
  invalidate(roleCode?: string): void {
    if (roleCode) {
      this.cache.delete(roleCode);
    } else {
      this.cache.clear();
    }
  }

  private async getRoleMap(roleCode: string): Promise<Map<string, PermissionScope>> {
    const cached = this.cache.get(roleCode);
    if (cached) return cached;

    const grants = await this.rolePermissionsRepository.find({ where: { roleId: roleCode } });
    const roleMap = new Map<string, PermissionScope>();
    for (const grant of grants) {
      roleMap.set(grant.permissionCode, grant.scope);
    }
    this.cache.set(roleCode, roleMap);
    return roleMap;
  }
}
