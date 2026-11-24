import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormFieldType } from '../../../common/enums/form-field-type.enum';

// Campos do ERP ficam de fora no v1: pergunta padrão é reaproveitada em muitos formulários e a
// configuração do campo (conector + lista, e na tabela os campos de que ela depende) é por
// formulário.
const STANDARD_QUESTION_FIELD_TYPES = Object.values(FormFieldType).filter(
  (type) =>
    type !== FormFieldType.ERP_LOOKUP &&
    type !== FormFieldType.ERP_TABLE &&
    type !== FormFieldType.ITEM_ORDER &&
    type !== FormFieldType.FILE_DOWNLOAD,
);

export class StandardQuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;
}

export class StandardQuestionInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsIn(STANDARD_QUESTION_FIELD_TYPES)
  fieldType!: FormFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  settingsJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StandardQuestionOptionDto)
  options?: StandardQuestionOptionDto[];
}

export class SaveStandardQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StandardQuestionInputDto)
  questions!: StandardQuestionInputDto[];
}
