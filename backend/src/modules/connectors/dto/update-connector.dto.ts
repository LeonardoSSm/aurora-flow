import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConnectorDto {
  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}
