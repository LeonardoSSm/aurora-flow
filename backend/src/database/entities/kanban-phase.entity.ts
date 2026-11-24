import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { KanbanPhaseFieldEntity } from './kanban-phase-field.entity';
import { RoleEntity } from './role.entity';

/** Perfis e usuários; basta casar um dos dois. */
export type KanbanPhasePeople = {
  roleCodes: string[];
  userIds: string[];
  /**
   * Só em "quem aprova" com a regra 'sequential': a ordem das etapas, em chaves `role:<código>` e
   * `user:<id>`. Ausente = usuários, depois perfis.
   */
  order?: string[];
};

/**
 * Ramificação de uma seção do formulário da fase: se o campo (lista ou caixa de seleção, da própria
 * seção) tiver a opção/o valor indicado, o caminho segue para `target`. `target` nulo = fim.
 */
export type KanbanPhaseSectionBranch = {
  fieldCode: string;
  optionValue: string | null;
  checkboxValue: boolean | null;
  target: string | null;
};

/**
 * Para onde uma seção do formulário da fase leva. `section` = código do campo "Título" que abre a
 * seção (ou `__inicio__`, a seção sem título antes do primeiro). `next` ausente = a seção seguinte
 * na ordem; nulo = fim; texto = outra seção.
 */
export type KanbanPhaseSectionRoute = {
  section: string;
  next?: string | null;
  branches: KanbanPhaseSectionBranch[];
};

/** Regra da aprovação de fase: basta um, todos, ou todos um depois do outro. */
export type KanbanPhaseApprovalMode = 'any' | 'all' | 'sequential';

/**
 * Quando a fase pede a aprovação sozinha: 'manual' = só pelo botão do card; 'on_enter' = assim que
 * o card entra na fase; 'on_complete' = quando o formulário da fase fica completo (na 1ª fase, o de
 * abertura com os anexos obrigatórios chegados; nas outras, quando salvam os campos da fase).
 */
export type KanbanPhaseApprovalRequest = 'manual' | 'on_enter' | 'on_complete';

/** Depois de aprovada: 'stay' = o card espera alguém mover; 'next' = vai sozinho para a próxima fase. */
export type KanbanPhaseApprovalApproved = 'stay' | 'next';

/**
 * Depois de reprovada: 'stay' = o card fica (só pode voltar, à mão); 'previous' = volta sozinho
 * para a fase anterior; 'close' = a solicitação é encerrada como reprovada.
 */
export type KanbanPhaseApprovalRejected = 'stay' | 'previous' | 'close';

export type KanbanPhaseVisibility = {
  roleCodes: string[];
  areaIds: string[];
  userIds: string[];
};

/** Uma regra do filtro de cards: quem (perfis/usuários) vê os cards com um destes valores no campo. */
export type KanbanPhaseCardVisibilityRule = {
  /** Campo do formulário (ou de uma fase) cuja resposta decide. */
  fieldCode: string;
  /** Valores aceitos (opção da lista, "true"/"false" na caixa, texto digitado); basta um. */
  values: string[];
  roleCodes: string[];
  userIds: string[];
};

/** Filtro de cards da fase pela resposta (ver kanban-phases/phase-card-visibility.ts). */
export type KanbanPhaseCardVisibility = {
  rules: KanbanPhaseCardVisibilityRule[];
  /** Quem não está em nenhuma regra: true = vê todos os cards da fase; false = nenhum. */
  othersSeeAll: boolean;
};

/**
 * Indicadores do sistema que o card do Kanban pode mostrar (ver kanban-phases/card-display.ts).
 * O título sempre aparece; o aviso "Sua aprovação pendente" também (é tarefa, não indicador).
 */
export type KanbanCardIndicator =
  | 'process'
  | 'priority'
  | 'value'
  | 'sla'
  | 'phase_sla'
  | 'assignee'
  | 'updated_at'
  | 'requester'
  | 'created_at'
  | 'time_in_phase'
  | 'number';

/** Campo do processo mostrado no card: código e, se quiser, um rótulo mais curto. */
export type KanbanCardDisplayField = { fieldCode: string; label: string | null };

/** O que o card mostra numa fase: indicadores ligados e campos, na ordem escolhida. */
export type KanbanCardDisplay = {
  indicators: KanbanCardIndicator[];
  fields: KanbanCardDisplayField[];
};

