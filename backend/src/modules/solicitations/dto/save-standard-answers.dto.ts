import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StandardAnswerItemDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  fieldCode!: string;

  @IsOptional()
  valueText?: string;

  @IsOptional()
  valueNumber?: number;

  @IsOptional()
  valueBoolean?: boolean;

  @IsOptional()
  valueJson?: unknown;
}

export class SaveStandardAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StandardAnswerItemDto)
  items!: StandardAnswerItemDto[];
}
