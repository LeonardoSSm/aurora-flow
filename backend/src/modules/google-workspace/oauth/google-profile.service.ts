import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GoogleUserInfoResponse } from '../types/google-workspace.types';

@Injectable()
export class GoogleProfileService {
  constructor(private readonly configService: ConfigService) {}

  async fetchGoogleProfile(
    accessToken: string,
    idToken: string | null,
  ): Promise<GoogleUserInfoResponse> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new UnauthorizedException(
        'Nao foi possivel obter o perfil corporativo do Google Workspace.',
      );
    }

    const payload = (await response.json()) as GoogleUserInfoResponse;
    if (!payload.email || !payload.sub) {
      throw new UnauthorizedException('Perfil do Google Workspace invalido.');
    }

    if (idToken) {
      const decoded = this.decodeIdTokenPayload(idToken);
      if (decoded.hd && !payload.hd) {
        payload.hd = decoded.hd;
      }
    }

    return payload;
  }

  ensureAllowedDomain(profile: GoogleUserInfoResponse): void {
    if (!profile.email_verified) {
      throw new ForbiddenException('Conta Google Workspace sem e-mail verificado.');
    }

    const email = profile.email.trim().toLowerCase();
    const domain = this.configService.getOrThrow<string>('GOOGLE_WORKSPACE_DOMAIN');
    const emailDomain = email.split('@')[1] ?? '';

    if (emailDomain !== domain) {
      throw new ForbiddenException(`Acesso restrito ao dominio corporativo ${domain}.`);
    }

    if (profile.hd && profile.hd !== domain) {
      throw new ForbiddenException(`Acesso restrito ao dominio corporativo ${domain}.`);
    }
  }

  private decodeIdTokenPayload(idToken: string): { hd?: string } {
    const parts = idToken.split('.');
    if (parts.length < 2) return {};
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { hd?: string };
    } catch {
      return {};
    }
  }
}
