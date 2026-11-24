import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens } from '../../auth/auth.service';
import { RefreshTokenService } from '../../auth/refresh-token.service';
import { GoogleConnectedEvent, UserLoggedInEvent } from '../../../common/events/auth-events';
import { UserEntity } from '../../../database/entities';
import { ProcessAccessService } from '../../access/process-access.service';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { GoogleConnectionService } from '../connection/google-connection.service';
import type {
  GoogleOAuthTokens,
  GoogleStatePayload,
  GoogleTokenExchangeResponse,
} from '../types/google-workspace.types';
import { GoogleProfileService } from './google-profile.service';
import { GoogleStateHelper } from './google-state.helper';

/** Escopos pedidos ao Google (login e conexão). Ver o comentário em buildUrl. */
export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
] as const;

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly stateHelper: GoogleStateHelper,
    private readonly profileService: GoogleProfileService,
    private readonly connectionService: GoogleConnectionService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  buildLoginUrl(): string {
    this.ensureConfigured();
    // select_account only shows the account picker; Google still issues a refresh
    // token on first authorization. prompt=consent is reserved for forced reconnection.
    return this.buildUrl({ action: 'login', exp: Date.now() + 10 * 60 * 1000 }, 'select_account');
  }

  async buildConnectUrl(userId: string, redirectPath?: string): Promise<string> {
    this.ensureConfigured();
    // If the user already has a refresh token they've authorized before — just pick
    // the account. If not (first connection or after disconnect/revoke) force consent
    // so Google re-issues a refresh token.
    const hasToken = await this.connectionService.userHasRefreshToken(userId);
    return this.buildUrl(
      {
        action: 'connect',
        userId,
        redirectPath: this.sanitizePath(redirectPath),
        exp: Date.now() + 10 * 60 * 1000,
      },
      hasToken ? 'select_account' : 'consent',
    );
  }

  buildFrontendErrorRedirect(path: string, message: string): string {
    const url = new URL(this.sanitizePath(path) ?? '/login', this.frontendUrl());
    url.searchParams.set('googleError', message);
    return url.toString();
  }

  async handleOAuthCallback(
    code: string,
    stateToken: string,
  ): Promise<{ redirectUrl: string; tokens?: AuthTokens }> {
    this.ensureConfigured();

    const state = this.stateHelper.decodeState(stateToken);
    const tokens = await this.exchangeCode(code);
    const profile = await this.profileService.fetchGoogleProfile(
      tokens.accessToken,
      tokens.idToken,
    );
    this.profileService.ensureAllowedDomain(profile);

    if (state.action === 'login') {
      const user = await this.connectionService.upsertUserFromGoogleLogin(profile, tokens);
      const appTokens = await this.issueAppTokens(user);

      this.eventEmitter.emit('auth.login', new UserLoggedInEvent(user.id, user.email));

      const redirectUrl = new URL('/login/google/callback', this.frontendUrl());
      redirectUrl.searchParams.set('status', 'ok');
      return { redirectUrl: redirectUrl.toString(), tokens: appTokens };
    }

    if (!state.userId) {
      throw new UnauthorizedException('Conexao Google invalida ou expirada.');
    }

    const user = await this.connectionService.connectAuthenticatedUserGoogleAccount(
      state.userId,
      profile,
      tokens,
    );

    this.eventEmitter.emit(
      'auth.google_connect',
      new GoogleConnectedEvent(user.id, user.email, user.googleAccountEmail),
    );

    const redirectUrl = new URL(state.redirectPath ?? '/builder', this.frontendUrl());
    redirectUrl.searchParams.set('google', 'connected');
    return { redirectUrl: redirectUrl.toString() };
  }

  private async issueAppTokens(user: UserEntity): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const [accessToken, refreshToken, session] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.refreshTokenService.issue(payload, null, null),
      this.processAccess.sessionPermissions({ sub: user.id, role: user.role }),
    ]);

    return { accessToken, refreshToken, user: UserResponseDto.fromEntity(user), ...session };
  }

  private buildUrl(state: GoogleStatePayload, prompt: 'consent' | 'select_account'): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set(
      'client_id',
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
    );
    url.searchParams.set(
      'redirect_uri',
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_CALLBACK_URL'),
    );
    url.searchParams.set('response_type', 'code');
    // drive.file: acesso APENAS aos arquivos que este app cria (as planilhas dos formulários) — o sistema
    // só cria planilha, lê/grava valores e acrescenta linhas, e nunca precisa ver as demais planilhas
    // da conta. Antes pedia 'spreadsheets' (todas as planilhas do usuário).
    url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', prompt);
    // Sem include_granted_scopes: o token novo traz SÓ os escopos pedidos acima. Com 'true' o Google
    // somaria o que o usuário já autorizou antes, e quem tinha dado 'spreadsheets' continuaria com ele.
    url.searchParams.set('hd', this.configService.getOrThrow<string>('GOOGLE_WORKSPACE_DOMAIN'));
    url.searchParams.set('state', this.stateHelper.encodeState(state));
    return url.toString();
  }

  private async exchangeCode(code: string): Promise<GoogleOAuthTokens> {
    const body = new URLSearchParams({
      code,
      client_id: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      redirect_uri: this.configService.getOrThrow<string>('GOOGLE_OAUTH_CALLBACK_URL'),
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(
        `Falha ao concluir autenticacao Google: ${text || response.statusText}`,
      );
    }

    const data = (await response.json()) as GoogleTokenExchangeResponse;
    if (!data.access_token) {
      throw new UnauthorizedException('Google nao retornou access token valido.');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt:
        typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : null,
      idToken: data.id_token ?? null,
    };
  }

  private ensureConfigured(): void {
    if (
      !this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID') ||
      !this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ||
      !this.configService.get<string>('GOOGLE_OAUTH_CALLBACK_URL')
    ) {
      throw new ServiceUnavailableException(
        'Integracao Google Workspace ainda nao foi configurada no servidor.',
      );
    }
  }

  private frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  }

  private sanitizePath(path?: string): string | undefined {
    return !path?.startsWith('/') ? '/builder' : path;
  }
}
