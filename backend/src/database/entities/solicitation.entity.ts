import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { FormEntity } from './form.entity';
import { KanbanPhaseEntity } from './kanban-phase.entity';
import { SolicitationHistoryEntity } from './solicitation-history.entity';
import { SubmissionEntity } from './submission.entity';
import { UserEntity } from './user.entity';

@Entity('solicitations')
@Index('IDX_solicitations_status_priority', ['status', 'priority'])
@Index('IDX_solicitations_form_id', ['formId'])
@Index('IDX_solicitations_assignee_id', ['assigneeId'])
@Index('IDX_solicitations_created_at', ['createdAt'])
@Index('IDX_solicitations_source_solicitation_id', ['sourceSolicitationId'])
@Index('UQ_solicitations_form_submission', ['submissionId'], {
  unique: true,
  where: `"origin_type" = 'form_submission' AND "submission_id" IS NOT NULL`,
})
@Check(
  'CHK_solicitations_form_submission_origin',
  `"origin_type" <> 'form_submission' OR ("form_id" IS NOT NULL AND "submission_id" IS NOT NULL)`,
)
export class SolicitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 30, default: SolicitationStatus.OPEN })
  status!: SolicitationStatus;

  @Column({ type: 'varchar', length: 20, default: SolicitationPriority.MEDIUM })
  priority!: SolicitationPriority;

  @Column({
    name: 'origin_type',
    type: 'varchar',
    length: 40,
    default: SolicitationOriginType.MANUAL,
  })
  originType!: SolicitationOriginType;

  @Column({ name: 'form_id', type: 'uuid', nullable: true })
  formId!: string | null;

  @ManyToOne(() => FormEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity | null;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId!: string | null;

  @ManyToOne(() => SubmissionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submission_id' })
  submission!: SubmissionEntity | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: UserEntity | null;

  @Column({ name: 'requester_phone', type: 'varchar', length: 30, nullable: true })
  requesterPhone!: string | null;

  @Column({ name: 'responsible_phone', type: 'varchar', length: 30, nullable: true })
  responsiblePhone!: string | null;

  @Column({ name: 'sla_started_at', type: 'timestamptz', nullable: true })
  slaStartedAt!: Date | null;

  @Column({ name: 'sla_paused_at', type: 'timestamptz', nullable: true })
  slaPausedAt!: Date | null;

  @Column({ name: 'sla_due_at', type: 'timestamptz', nullable: true })
  slaDueAt!: Date | null;

  @Column({ name: 'sla_breached_at', type: 'timestamptz', nullable: true })
  slaBreachedAt!: Date | null;

  @Column({
    name: 'sla_status',
    type: 'enum',
    enum: SolicitationSlaStatus,
    nullable: true,
  })
  slaStatus!: SolicitationSlaStatus | null;

  @Column({ name: 'sla_warning_threshold_percent', type: 'int', nullable: true, default: 80 })
  slaWarningThresholdPercent!: number | null;

  @Column({ name: 'sla_duration_hours', type: 'int', nullable: true })
  slaDurationHours!: number | null;

  @Column({ name: 'area_id', type: 'uuid', nullable: true })
  areaId!: string | null;

  @Column({ name: 'current_phase_id', type: 'uuid', nullable: true })
  currentPhaseId!: string | null;

  /**
   * Quando o card entrou na fase atual: o banco marca na criação (DEFAULT now()) e cada mudança de
   * fase atualiza. Nulo só em linha antiga sem migração — aí vale a criação.
   */
  @Column({ name: 'phase_entered_at', type: 'timestamptz', nullable: true, default: () => 'now()' })
  phaseEnteredAt!: Date | null;

  /**
   * Vencimento do prazo da fase atual (já com prorrogação). Nulo com a fase tendo prazo = calcula
   * da entrada na fase.
   */
  @Column({ name: 'phase_due_at', type: 'timestamptz', nullable: true })
  phaseDueAt!: Date | null;

  /** Último estado do prazo da fase já avisado ('warning' | 'breached'); zera ao mudar de fase. */
  @Column({ name: 'phase_sla_status', type: 'varchar', length: 20, nullable: true })
  phaseSlaStatus!: string | null;

  @ManyToOne(() => KanbanPhaseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_phase_id' })
  currentPhase!: KanbanPhaseEntity | null;

  @Column({ name: 'tracking_token', type: 'uuid', unique: true, nullable: true })
  trackingToken!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'external_refs', type: 'jsonb', nullable: true, default: null })
  externalRefs!: Record<string, unknown> | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255, nullable: true })
  idempotencyKey!: string | null;

  /** Card de outro processo que encaminhou este (ação "Encaminhar para outro processo"). */
  @Column({ name: 'source_solicitation_id', type: 'uuid', nullable: true })
  sourceSolicitationId!: string | null;

  @ManyToOne(() => SolicitationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_solicitation_id' })
  sourceSolicitation!: SolicitationEntity | null;

  @OneToMany(() => SolicitationHistoryEntity, (history) => history.solicitation)
  history!: SolicitationHistoryEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
