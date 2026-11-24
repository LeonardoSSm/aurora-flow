import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { UserInviteService } from '../users/invite/user-invite.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { LoginRateLimitService } from './login-rate-limit.service';
import type { RefreshTokenService } from './refresh-token.service';
import type { JwtPayload } from './types/jwt-payload.type';

const mockUser = {
  id: 'user-id',
  email: 'admin@formhub.local',
  fullName: 'Administrador',
  passwordHash: 'hashed-value',
  passwordDefinedAt: new Date('2024-01-01'),
  tokenVersion: 0,
  role: 'admin',
  isActive: true,
  googleAccountEmail: null,
  googleRefreshToken: null,
  googleConnectedAt: null,
  googleDisconnectedAt: null,
  lastLoginAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('AuthService', () => {
  let service: AuthService;
  let usersServiceMock: jest.Mocked<
    Pick<
      UsersService,
      | '_internalFindByEmail'
      | '_internalFindOneEntity'
      | '_internalFindByIdWithPassword'
      | '_internalSetPassword'
      | 'invalidateAllSessions'
      | 'touchLastLogin'
    >
  >;
  let jwtServiceMock: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let refreshTokenServiceMock: jest.Mocked<
    Pick<RefreshTokenService, 'issue' | 'rotate' | 'revokeAllForUser'>
  >;
  let eventEmitterMock: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  let rateLimitServiceMock: jest.Mocked<
    Pick<LoginRateLimitService, 'isBlocked' | 'record' | 'reset'>
  >;
  let permissionsServiceMock: { sessionPermissions: jest.Mock };
  let userInviteServiceMock: jest.Mocked<Pick<UserInviteService, 'consume'>>;

  beforeEach(() => {
    userInviteServiceMock = {
      consume: jest.fn().mockResolvedValue('user-id'),
    };

    usersServiceMock = {
      _internalFindByEmail: jest.fn(),
      _internalFindOneEntity: jest.fn(),
      _internalFindByIdWithPassword: jest.fn(),
      _internalSetPassword: jest.fn().mockResolvedValue(undefined),
      invalidateAllSessions: jest.fn().mockResolvedValue(undefined),
      touchLastLogin: jest.fn().mockResolvedValue(undefined),
    };

    jwtServiceMock = {
      signAsync: jest.fn().mockResolvedValue('jwt-token'),
    };

    refreshTokenServiceMock = {
      issue: jest.fn().mockResolvedValue('refresh-token'),
      rotate: jest.fn().mockResolvedValue('new-refresh-token'),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitterMock = {
      emit: jest.fn().mockReturnValue(true),
    };

    rateLimitServiceMock = {
      isBlocked: jest.fn().mockReturnValue(false),
      record: jest.fn(),
      reset: jest.fn(),
    };

    // Sessão = permissões de sistema do perfil + as de cada processo com que a pessoa tem vínculo.
    permissionsServiceMock = {
      sessionPermissions: jest.fn().mockResolvedValue({
        permissions: { 'forms.view': 'all' },
        processPermissions: { 'form-1': { 'forms.edit': 'all' } },
        processesFullAccess: false,
      }),
    };

    service = new AuthService(
      usersServiceMock as unknown as UsersService,
      jwtServiceMock as unknown as JwtService,
      refreshTokenServiceMock as unknown as RefreshTokenService,
      permissionsServiceMock as never,
      eventEmitterMock as unknown as EventEmitter2,
      userInviteServiceMock as unknown as UserInviteService,
      rateLimitServiceMock as unknown as LoginRateLimitService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login', () => {
    it('should return tokens and UserResponseDto when credentials are valid', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue(mockUser as never);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.login(
        {
          email: 'admin@formhub.local',
          password: 'FormHub@123',
        },
        '127.0.0.1',
        'jest-agent',
      );

      expect(usersServiceMock._internalFindByEmail).toHaveBeenCalledWith('admin@formhub.local');
      expect(usersServiceMock.touchLastLogin).toHaveBeenCalledWith('user-id');
      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).toMatchObject({
        id: 'user-id',
        email: 'admin@formhub.local',
        fullName: 'Administrador',
        role: 'admin',
        isActive: true,
        googleConnectionStatus: 'configured',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.permissions).toEqual({ 'forms.view': 'all' });
      expect(result.processPermissions).toEqual({ 'form-1': { 'forms.edit': 'all' } });
      expect(result.processesFullAccess).toBe(false);
    });

    it('should throw when user does not exist', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@formhub.local', password: '123456' }, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw when user is inactive', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as never);

      await expect(
        service.login({ email: 'admin@formhub.local', password: 'FormHub@123' }, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw when password is invalid', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue(mockUser as never);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'admin@formhub.local', password: 'wrong' }, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('records a failed attempt on wrong password', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue(mockUser as never);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await service.login({ email: 'admin@formhub.local', password: 'wrong' }, null, null).catch(() => null);

      expect(rateLimitServiceMock.record).toHaveBeenCalledWith('admin@formhub.local');
    });

    it('records a failed attempt when user is not found', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue(null);

      await service.login({ email: 'ghost@formhub.local', password: 'x' }, null, null).catch(() => null);

      expect(rateLimitServiceMock.record).toHaveBeenCalledWith('ghost@formhub.local');
    });

    it('throws 429 when account is blocked', async () => {
      rateLimitServiceMock.isBlocked.mockReturnValue(true);

      let thrown: unknown;
      try {
        await service.login({ email: 'admin@formhub.local', password: 'FormHub@123' }, null, null);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('resets counter on successful login', async () => {
      usersServiceMock._internalFindByEmail.mockResolvedValue(mockUser as never);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      await service.login({ email: 'admin@formhub.local', password: 'FormHub@123' }, null, null);

      expect(rateLimitServiceMock.reset).toHaveBeenCalledWith('admin@formhub.local');
      expect(rateLimitServiceMock.record).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const jwtPayload: JwtPayload = {
      sub: 'user-id',
      email: 'admin@formhub.local',
      fullName: 'Administrador',
      role: 'admin',
      tokenVersion: 0,
    };

    it('retorna novos tokens para usuário ativo', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue(mockUser as never);

      const result = await service.refresh('old-raw-token', jwtPayload, '127.0.0.1', 'jest');

      expect(usersServiceMock._internalFindOneEntity).toHaveBeenCalledWith('user-id');
      expect(refreshTokenServiceMock.rotate).toHaveBeenCalledWith('old-raw-token', '127.0.0.1', 'jest');
      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('lança UnauthorizedException quando usuário não existe', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue(null);

      await expect(
        service.refresh('old-raw-token', jwtPayload, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lança UnauthorizedException quando usuário está inativo', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as never);

      await expect(
        service.refresh('old-raw-token', jwtPayload, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('propaga UnauthorizedException lançada pelo RefreshTokenService (reuso detectado)', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue(mockUser as never);
      refreshTokenServiceMock.rotate.mockRejectedValue(
        new UnauthorizedException('Refresh token já utilizado.'),
      );

      await expect(
        service.refresh('replayed-token', jwtPayload, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('setPassword', () => {
    // Usuário que entrou pelo Google e ainda não escolheu uma senha local.
    // Fábrica (e não constante) porque setPassword muta a entidade recebida.
    const googleUser = () => ({ ...mockUser, passwordDefinedAt: null });

    it('cadastra a primeira senha sem exigir a senha atual', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue(googleUser() as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('novo-hash' as never);

      const result = await service.setPassword(
        'user-id',
        { password: 'Senha@123' },
        '127.0.0.1',
        'jest',
      );

      expect(usersServiceMock._internalSetPassword).toHaveBeenCalledWith('user-id', 'novo-hash');
      expect(refreshTokenServiceMock.revokeAllForUser).toHaveBeenCalledWith('user-id');
      expect(usersServiceMock.invalidateAllSessions).toHaveBeenCalledWith('user-id');
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.hasPassword).toBe(true);
    });

    it('emite evento de auditoria marcando primeiro cadastro', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue(googleUser() as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('novo-hash' as never);

      await service.setPassword('user-id', { password: 'Senha@123' }, null, null);

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'auth.password_set',
        expect.objectContaining({ wasChange: false }),
      );
    });

    it('assina o novo access token com o token_version incrementado', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue({
        ...googleUser(),
        tokenVersion: 3,
      } as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('novo-hash' as never);

      await service.setPassword('user-id', { password: 'Senha@123' }, null, null);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 4 }),
      );
    });

    it('exige a senha atual quando o usuário já possui senha', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue({ ...mockUser } as never);

      await expect(
        service.setPassword('user-id', { password: 'Senha@123' }, null, null),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersServiceMock._internalSetPassword).not.toHaveBeenCalled();
    });

    it('rejeita quando a senha atual está incorreta', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue({ ...mockUser } as never);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.setPassword(
          'user-id',
          { currentPassword: 'errada', password: 'Senha@123' },
          null,
          null,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersServiceMock._internalSetPassword).not.toHaveBeenCalled();
    });

    it('troca a senha quando a senha atual confere', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue({ ...mockUser } as never);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('novo-hash' as never);

      await service.setPassword(
        'user-id',
        { currentPassword: 'FormHub@123', password: 'Senha@123' },
        null,
        null,
      );

      expect(usersServiceMock._internalSetPassword).toHaveBeenCalledWith('user-id', 'novo-hash');
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'auth.password_set',
        expect.objectContaining({ wasChange: true }),
      );
    });

    it('rejeita usuário inativo', async () => {
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue({
        ...googleUser(),
        isActive: false,
      } as never);

      await expect(
        service.setPassword('user-id', { password: 'Senha@123' }, null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('should return UserResponseDto for active user', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue(mockUser as never);

      const result = await service.me('user-id');

      expect(usersServiceMock._internalFindOneEntity).toHaveBeenCalledWith('user-id');
      expect(result).toMatchObject({
        id: 'user-id',
        email: 'admin@formhub.local',
        role: 'admin',
        googleConnectionStatus: 'configured',
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw when user is not found', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue(null);

      await expect(service.me('ghost-id')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw when user is inactive', async () => {
      usersServiceMock._internalFindOneEntity.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as never);

      await expect(service.me('user-id')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('acceptInvite', () => {
    const invitedUser = { ...mockUser, passwordDefinedAt: null, lastLoginAt: null };

    beforeEach(() => {
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);
      usersServiceMock._internalFindByIdWithPassword.mockResolvedValue({ ...invitedUser } as never);
    });

    it('gasta o convite, grava a senha e devolve a sessão aberta', async () => {
      const result = await service.acceptInvite('token', 'NovaSenha1', '127.0.0.1', 'jest');

      expect(userInviteServiceMock.consume).toHaveBeenCalledWith('token');
      expect(usersServiceMock._internalSetPassword).toHaveBeenCalledWith('user-id', 'new-hash');
      expect(usersServiceMock.touchLastLogin).toHaveBeenCalledWith('user-id');
      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.hasPassword).toBe(true);
    });

    it('encerra sessões anteriores e assina com o token_version incrementado', async () => {
      await service.acceptInvite('token', 'NovaSenha1', null, null);

      expect(refreshTokenServiceMock.revokeAllForUser).toHaveBeenCalledWith('user-id');
      expect(usersServiceMock.invalidateAllSessions).toHaveBeenCalledWith('user-id');
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 1 }),
      );
    });

    it('audita como primeiro cadastro de senha', async () => {
      await service.acceptInvite('token', 'NovaSenha1', null, null);

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'auth.password_set',
        expect.objectContaining({ actorId: 'user-id', wasChange: false }),
      );
    });

    it('convite inválido não grava senha nenhuma', async () => {
      userInviteServiceMock.consume.mockRejectedValue(new NotFoundException('inválido'));

      await expect(service.acceptInvite('token', 'NovaSenha1', null, null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(usersServiceMock._internalSetPassword).not.toHaveBeenCalled();
      expect(refreshTokenServiceMock.issue).not.toHaveBeenCalled();
    });
  });
});
