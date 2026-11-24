import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * Marks a route as requiring a specific permission code (see PERMISSION_CATALOG).
 * Must be paired with PermissionsGuard. No decorator = any authenticated user.
 */
export const RequirePermission = (code: string): CustomDecorator<string> =>
  SetMetadata(PERMISSION_KEY, code);
