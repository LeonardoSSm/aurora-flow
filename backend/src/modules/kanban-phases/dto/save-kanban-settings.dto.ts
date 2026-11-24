import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class SaveKanbanSettingsDto {
  /** Código do campo (formulário ou fase) mostrado em R$ no card e somado por coluna; null tira. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,120}$/, { message: 'Código de campo inválido.' })
  cardValueField?: string | null;
}
