import { IsUUID } from 'class-validator';

export class MovePhaseDto {
  @IsUUID()
  phaseId!: string;
}
