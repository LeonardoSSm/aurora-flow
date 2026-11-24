import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';

export class UpdateSolicitationStatusDto {
  @IsEnum(SolicitationStatus)
  status!: SolicitationStatus;

  @ApiPropertyOptional({ description: 'Observacao registrada no historico' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
