import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiProperty({ example: 'auditor', description: 'Código de um perfil existente.' })
  @IsString()
  @MaxLength(40)
  newRole!: string;
}
