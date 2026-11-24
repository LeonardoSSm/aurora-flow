import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome ou email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'editor', description: 'Filtrar por código de perfil.' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Filtrar apenas ativos (true) ou inativos (false)' })
  @IsOptional()
  isActive?: boolean;
}
