import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ApprovalDecisionValue } from '../../../database/entities/approval-decision.entity';

export class DecideApprovalStepDto {
  @IsEnum(['approved', 'rejected'])
  decision!: ApprovalDecisionValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
