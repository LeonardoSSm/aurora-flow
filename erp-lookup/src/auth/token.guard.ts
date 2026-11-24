import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

/** Compara hashes de tamanho fixo: `timingSafeEqual` exige buffers do mesmo tamanho. */
function digest(valor: string): Buffer {
  return createHash('sha256').update(valor).digest();
}

/** `Authorization: Bearer <LOOKUP_API_TOKEN>` — o mesmo token cadastrado no conector do Tijuca. */
@Injectable()
export class TokenGuard implements CanActivate {
  private readonly esperado: Buffer | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.esperado = config.token ? digest(config.token) : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    const recebido =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!this.esperado || !recebido || !timingSafeEqual(digest(recebido), this.esperado)) {
      throw new UnauthorizedException('Token inválido.');
    }
    return true;
  }
}
