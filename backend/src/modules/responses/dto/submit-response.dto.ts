import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitResponseItemDto {
  @IsUUID()
  fieldId!: string;

  @IsString()
  @IsNotEmpty()
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

export class SubmitResponseDto {
  @IsUUID()
  formId!: string;

  @IsUUID()
  formVersionId!: string;

  @IsOptional()
  @IsString()
  responderName?: string;

  @IsOptional()
  @IsEmail()
  responderEmail?: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitResponseItemDto)
  items!: SubmitResponseItemDto[];
}
