import { IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SubmitResponseItemDto } from './submit-response.dto';

export class SubmitProgressDto {
  @IsUUID()
  formVersionId!: string;

  @IsUUID()
  sectionId!: string;

  @IsOptional()
  @IsUUID()
  progressId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitResponseItemDto)
  items!: SubmitResponseItemDto[];
}
