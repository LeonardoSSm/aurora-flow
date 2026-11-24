import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ApprovalDecisionValue } from '../../../database/entities/approval-decision.entity';

/** Decisão tomada pelo link pessoal enviado por e-mail (sem login). */
export class DecideExternalApprovalDto {
  @IsEnum(['approved', 'rejected'])
  decision!: ApprovalDecisionValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  /** O mesmo e-mail que recebeu o link: segundo fator, para o link vazado/encaminhado não bastar. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  confirmEmail!: string;
}
