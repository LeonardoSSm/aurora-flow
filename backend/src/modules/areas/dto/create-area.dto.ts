import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'Recursos Humanos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ example: 'RH' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: 'UUID da área pai (para hierarquia)' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
