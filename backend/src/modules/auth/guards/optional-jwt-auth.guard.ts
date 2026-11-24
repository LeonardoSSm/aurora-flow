import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Para rotas públicas que mudam de comportamento com login: com token válido preenche
 * `req.user`; sem token (ou com token inválido) segue como anônimo em vez de responder 401.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser | false): TUser | null {
    if (!user) return null;
    return user;
  }
}
