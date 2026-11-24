import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { GRID_COLS } from '../grid-layout.util';

const TIPOS_DE_WIDGET = ['kpi', 'categorias', 'serie', 'ranking'] as const;
const FONTES = ['respostas', 'solicitacoes'] as const;
const DIMENSOES = ['status', 'prioridade', 'area', 'responsavel', 'formulario', 'sla'] as const;
/** Teto de linhas — generoso o bastante para nunca ser o que trava alguem. */
const ALTURA_MAXIMA = 60;

/**
 * O corpo so garante forma; o significado (campo existe? agregacao cabe no
 * tipo?) e conferido pelo motor contra a definicao real do formulario. Validar
 * `config_json` aqui em detalhe duplicaria essa regra em dois lugares que
 * inevitavelmente divergiriam.
 */
export class UpsertWidgetDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsIn(TIPOS_DE_WIDGET)
  kind!: (typeof TIPOS_DE_WIDGET)[number];

  @IsObject()
  configJson!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** Coluna onde o bloco começa, 0 a 11 numa grade de 12. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(GRID_COLS - 1)
  x?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(ALTURA_MAXIMA)
  y?: number;

  /** Colunas ocupadas. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(GRID_COLS)
  w?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ALTURA_MAXIMA)
  h?: number;
}

export class UpsertDashboardDto {
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

export class RunWidgetDto {
  @IsIn(TIPOS_DE_WIDGET)
  tipo!: (typeof TIPOS_DE_WIDGET)[number];

  /**
   * Ausente = `respostas`. O pipe global roda com `forbidNonWhitelisted`, então
   * campo não declarado aqui devolve 400 em vez de ser ignorado — motivo de
   * `fonte` e `dimensao` viverem no DTO da fonte de respostas também.
   */
  @IsOptional()
  @IsIn(FONTES)
  fonte?: (typeof FONTES)[number];

  @IsOptional()
  @IsIn(DIMENSOES)
  dimensao?: (typeof DIMENSOES)[number] | null;

  @IsOptional()
  @IsString()
  campo?: string | null;

  @IsOptional()
  @IsString()
  agregacao?: string;

  /** Segunda métrica opcional — ver o comentário em `WidgetConfig`. */
  @IsOptional()
  @IsString()
  campo2?: string | null;

  @IsOptional()
  @IsString()
  agregacao2?: string;

  @IsOptional()
  @IsString()
  intervalo?: string;

  @IsOptional()
  @IsInt()
  limite?: number;

  @IsOptional()
  @IsInt()
  periodoDias?: number | null;
}
