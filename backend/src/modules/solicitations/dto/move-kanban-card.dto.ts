import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';

export class MoveKanbanCardDto {
  @IsEnum(SolicitationStatus)
  status!: SolicitationStatus;

  @IsOptional()
  @IsString()
  currentStage?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;
}
