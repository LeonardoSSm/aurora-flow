import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ example: 'Senha@123', minLength: 8 })
  @IsString()
  @MaxLength(200)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: 'Senha deve ter 8+ caracteres, 1 maiúscula, 1 minúscula e 1 número.',
  })
  password!: string;
}
