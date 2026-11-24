import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ example: 'joao@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    example: 'Senha@123',
    minLength: 8,
    description:
      'Opcional. Sem senha, o usuário fica pré-cadastrado: já pode ser atribuído (ex.: como aprovador) e entra pela primeira vez com o Google corporativo.',
  })
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
  role: string = 'editor';

  @ApiPropertyOptional({ description: 'UUID da área organizacional do usuário' })
  @IsOptional()
  @IsUUID()
  areaId?: string | null;

  @ApiPropertyOptional({
    default: true,
    description:
      'Envia ao e-mail do usuário um convite com link pessoal para criar a senha. Falha de envio não impede a criação.',
  })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean = true;
}
