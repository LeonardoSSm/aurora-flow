import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { LopsAiSessionService } from './lops-ai-session.service';

const API_KEY_ONLY = 'lopsAiApiKeyOnly';

/** Rota que só exige a chave da LOPS IA (a que abre a sessão), sem token de pessoa. */
export const LopsAiApiKeyOnly = (): MethodDecorator & ClassDecorator => SetMetadata(API_KEY_ONLY, true);

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clientIp(request: Request): string {
  return (request.ip ?? '').replace(/^::ffff:/, '');
}

/**
 * Guard das rotas /ai, no lugar do JwtAuthGuard: confere a chave compartilhada (X-API-Key), o IP
 * (se LOPS_AI_ALLOWED_IPS estiver configurado) e o token de sessão da pessoa. Monta `request.user`
 * igual ao login normal, então o PermissionsGuard e os serviços funcionam sem mudança.
 */
@Injectable()
export class LopsAiAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: LopsAiSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.sessions.config();
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();

    const apiKey = request.header('x-api-key') ?? '';
    if (!apiKey || !sameSecret(apiKey, config.apiKey)) {
      throw new UnauthorizedException('Chave da LOPS IA inválida.');
    }
    if (config.allowedIps.length > 0 && !config.allowedIps.includes(clientIp(request))) {
      throw new ForbiddenException('Origem não autorizada para a integração com a LOPS IA.');
    }

    const apiKeyOnly = this.reflector.getAllAndOverride<boolean>(API_KEY_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (apiKeyOnly) return true;

    const authorization = request.header('authorization') ?? '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Envie o token de sessão da LOPS IA (Authorization: Bearer).');
    }
    request.user = await this.sessions.verify(token);
    return true;
  }
}
