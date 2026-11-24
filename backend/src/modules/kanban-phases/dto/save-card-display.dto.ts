import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CARD_DISPLAY_LABEL_MAX, CARD_DISPLAY_MAX_FIELDS, CARD_INDICATORS } from '../card-display';

export class CardDisplayFieldDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,120}$/, { message: 'Código de campo inválido.' })
  fieldCode!: string;

  /** Rótulo mais curto no card; vazio/ausente = o nome do campo. */
  @IsOptional()
  @IsString()
  @MaxLength(CARD_DISPLAY_LABEL_MAX)
  label?: string | null;
}

/** O que o card mostra numa fase (padrão da fase ou ajuste pessoal). */
export class SaveCardDisplayDto {
  @IsArray()
  @ArrayMaxSize(CARD_INDICATORS.length)
  @IsIn(CARD_INDICATORS as string[], { each: true, message: 'Indicador desconhecido.' })
  indicators!: string[];

  @IsArray()
  @ArrayMaxSize(CARD_DISPLAY_MAX_FIELDS, { message: `No máximo ${CARD_DISPLAY_MAX_FIELDS} campos no card.` })
  @ValidateNested({ each: true })
  @Type(() => CardDisplayFieldDto)
  fields!: CardDisplayFieldDto[];
}
