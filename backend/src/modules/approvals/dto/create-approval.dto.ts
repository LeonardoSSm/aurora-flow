import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateApprovalDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  assignedUserIds?: string[];

  /** Alternativa a assignedUserIds: roteia etapas para "quem tiver este perfil" em vez de usuários nomeados. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  assignedRoleCodes?: string[];

  /**
   * Aprovadores por e-mail. Quem tem usuário ativo com esse e-mail decide dentro do sistema; os demais
   * (gestores sem usuário, por exemplo) recebem um link pessoal por e-mail e decidem por ele.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  @MaxLength(180, { each: true })
  assignedEmails?: string[];

  @IsOptional()
  @IsIn(['parallel', 'sequential'])
  mode?: 'parallel' | 'sequential';

  /**
   * Em paralelo: true = todos os aprovadores precisam aprovar; ausente/false = basta um. Um perfil
   * conta como um aprovador (basta uma pessoa do perfil). Em ordem (sequential), todos aprovam.
   */
  @IsOptional()
  @IsBoolean()
  requireAll?: boolean;

  /**
   * Ordem das etapas, em chaves `user:<id>`, `role:<código>` ou `email:<e-mail>`. Quem não estiver
   * na lista vai para o fim. Sem ela: usuários, depois perfis, depois e-mails.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  assigneeOrder?: string[];

  /** Quando setado, a aprovação é sobre esta fase da solicitação — não altera solicitation.status. */
  @IsOptional()
  @IsUUID()
  phaseId?: string;
}
