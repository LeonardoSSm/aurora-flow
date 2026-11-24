import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PhaseFieldValueItemDto {
  @IsUUID()
  phaseFieldId!: string;

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

export class SavePhaseFieldValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhaseFieldValueItemDto)
  items!: PhaseFieldValueItemDto[];
}
