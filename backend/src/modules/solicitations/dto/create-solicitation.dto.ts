import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SolicitationPriority } from '../../../common/enums/solicitation-priority.enum';

export class CreateSolicitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: SolicitationPriority })
  @IsOptional()
  @IsEnum(SolicitationPriority)
  priority?: SolicitationPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  formId?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
