import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SolicitationOriginType } from '../../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';

export class QuerySolicitationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por titulo, descricao ou respondente' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SolicitationStatus })
  @IsOptional()
  @IsEnum(SolicitationStatus)
  status?: SolicitationStatus;

  @ApiPropertyOptional({ enum: SolicitationPriority })
  @IsOptional()
  @IsEnum(SolicitationPriority)
  priority?: SolicitationPriority;

  @ApiPropertyOptional({ enum: SolicitationOriginType })
  @IsOptional()
  @IsEnum(SolicitationOriginType)
  originType?: SolicitationOriginType;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  formId?: string;
}
