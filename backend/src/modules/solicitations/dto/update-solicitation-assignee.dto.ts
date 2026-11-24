import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateSolicitationAssigneeDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: 'Observacao registrada no historico' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
