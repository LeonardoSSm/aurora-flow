import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormFieldType } from '../../../common/enums/form-field-type.enum';

// "Lista do ERP" e "Tabela dinâmica do ERP" ainda não existem em campo de fase: o salvamento de
// fase não confere nada no ERP (só o formulário faz isso, no envio). O "Pedido de itens" existe:
// a lista é do próprio sistema e o retrato é montado ao salvar os campos do card.
const PHASE_FIELD_TYPES = Object.values(FormFieldType).filter(
  (type) =>
    type !== FormFieldType.ERP_LOOKUP &&
    type !== FormFieldType.ERP_TABLE &&
    // O arquivo é enviado pelo construtor do formulário de abertura; a fase não tem esse envio.
    type !== FormFieldType.FILE_DOWNLOAD,
);

export class KanbanPhaseFieldOptionDto {
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;
}

export class KanbanPhaseFieldInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsIn(PHASE_FIELD_TYPES)
  fieldType!: FormFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  settingsJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KanbanPhaseFieldOptionDto)
  options?: KanbanPhaseFieldOptionDto[];
}

/** Perfis e usuários (quem atua / quem aprova). Listas vazias = ninguém escolhido. */
export class KanbanPhasePeopleDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roleCodes!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  userIds!: string[];

  /** Ordem (aprovação em sequência): chaves `role:<código>` / `user:<id>`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  order?: string[];
}

/** Quem vê a fase no Kanban (ver KanbanPhaseEntity.visibleTo). Listas vazias = todos. */
export class KanbanPhaseVisibilityDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roleCodes!: string[];

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  areaIds!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  userIds!: string[];
}

/** Ramificação de uma seção do formulário da fase (ver phase-section-flow.ts). */
export class KanbanPhaseSectionBranchDto {
  @IsString()
  @IsNotEmpty()
  fieldCode!: string;

  @IsOptional()
  @IsString()
  optionValue?: string | null;

  @IsOptional()
  @IsBoolean()
  checkboxValue?: boolean | null;

  /** Seção de destino (código do "Título"); nulo = fim. */
  @IsOptional()
  @IsString()
  target?: string | null;
}

/** Para onde uma seção do formulário da fase leva. */
export class KanbanPhaseSectionRouteDto {
  /** Código do campo "Título" que abre a seção, ou `__inicio__`. */
  @IsString()
  @IsNotEmpty()
  section!: string;

  /** Ausente = a seção seguinte; nulo = fim; texto = outra seção. */
  @IsOptional()
  @IsString()
  next?: string | null;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => KanbanPhaseSectionBranchDto)
  branches!: KanbanPhaseSectionBranchDto[];
}

export class KanbanPhaseInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean;

  @IsOptional()
  @IsString()
  actorRoleCode?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsString()
  approverRoleCode?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => KanbanPhaseVisibilityDto)
  visibleTo?: KanbanPhaseVisibilityDto | null;

  /** Novo formato de quem atua; sem ele, vale o legado `actorRoleCode`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => KanbanPhasePeopleDto)
  actors?: KanbanPhasePeopleDto | null;

  /** Regra da aprovação: basta um ('any', padrão), todos ('all') ou um depois do outro ('sequential'). */
  @IsOptional()
  @IsIn(['any', 'all', 'sequential'])
  approvalMode?: 'any' | 'all' | 'sequential';

  /** Quando pedir a aprovação: só pelo botão ('manual', padrão), ao entrar ou com o formulário completo. */
  @IsOptional()
  @IsIn(['manual', 'on_enter', 'on_complete'])
  approvalRequest?: 'manual' | 'on_enter' | 'on_complete';

  /** Aprovada: o card espera ('stay', padrão) ou vai sozinho para a próxima fase ('next'). */
  @IsOptional()
  @IsIn(['stay', 'next'])
  approvalOnApproved?: 'stay' | 'next';

  /** Reprovada: o card fica ('stay', padrão), volta para a fase anterior ou a solicitação é encerrada. */
  @IsOptional()
  @IsIn(['stay', 'previous', 'close'])
  approvalOnRejected?: 'stay' | 'previous' | 'close';

  /** O card só avança com os campos obrigatórios da fase preenchidos (ausente = mantém o que estava). */
  @IsOptional()
  @IsBoolean()
  requireFieldsToExit?: boolean;

  /** O card só avança com alguém atribuído (ausente = mantém o que estava). */
  @IsOptional()
  @IsBoolean()
  requireAssigneeToExit?: boolean;

  /** Ponto sem volta: chegando aqui, o card não volta para antes desta fase (ausente = mantém o que estava). */
  @IsOptional()
  @IsBoolean()
  blockMoveBack?: boolean;

  /** Prazo do card nesta fase, em horas (até 1 ano). Nulo/ausente = sem prazo. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  slaHours?: number | null;

  /** Conta só horas úteis (seg–sex, 08h–18h). */
  @IsOptional()
  @IsBoolean()
  slaBusinessHours?: boolean;

  /** Percentual do prazo a partir do qual o card fica em alerta (padrão 80). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  slaWarningPercent?: number | null;

  /** Novo formato de quem aprova; sem ele, vale o legado `approverRoleCode`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => KanbanPhasePeopleDto)
  approvers?: KanbanPhasePeopleDto | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KanbanPhaseFieldInputDto)
  fields!: KanbanPhaseFieldInputDto[];

  /** Caminho entre as seções do formulário da fase; ausente/nulo = todas em ordem. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => KanbanPhaseSectionRouteDto)
  sectionFlow?: KanbanPhaseSectionRouteDto[] | null;
}

export class SaveKanbanPhasesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'O Kanban precisa de pelo menos uma fase.' })
  @ValidateNested({ each: true })
  @Type(() => KanbanPhaseInputDto)
  phases!: KanbanPhaseInputDto[];
}
