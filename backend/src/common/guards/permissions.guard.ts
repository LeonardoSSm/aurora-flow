import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { isProcessPermission } from '../constants/process-permission-catalog';
import { ProcessAccessService } from '../../modules/access/process-access.service';
import { PermissionsService } from '../../modules/roles/permissions.service';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload.type';

/**
 * Guard that checks if the authenticated user holds the required permission. Must be used AFTER
 * JwtAuthGuard.
 *
 * Permissão de sistema vem do perfil. Permissão de processo (do vínculo, ou código antigo que aponta
 * para ele) só dá para conferir aqui como "tem em ALGUM processo": a rota ainda não sabe de qual
 * processo se trata. Quem confere o processo de verdade é o ProcessAccessService, no serviço.
 *
 * Structurally mirrors RolesGuard on purpose (same reflector pattern, same
 * "no decorator = any authenticated user" fallback, same ForbiddenException
 * shape) so controllers can be swapped from @Roles to @RequirePermission one
 * at a time, independently testable and revertible.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
    @Optional() private readonly processAccess?: ProcessAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RequirePermission() decorator → allow any authenticated user through
    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; permissionScope?: string }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acesso negado.');
    }

    if (isProcessPermission(required)) {
      if (!this.processAccess || !(await this.processAccess.hasAnywhere(user, required))) {
        throw new ForbiddenException(`Permissão necessária: ${required}.`);
      }
      request.permissionScope = 'all';
      return true;
    }

    const scope = await this.permissions.getScope(user.role, required);
    if (scope === 'none') {
      throw new ForbiddenException(`Permissão necessária: ${required}.`);
    }

    // Stashed for the service layer to reuse via applyScopeFilter/assertScopeAccess,
    // avoiding a second getScope() lookup for the same request.
    request.permissionScope = scope;
    return true;
  }
}
