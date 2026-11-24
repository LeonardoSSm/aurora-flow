import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'João da Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ example: 'joao@exemplo.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'NovaSenha@123' })
  @IsOptional()
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: 'Senha deve ter 8+ caracteres, 1 maiúscula, 1 minúscula e 1 número.',
  })
  password?: string;

  @ApiPropertyOptional({ example: 'editor', description: 'Código de um perfil existente.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'UUID da área organizacional do usuário' })
  @IsOptional()
  @IsUUID()
  areaId?: string | null;
}
