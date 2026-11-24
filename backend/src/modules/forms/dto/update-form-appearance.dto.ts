import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

/** Cor e ícone do card do processo. Campo ausente = mantém; null = volta ao padrão. */
export class UpdateFormAppearanceDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'A cor deve estar no formato #RRGGBB.' })
  color?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, { message: 'Ícone inválido.' })
  icon?: string | null;
}
