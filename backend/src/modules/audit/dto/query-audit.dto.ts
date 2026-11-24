import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryAuditDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'forms', description: 'Filtrar por módulo' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: 'create', description: 'Filtrar por ação' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ator (UUID do usuário)' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ example: '2024-01-01', description: 'Data de início (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2024-12-31', description: 'Data de fim (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
