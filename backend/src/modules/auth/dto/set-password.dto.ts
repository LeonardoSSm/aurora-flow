import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SetPasswordDto {
  @ApiPropertyOptional({
    example: 'Senha@123',
    description:
      'Obrigatória apenas quando o usuário já possui senha cadastrada (troca de senha).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  @ApiProperty({ example: 'Senha@123', minLength: 8 })
  @IsString()
  @MaxLength(200)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: 'Senha deve ter 8+ caracteres, 1 maiúscula, 1 minúscula e 1 número.',
  })
  password!: string;
}
