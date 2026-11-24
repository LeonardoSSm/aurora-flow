import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryFlowsDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  /** Exclui um fluxo específico da listagem (útil para omitir o fluxo atual no seletor de sub-fluxos). */
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
