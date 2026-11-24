import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';

export class ReportFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsEnum(SolicitationStatus)
  status?: SolicitationStatus;

  @IsOptional()
  @IsUUID()
  formId?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;
}
