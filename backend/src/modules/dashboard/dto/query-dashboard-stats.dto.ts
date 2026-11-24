import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryDashboardStatsDto {
  @ApiPropertyOptional({ description: 'Filtro de busca global para o dashboard' })
  @IsOptional()
  @IsString()
  q?: string;
}
