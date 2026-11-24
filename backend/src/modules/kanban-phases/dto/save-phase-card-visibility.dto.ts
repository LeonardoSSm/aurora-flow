import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Uma regra do filtro de cards da fase (ver KanbanPhaseEntity.cardVisibility). */
export class PhaseCardVisibilityRuleDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,120}$/, { message: 'Código de campo inválido.' })
  fieldCode!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(500, { each: true })
  values!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roleCodes!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class SavePhaseCardVisibilityDto {
  /** Lista vazia = desliga o filtro (todos que veem a fase veem todos os cards). */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PhaseCardVisibilityRuleDto)
  rules!: PhaseCardVisibilityRuleDto[];

  /** Quem não está em nenhuma regra vê todos os cards da fase (true) ou nenhum (false). */
  @IsBoolean()
  othersSeeAll!: boolean;
}
