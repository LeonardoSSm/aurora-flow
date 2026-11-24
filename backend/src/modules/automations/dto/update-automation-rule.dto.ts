import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['on_submission', 'on_section_reached'])
  trigger?: string;

  @IsOptional()
  @IsUUID()
  targetSectionId?: string | null;

  @IsOptional()
  conditions?: Record<string, unknown> | null;

  @IsOptional()
  actions?: Record<string, unknown>[];
}
