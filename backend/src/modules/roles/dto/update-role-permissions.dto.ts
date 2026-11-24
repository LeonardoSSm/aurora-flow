import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { RolePermissionEntryDto } from './role-permission-entry.dto';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [RolePermissionEntryDto],
    description:
      'Lista completa de permissões do perfil — substitui integralmente as concessões atuais. ' +
      'Códigos omitidos ficam implicitamente em "none".',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionEntryDto)
  permissions!: RolePermissionEntryDto[];
}
