import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PermissionScope } from '../../common/constants/permission-catalog';
import type { ProcessPermissionScope } from '../../common/constants/process-permission-catalog';
import { BCRYPT_COST_FACTOR } from '../../common/constants/security.constants';
import { PasswordDefinedEvent } from '../../common/events/auth-events';
import { UserEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserInviteService } from '../users/invite/user-invite.service';
import { PermissionsService } from '../roles/permissions.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { LoginRateLimitService } from './login-rate-limit.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtPayload } from './types/jwt-payload.type';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  user: UserResponseDto;
  permissions: Record<string, PermissionScope>;
  /** Permissões em cada processo com que a pessoa tem vínculo (vazio com acesso total). */
  processPermissions: Record<string, Record<string, ProcessPermissionScope>>;
  /** Acesso total aos processos pelo perfil: vale tudo em todo processo. */
  processesFullAccess: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    @Optional() private readonly processAccess: ProcessAccessService | undefined,
    private readonly eventEmitter: EventEmitter2,
    private readonly userInviteService: UserInviteService,
    @Optional() private readonly rateLimitService?: LoginRateLimitService,
    @Optional() private readonly permissions?: PermissionsService,
  ) {}

  async login(
    credentials: LoginDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AuthTokens> {
    if (this.rateLimitService?.isBlocked(credentials.email)) {
      throw new HttpException(
        'Conta temporariamente bloqueada. Tente em 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersService._internalFindByEmail(credentials.email);

    if (!user?.isActive) {
      this.rateLimitService?.record(credentials.email);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const matches = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!matches) {
      this.rateLimitService?.record(credentials.email);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    this.rateLimitService?.reset(credentials.email);
    await this.usersService.touchLastLogin(user.id);
    return this.generateTokens(user, ip, userAgent);
  }

  async refresh(
    oldRawToken: string,
    currentUser: JwtPayload,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AuthTokens> {
    const user = await this.usersService._internalFindOneEntity(currentUser.sub);
    if (!user?.isActive) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado.');
    }
    const newPayload = this.toJwtPayload(user);
    const [accessToken, refreshToken, session] = await Promise.all([
      this.jwtService.signAsync(newPayload),
      this.refreshTokenService.rotate(oldRawToken, ip, userAgent),
      this.sessionPermissions(user),
    ]);
    return { accessToken, refreshToken, user: UserResponseDto.fromEntity(user), ...session };
  }

  /**
   * Cadastra (ou troca) a senha local do usuário autenticado. É o que permite a
   * quem entrou pelo Google Workspace passar a acessar depois com e-mail e senha.
   *
   * Quem já tem senha precisa informar a atual. Ao final, todas as outras sessões
   * são encerradas e a sessão corrente recebe tokens novos.
   */
  async setPassword(
    userId: string,
    dto: SetPasswordDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AuthTokens> {
    const user = await this.usersService._internalFindByIdWithPassword(userId);
    if (!user?.isActive) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado.');
    }

    const wasChange = Boolean(user.passwordDefinedAt);
    if (wasChange) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Informe a senha atual para alterá-la.');
      }
      const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!matches) {
        throw new UnauthorizedException('Senha atual incorreta.');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);
    await this.usersService._internalSetPassword(user.id, passwordHash);

    // Derruba as demais sessões: refresh tokens são revogados no banco e o
    // token_version invalida os access tokens já emitidos. A sessão que fez a
    // troca é reemitida logo abaixo, com o token_version novo.
    await this.refreshTokenService.revokeAllForUser(user.id);
    await this.usersService.invalidateAllSessions(user.id);
    user.tokenVersion += 1;
    user.passwordHash = passwordHash;
    user.passwordDefinedAt = new Date();

    this.eventEmitter.emit(
      'auth.password_set',
      new PasswordDefinedEvent(user.id, user.email, wasChange),
    );

    return this.generateTokens(user, ip, userAgent);
  }

  /**
   * Cria a senha pelo link do convite e já abre a sessão. O convite é gasto antes de gravar a
   * senha (operação única no banco), então o mesmo link não serve duas vezes. Se a pessoa já
   * tinha sessões (ex.: entrou antes pelo Google), elas são encerradas como numa troca de senha.
   */
  async acceptInvite(
    token: string,
    password: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AuthTokens> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const userId = await this.userInviteService.consume(token);

    const user = await this.usersService._internalFindByIdWithPassword(userId);
    if (!user?.isActive) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado.');
    }
    const wasChange = Boolean(user.passwordDefinedAt);

    await this.usersService._internalSetPassword(user.id, passwordHash);
    await this.refreshTokenService.revokeAllForUser(user.id);
    await this.usersService.invalidateAllSessions(user.id);
    await this.usersService.touchLastLogin(user.id);
    user.tokenVersion += 1;
    user.passwordHash = passwordHash;
    user.passwordDefinedAt = new Date();
    user.lastLoginAt = new Date();

    this.eventEmitter.emit(
      'auth.password_set',
      new PasswordDefinedEvent(user.id, user.email, wasChange),
    );

    return this.generateTokens(user, ip, userAgent);
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService._internalFindOneEntity(userId);
    if (!user?.isActive) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado.');
    }
    return UserResponseDto.fromEntity(user);
  }

  private toJwtPayload(user: UserEntity): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tokenVersion: user.tokenVersion,
      areaId: user.areaId ?? null,
    };
  }

  private async generateTokens(
    user: UserEntity,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AuthTokens> {
    const payload = this.toJwtPayload(user);
    const [accessToken, refreshToken, session] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.refreshTokenService.issue(payload, ip, userAgent),
      this.sessionPermissions(user),
    ]);
    return { accessToken, refreshToken, user: UserResponseDto.fromEntity(user), ...session };
  }

  private async sessionPermissions(user: UserEntity): Promise<{
    permissions: Record<string, PermissionScope>;
    processPermissions: Record<string, Record<string, ProcessPermissionScope>>;
    processesFullAccess: boolean;
  }> {
    if (this.processAccess) {
      return this.processAccess.sessionPermissions({ sub: user.id, role: user.role });
    }
    const permissions = (await this.permissions?.getAllForRole(user.role)) ?? {};
    return { permissions, processPermissions: {}, processesFullAccess: false };
  }
}
