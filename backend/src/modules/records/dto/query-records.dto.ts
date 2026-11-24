import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const COLUMN_KEY = /^(sys|form|phase):[\w.-]{1,120}$/;

/** Um filtro numa coluna: as opções marcadas (escolha / sim-não) ou um trecho de texto. */
export class RecordFilterDto {
  @ApiProperty({ example: 'form:tipo_pedido' })
  @IsString()
  @Matches(COLUMN_KEY)
  key!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  values?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string;
}

/** Filtros da tela Registros — os mesmos valem para a lista e para o relatório. */
export class RecordFiltersDto {
  @ApiPropertyOptional({ description: 'Busca em título, solicitante, responsável e respostas' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt'])
  dateField?: 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({ description: 'Início do período (ISO 8601, inclusivo)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fim do período (ISO 8601, inclusivo)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ type: [RecordFilterDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RecordFilterDto)
  filters?: RecordFilterDto[];
}

export class QueryRecordsDto extends RecordFiltersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @ApiPropertyOptional({ enum: ['sys:createdAt', 'sys:updatedAt', 'sys:phaseEnteredAt', 'sys:title'] })
  @IsOptional()
  @IsIn(['sys:createdAt', 'sys:updatedAt', 'sys:phaseEnteredAt', 'sys:title'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export class RecordReportRequestDto extends RecordFiltersDto {
  @ApiProperty({ description: 'Montagem do relatório (RecordReportConfig)' })
  @IsObject()
  report!: Record<string, unknown>;
}

export class SaveReportTemplateDto {
  @ApiProperty({ example: 'Pedidos do mês por fase' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Montagem do relatório (RecordReportConfig)' })
  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateReportTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
