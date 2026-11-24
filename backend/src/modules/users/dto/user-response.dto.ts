import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../../database/entities/user.entity';

export type GoogleConnectionStatus = 'configured' | 'connected' | 'disconnected';

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ description: 'Se o usuário já cadastrou uma senha local de acesso.' })
  hasPassword!: boolean;

  @ApiProperty({ nullable: true })
  googleAccountEmail!: string | null;

  @ApiProperty({ enum: ['configured', 'connected', 'disconnected'] })
  googleConnectionStatus!: GoogleConnectionStatus;

  @ApiProperty({ nullable: true })
  googleConnectedAt!: Date | null;

  @ApiProperty({ nullable: true })
  googleDisconnectedAt!: Date | null;

  @ApiProperty({ nullable: true })
  googleLastUsedAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ nullable: true })
  areaId!: string | null;

  @ApiProperty({ nullable: true })
  areaName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(user: UserEntity): UserResponseDto {
    const dto = new UserResponseDto();

    dto.id = user.id;
    dto.fullName = user.fullName;
    dto.email = user.email;
    dto.role = user.role;
    dto.isActive = user.isActive;
    dto.hasPassword = Boolean(user.passwordDefinedAt);
    dto.googleAccountEmail = user.googleAccountEmail;
    dto.googleConnectedAt = user.googleConnectedAt;
    dto.googleDisconnectedAt = user.googleDisconnectedAt;
    dto.googleLastUsedAt = user.googleLastUsedAt;
    dto.lastLoginAt = user.lastLoginAt;

    const hasToken = Boolean(user.googleRefreshToken);

    if (
      hasToken &&
      (!user.googleDisconnectedAt ||
        (user.googleConnectedAt && user.googleConnectedAt > user.googleDisconnectedAt))
    ) {
      dto.googleConnectionStatus = 'connected';
    } else if (user.googleAccountEmail) {
      dto.googleConnectionStatus = 'disconnected';
    } else {
      dto.googleConnectionStatus = 'configured';
    }

    dto.areaId = user.areaId ?? null;
    dto.areaName = user.area?.name ?? null;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;

    return dto;
  }
}
