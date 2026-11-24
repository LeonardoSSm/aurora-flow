import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepEntity } from './approval-step.entity';
import { KanbanPhaseEntity } from './kanban-phase.entity';
import { SolicitationEntity } from './solicitation.entity';
import { UserEntity } from './user.entity';

@Entity('approvals')
export class ApprovalEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid' })
  solicitationId!: string;

  @ManyToOne(() => SolicitationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity;

  @Column({ type: 'varchar', length: 30, default: ApprovalStatus.PENDING })
  status!: ApprovalStatus;

  /** Quando setado, esta aprovação é sobre uma fase específica da solicitação (não a solicitação inteira) — não deve alterar solicitation.status. */
  @Column({ name: 'phase_id', type: 'uuid', nullable: true })
  phaseId!: string | null;

  @ManyToOne(() => KanbanPhaseEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'phase_id' })
  phase!: KanbanPhaseEntity | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'mode', type: 'varchar', length: 20, default: 'parallel' })
  mode!: 'parallel' | 'sequential';

  @Column({ name: 'required_decisions', type: 'int', default: 1 })
  requiredDecisions!: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;

  @OneToMany(() => ApprovalStepEntity, (step) => step.approval)
  steps!: ApprovalStepEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
