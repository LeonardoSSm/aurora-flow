import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RunWidgetDto, UpsertWidgetDto } from './dashboard.dto';

/**
 * Corpo dos paineis livres.
 *
 * Herda o widget do painel de formulario e acrescenta so o que muda: qual
 * formulario o bloco le. Duas formas separadas divergiriam na primeira vez que
 * alguem mexesse numa delas.
 */
export class UpsertPainelLivreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertWidgetDto)
  widgets!: UpsertWidgetDto[];
}

export class PublicarPainelDto {
  @IsBoolean()
  publicado!: boolean;
}

/**
 * Pré-visualização num painel livre: o formulário vem no corpo, não na rota.
 *
 * Opcional porque bloco de solicitações não tem formulário nenhum — quem cobra
 * a presença dele é o roteador de fonte, que sabe qual motor vai receber a
 * configuração.
 */
export class PreverPainelLivreDto extends RunWidgetDto {
  @IsOptional()
  @IsUUID()
  formId?: string;
}
