import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import { GoogleDisconnectedEvent } from '../../../common/events/auth-events';
import { FormEntity, UserEntity } from '../../../database/entities';
import type {
  GoogleConnectionStatusResponse,
  GoogleOAuthTokens,
  GoogleUserInfoResponse,
} from '../types/google-workspace.types';

@Injectable()
export class GoogleConnectionService {
  private readonly logger = new Logger(GoogleConnectionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenCipher: TokenCipherService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
  ) {}

  async getUserConnectionStatus(userId: string): Promise<GoogleConnectionStatusResponse> {
    const user = await this.findUserOrFail(userId);
    return this.mapUserConnectionStatus(user);
  }

  async disconnectUserConnection(userId: string): Promise<GoogleConnectionStatusResponse> {
    const user = await this.findUserOrFail(userId);
    const storedRefreshToken = user.googleRefreshToken;
    user.googleRefreshToken = null;
    user.googleAccessToken = null;
    user.googleTokenExpiresAt = null;
    user.googleDisconnectedAt = new Date();
    await this.usersRepository.save(user);

    // Desconectar só apagava o token do nosso banco: no Google ele seguia válido (e, para quem
    // autorizou antes da troca de escopo, ainda com acesso a TODAS as planilhas). Revoga lá também,
    // sem nunca bloquear a desconexão local se o Google estiver fora do ar.
    await this.revokeAtGoogle(storedRefreshToken);

    this.eventEmitter.emit(
      'auth.google_disconnect',
      new GoogleDisconnectedEvent(user.id, user.email, user.googleAccountEmail),
    );

    return this.mapUserConnectionStatus(user);
  }

