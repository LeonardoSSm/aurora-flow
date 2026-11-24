import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SolicitationPriority } from '../../../common/enums/solicitation-priority.enum';

export class UpdateSolicitationPriorityDto {
  @IsEnum(SolicitationPriority)
  priority!: SolicitationPriority;

  @ApiPropertyOptional({ description: 'Observacao registrada no historico' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
