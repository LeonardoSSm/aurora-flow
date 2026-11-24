import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RolePermissionEntryDto } from './role-permission-entry.dto';

export class CreateRoleDto {
  @ApiProperty({ example: 'auditor', description: 'Identificador único e estável do perfil.' })
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9_]{1,39}$/, {
    message:
      'code deve começar com uma letra minúscula e conter apenas letras minúsculas, números e underscore.',
  })
  code!: string;

  @ApiProperty({ example: 'Auditor' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'blue' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ type: [RolePermissionEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionEntryDto)
  permissions?: RolePermissionEntryDto[];
}