  /** Revoga o refresh token no Google (best-effort: falha de rede/token inválido só é registrada). */
  private async revokeAtGoogle(encryptedRefreshToken: string | null): Promise<void> {
    if (!encryptedRefreshToken) return;
    try {
      const token = this.tokenCipher.decrypt(encryptedRefreshToken);
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(`Google respondeu ${response.status} ao revogar o token (já revogado ou inválido).`);
      }
    } catch (error) {
      this.logger.warn(
        `Não foi possível revogar o token no Google: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      );
    }
  }

  async findConnectedGoogleUserId(userId: string): Promise<string | null> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return null;
    return this.isUserGoogleConnected(user) ? user.id : null;
  }

  async userHasRefreshToken(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, googleRefreshToken: true },
    });
    return Boolean(user?.googleRefreshToken);
  }

  async upsertUserFromGoogleLogin(
    profile: GoogleUserInfoResponse,
    tokens: GoogleOAuthTokens,
  ): Promise<UserEntity> {
    const email = profile.email.trim().toLowerCase();
    const byGoogleSub = await this.usersRepository.findOne({ where: { googleSub: profile.sub } });
    const existing = byGoogleSub ?? (await this.usersRepository.findOne({ where: { email } }));

    if (existing && !existing.isActive) {
      throw new UnauthorizedException('Usuario corporativo inativo.');
    }

    const user =
      existing ??
      this.usersRepository.create({
        email,
        fullName: profile.name?.trim() ? profile.name.trim() : email.split('@')[0],
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
        role: 'editor',
        isActive: true,
      });

    user.fullName = user.fullName
      ? user.fullName
      : profile.name?.trim()
        ? profile.name.trim()
        : email;
    user.googleSub = profile.sub;
    user.googleAccountEmail = email;
    user.googleAccessToken = this.tokenCipher.encrypt(tokens.accessToken);
    if (tokens.refreshToken) {
      user.googleRefreshToken = this.tokenCipher.encrypt(tokens.refreshToken);
    }
    user.googleTokenExpiresAt = tokens.expiresAt;
    user.googleConnectedAt = new Date();
    user.googleDisconnectedAt = null;
    user.googleLastUsedAt = new Date();
    user.lastLoginAt = new Date();
    return this.usersRepository.save(user);
  }

  async connectAuthenticatedUserGoogleAccount(
    userId: string,
    profile: GoogleUserInfoResponse,
    tokens: GoogleOAuthTokens,
  ): Promise<UserEntity> {
    const user = await this.findUserOrFail(userId);
    const googleEmail = profile.email.trim().toLowerCase();

    if (!user.isActive) throw new UnauthorizedException('Usuario inativo.');

    // Admins do sistema podem vincular qualquer conta Google do domínio corporativo
    // (o domínio já é restrito pelo parâmetro 'hd' no fluxo OAuth).
    // Usuários não-admin devem usar a mesma conta corporativa do FormHub.
    if (user.role !== 'admin' && user.email.trim().toLowerCase() !== googleEmail) {
      throw new ForbiddenException(
        'A conta Google conectada deve ser a mesma conta corporativa do usuario autenticado.',
      );
    }

    const other = await this.usersRepository.findOne({ where: { googleSub: profile.sub } });
    if (other && other.id !== user.id) {
      throw new ForbiddenException(
        'Esta conta Google ja esta vinculada a outro usuario da plataforma.',
      );
    }

    user.googleSub = profile.sub;
    user.googleAccountEmail = googleEmail;
    user.googleAccessToken = this.tokenCipher.encrypt(tokens.accessToken);
    if (tokens.refreshToken) {
      user.googleRefreshToken = this.tokenCipher.encrypt(tokens.refreshToken);
    }
    user.googleTokenExpiresAt = tokens.expiresAt;
    user.googleConnectedAt = new Date();
    user.googleDisconnectedAt = null;
    user.googleLastUsedAt = new Date();
    return this.usersRepository.save(user);
  }

  isUserGoogleConnected(user: UserEntity): boolean {
    return (
      Boolean(user.googleRefreshToken) &&
      (!user.googleDisconnectedAt ||
        (user.googleConnectedAt !== null &&
          user.googleConnectedAt.getTime() > user.googleDisconnectedAt.getTime()))
    );
  }

  mapUserConnectionStatus(user: UserEntity): GoogleConnectionStatusResponse {
    return {
      oauthConfigured: this.isOAuthConfigured(),
      status: this.isUserGoogleConnected(user)
        ? 'connected'
        : user.googleAccountEmail
          ? 'disconnected'
          : 'configured',
      domain: this.configService.getOrThrow<string>('GOOGLE_WORKSPACE_DOMAIN'),
      linkedAccountEmail: user.googleAccountEmail,
      connectedAt: user.googleConnectedAt?.toISOString() ?? null,
      disconnectedAt: user.googleDisconnectedAt?.toISOString() ?? null,
      lastUsedAt: user.googleLastUsedAt?.toISOString() ?? null,
    };
  }

  async resolveGoogleOperatorForForm(form: FormEntity, actorId: string): Promise<UserEntity> {
    const actor = await this.usersRepository.findOne({ where: { id: actorId } });
    if (actor && this.isUserGoogleConnected(actor)) {
      if (form.googleLinkedUserId !== actor.id) {
        form.googleLinkedUserId = actor.id;
        form.googleLinkedUser = actor;
        await this.formsRepository.save(form);
      }
      return actor;
    }

    if (form.googleLinkedUser && this.isUserGoogleConnected(form.googleLinkedUser)) {
      return form.googleLinkedUser;
    }

    throw new BadRequestException(
      'Conecte uma conta Google Workspace do dominio corporativo para usar o Google Sheets.',
    );
  }

  async touchGoogleUsage(userId: string): Promise<void> {
    await this.usersRepository.update({ id: userId }, { googleLastUsedAt: new Date() });
  }

  async findUserOrFail(userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');
    return user;
  }

  private isOAuthConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID') &&
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') &&
      this.configService.get<string>('GOOGLE_OAUTH_CALLBACK_URL'),
    );
  }
}
