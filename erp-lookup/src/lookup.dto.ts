import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const MAX_CARACTERES = 100;

export class PesquisaQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CARACTERES)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ResolverQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CARACTERES)
  value!: string;
}
