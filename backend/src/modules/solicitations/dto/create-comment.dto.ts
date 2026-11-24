import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePublicCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  authorName?: string;

  @IsOptional()
  @IsEmail()
  authorEmail?: string;
}

export class CreateInternalCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  /** Quando true (e o formulário exige aprovação), esta resposta vira uma proposta
   * que o solicitante precisa aprovar/reprovar. Ausente/false = comentário normal,
   * visível ao solicitante mas sem exigir decisão. */
  @IsOptional()
  @IsBoolean()
  asProposal?: boolean;
}
