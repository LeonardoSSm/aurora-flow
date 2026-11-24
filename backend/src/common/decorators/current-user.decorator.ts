import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator, InternalServerErrorException } from '@nestjs/common';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!request.user) {
      throw new InternalServerErrorException('CurrentUser used outside JwtAuthGuard');
    }
    return request.user;
  },
);
