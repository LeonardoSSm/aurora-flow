import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormFieldType } from '../../../common/enums/form-field-type.enum';

export class FormVersionSettingsDto {
  @IsOptional()
  @IsIn(['single', 'stepper'])
  mode?: 'single' | 'stepper';

  /** Bloco de nome/e-mail opcional exibido no topo do formulário público. Padrão (ausente
   * ou `undefined`) é `true` — formulário existente sem essa chave continua mostrando o
   * bloco, igual sempre mostrou. */
  @IsOptional()
  @IsBoolean()
  showResponderIdentification?: boolean;

  /** Quando `true`, nome e e-mail do bloco de identificação são obrigatórios (envio sem eles
   * volta 422). Ausente equivale a `false` — envio anônimo continua valendo. */
  @IsOptional()
  @IsBoolean()
  requireResponderIdentification?: boolean;

  /** Quando `true`, a resposta do atendente a uma solicitação vira uma proposta que
   * precisa ser aprovada pelo solicitante antes de ser considerada concluída. */
  @IsOptional()
  @IsBoolean()
  requiresResponseApproval?: boolean;
}

export class CreateFormFieldOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  internalValue!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  displayLabel!: string;
}

export class CreateFormFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  label!: string;

  @IsEnum(FormFieldType)
  fieldType!: FormFieldType;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  settingsJson?: Record<string, unknown>;

  @IsOptional()
  conditionsJson?: Record<string, unknown>;

  @IsOptional()
  visibilityRules?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFormFieldOptionDto)
  options?: CreateFormFieldOptionDto[];
}

export class CreateSectionBranchDto {
  @IsString()
  @IsNotEmpty()
  fieldCode!: string;

  @IsOptional()
  @IsString()
  optionValue?: string;

  @IsOptional()
  @IsBoolean()
  checkboxValue?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetSectionIndex?: number | null;
}

export class CreateFormSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  nextSectionIndex?: number | null;

  /**
   * Posicao no canvas da aba Fluxo, em pixel. Ausente/nula = nunca
   * posicionada a mao — o front calcula a linha reta padrao.
   *
   * De proposito fora do hash de estrutura (form-version.writer.ts): mover
   * uma secao no canvas nao e mudanca de estrutura, e nao deveria criar
   * versao nova do formulario.
   */
  @IsOptional()
  @IsNumber()
  flowPositionX?: number | null;

  @IsOptional()
  @IsNumber()
  flowPositionY?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionBranchDto)
  branches?: CreateSectionBranchDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFormFieldDto)
  fields!: CreateFormFieldDto[];
}

export class CreateFormGoogleSheetsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateOnSave?: boolean;
}

export class CreateFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string | null;

  /** Pessoas com acesso ao formulario e a tudo que pende dele. */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedUserIds?: string[] | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFormSectionDto)
  sections!: CreateFormSectionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateFormGoogleSheetsDto)
  googleSheets?: CreateFormGoogleSheetsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormVersionSettingsDto)
  settingsJson?: FormVersionSettingsDto;
}
