import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { FormStatus } from '../../../common/enums/form-status.enum';

export class QueryFormsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome do formulário' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @ApiPropertyOptional({
    enum: FormStatus,
    description: 'Excluir um status específico (ex.: ocultar arquivados por padrão)',
  })
  @IsOptional()
  @IsEnum(FormStatus)
  excludeStatus?: FormStatus;

  @ApiPropertyOptional({ description: 'Filtrar por categoria' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filtrar por área' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Filtrar por criador (UUID do usuário)' })
  @IsOptional()
  @IsUUID()
  createdBy?: string;
}
