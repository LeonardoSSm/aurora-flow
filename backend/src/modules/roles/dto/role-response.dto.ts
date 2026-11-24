import { ApiProperty } from '@nestjs/swagger';
import type { PermissionScope } from '../../../common/constants/permission-catalog';
import type { RoleEntity, UserEntity } from '../../../database/entities';

export class RoleUserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true })
  lastLoginAt!: Date | null;
}

export class RoleResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  color!: string;

  @ApiProperty({
    description: 'Perfil semeado pelo sistema (badge informativo — não concede privilégios).',
  })
  isSystem!: boolean;

  @ApiProperty({ type: Object, description: 'Mapa código de permissão → escopo concedido.' })
  permissions!: Record<string, PermissionScope>;

  @ApiProperty()
  userCount!: number;

  @ApiProperty()
  activeUserCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(
    role: RoleEntity,
    userCount: number,
    activeUserCount: number,
  ): RoleResponseDto {
    const dto = new RoleResponseDto();
    dto.code = role.code;
    dto.name = role.name;
    dto.description = role.description;
    dto.color = role.color;
    dto.isSystem = role.isSystem;
    dto.permissions = Object.fromEntries(
      (role.permissions ?? []).map((p) => [p.permissionCode, p.scope]),
    );
    dto.userCount = userCount;
    dto.activeUserCount = activeUserCount;
    dto.createdAt = role.createdAt;
    dto.updatedAt = role.updatedAt;
    return dto;
  }
}

export class RoleDetailResponseDto extends RoleResponseDto {
  @ApiProperty({ type: [RoleUserSummaryDto] })
  users!: RoleUserSummaryDto[];

  static fromWithUsers(
    role: RoleEntity,
    users: Array<Pick<UserEntity, 'id' | 'fullName' | 'email' | 'isActive' | 'lastLoginAt'>>,
  ): RoleDetailResponseDto {
    const base = RoleResponseDto.from(role, users.length, users.filter((u) => u.isActive).length);
    const dto = new RoleDetailResponseDto();
    Object.assign(dto, base);
    dto.users = users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
    }));
    return dto;
  }
}
