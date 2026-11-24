import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateAreaDto {
  @ApiPropertyOptional({ example: 'Recursos Humanos' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: 'RH' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