@Entity('kanban_phases')
@Index('IDX_kanban_phases_form_id', ['formId'])
export class KanbanPhaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ type: 'varchar', length: 120 })
  key!: string;

  @Column({ type: 'varchar', length: 180 })
  label!: string;

  @Column({ type: 'varchar', length: 30, default: 'blue' })
  color!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int' })
  order!: number;

  @Column({ name: 'is_terminal', type: 'boolean', default: false })
  isTerminal!: boolean;

  /**
   * LEGADO — primeiro perfil de `actors`, mantido para o app móvel já instalado. A regra usa
   * `actors` (ver kanban-phases/phase-people.ts).
   */
  @Column({ name: 'actor_role_code', type: 'varchar', length: 40, nullable: true })
  actorRoleCode!: string | null;

  @ManyToOne(() => RoleEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_role_code' })
  actorRole!: RoleEntity | null;

  /**
   * Quem atua na fase (preenche campos, pede aprovação): perfis e/ou usuários. Null = qualquer um
   * com acesso à solicitação.
   */
  @Column({ type: 'jsonb', nullable: true })
  actors!: KanbanPhasePeople | null;

  /** Se true, sair desta fase exige uma Approval{phaseId: this.id, status: 'approved'}. */
  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval!: boolean;

  /** LEGADO — primeiro perfil de `approvers`, mantido para o app móvel já instalado. */
  @Column({ name: 'approver_role_code', type: 'varchar', length: 40, nullable: true })
  approverRoleCode!: string | null;

  @ManyToOne(() => RoleEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_role_code' })
  approverRole!: RoleEntity | null;

  /** Quem aprova a saída da fase (quando requiresApproval): perfis e/ou usuários. */
  @Column({ type: 'jsonb', nullable: true })
  approvers!: KanbanPhasePeople | null;

  /**
   * 'any' = basta um dos escolhidos aprovar; 'all' = todos aprovam (em qualquer ordem);
   * 'sequential' = todos, um depois do outro. Um perfil conta como um (basta uma pessoa dele).
   */
  @Column({ name: 'approval_mode', type: 'varchar', length: 20, default: 'any' })
  approvalMode!: KanbanPhaseApprovalMode;

  /** Quando pedir a aprovação (ver kanban-phases/phase-approval-automation.ts). */
  @Column({ name: 'approval_request', type: 'varchar', length: 20, default: 'manual' })
  approvalRequest!: KanbanPhaseApprovalRequest;

  /** O que acontece com o card quando a aprovação sai aprovada. */
  @Column({ name: 'approval_on_approved', type: 'varchar', length: 20, default: 'stay' })
  approvalOnApproved!: KanbanPhaseApprovalApproved;

  /** O que acontece com o card quando a aprovação sai reprovada. */
  @Column({ name: 'approval_on_rejected', type: 'varchar', length: 20, default: 'stay' })
  approvalOnRejected!: KanbanPhaseApprovalRejected;

  /**
   * O card só avança (vai para uma fase de ordem maior) com os campos obrigatórios desta fase
   * preenchidos. Vale para pessoas e para o processo (fluxo, aprovação que avança sozinha). Voltar
   * para uma fase anterior é sempre livre. Ver kanban-phases/phase-required-fields.ts.
   */
  @Column({ name: 'require_fields_to_exit', type: 'boolean', default: false })
  requireFieldsToExit!: boolean;

  /**
   * O card só avança (vai para uma fase de ordem maior) com alguém atribuído (responsável). Mesma
   * checagem de saída dos campos obrigatórios: vale para pessoas e para o processo; voltar é livre.
   */
  @Column({ name: 'require_assignee_to_exit', type: 'boolean', default: false })
  requireAssigneeToExit!: boolean;

  /**
   * Ponto sem volta: depois que o card chega a esta fase (ou passa dela), as pessoas não o devolvem
   * para uma fase anterior a ela. Quem configura as fases do processo (`kanban_phases.manage`)
   * ainda devolve, para corrigir um avanço por engano, e o processo (fluxo "Mover para fase",
   * reprovação que devolve sozinha) também passa. Ver kanban-phases/phase-move-back.ts.
   */
  @Column({ name: 'block_move_back', type: 'boolean', default: false })
  blockMoveBack!: boolean;

  /**
   * Quem vê esta fase (coluna e cards) no Kanban: basta casar UM dos critérios — perfil, área ou
   * usuário. Null (ou listas vazias) = todos com acesso ao formulário. Quem gerencia as fases
   * (`kanban_phases.manage`) sempre vê todas, para poder configurá-las. Não restringe para onde um
   * card pode ser movido: a Logística entrega o card ao Financeiro mesmo sem ver a fase dele.
   */
  @Column({ name: 'visible_to', type: 'jsonb', nullable: true })
  visibleTo!: KanbanPhaseVisibility | null;

  /**
   * Filtro de cards DENTRO da fase, pela resposta: quem está numa regra (perfil ou usuário) só vê
   * os cards cuja resposta casa com uma das suas regras. Null = todos que veem a fase veem todos os
   * cards. Quem gerencia as fases vê tudo. Gravado à parte do "Salvar fases" (botão de
   * configurações da coluna no Kanban), então o construtor não o apaga.
   */
  @Column({ name: 'card_visibility', type: 'jsonb', nullable: true })
  cardVisibility!: KanbanPhaseCardVisibility | null;

  /**
   * O que o card mostra nesta fase (padrão para todos). Null = padrão do sistema. Cada pessoa pode
   * sobrescrever para si (user_kanban_card_displays). Gravado à parte do "Salvar fases", então o
   * construtor não o apaga.
   */
  @Column({ name: 'card_display', type: 'jsonb', nullable: true })
  cardDisplay!: KanbanCardDisplay | null;

  /**
   * Prazo do card nesta fase, em horas, contado da entrada na fase (ver kanban-phases/phase-sla.ts).
   * Nulo = fase sem prazo.
   */
  @Column({ name: 'sla_hours', type: 'int', nullable: true })
  slaHours!: number | null;

  /** Conta só horas úteis (seg–sex, 08h–18h, Brasília) em vez de horas corridas. */
  @Column({ name: 'sla_business_hours', type: 'boolean', default: false })
  slaBusinessHours!: boolean;

  /** Percentual do prazo a partir do qual o card fica "em alerta". Nulo = 80%. */
  @Column({ name: 'sla_warning_percent', type: 'int', nullable: true })
  slaWarningPercent!: number | null;

  /**
   * Caminho entre as seções do formulário da fase (ver kanban-phases/phase-section-flow.ts). Cada
   * campo "Título" abre uma seção. Nulo = sem ramificação: todas as seções aparecem, em ordem.
   */
  @Column({ name: 'section_flow', type: 'jsonb', nullable: true })
  sectionFlow!: KanbanPhaseSectionRoute[] | null;

  @OneToMany(() => KanbanPhaseFieldEntity, (field) => field.phase)
  fields!: KanbanPhaseFieldEntity[];
}
