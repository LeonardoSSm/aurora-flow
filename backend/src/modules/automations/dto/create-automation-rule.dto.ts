import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

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

  @IsNotEmpty()
  actions!: Record<string, unknown>[];
}
