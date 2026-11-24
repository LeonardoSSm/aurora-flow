import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) =>
          (req.cookies as Record<string, string> | undefined)?.['aurora_flow_refresh'] ?? null,
        // mobile clients cannot send HttpOnly cookies — accept token from body as fallback
        (req: Request) =>
          (req.body as { refreshToken?: string } | undefined)?.refreshToken ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Token de refresh inválido.');
    }
    const user = await this.usersService.findActiveById(payload.sub);
    if (payload.tokenVersion !== user?.tokenVersion) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    return payload;
  }
}
