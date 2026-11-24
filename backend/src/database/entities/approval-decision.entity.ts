import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApprovalStepEntity } from './approval-step.entity';
import { UserEntity } from './user.entity';

export type ApprovalDecisionValue = 'approved' | 'rejected';

@Entity('approval_decisions')
export class ApprovalDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'approval_step_id', type: 'uuid' })
  approvalStepId!: string;

  @OneToOne(() => ApprovalStepEntity, (step) => step.decision, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'approval_step_id' })
  approvalStep!: ApprovalStepEntity;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedByUser!: UserEntity | null;

  /** E-mail de quem decidiu pelo link (aprovador externo); nulo para decisões feitas logado no sistema. */
  @Column({ name: 'decided_by_email', type: 'varchar', length: 180, nullable: true })
  decidedByEmail!: string | null;

  /** Por onde a decisão foi tomada: dentro do sistema ou pelo link do e-mail. */
  @Column({ name: 'decided_via', type: 'varchar', length: 20, default: 'system' })
  decidedVia!: 'system' | 'email_link';

  /** IP de quem decidiu pelo link (auditoria). */
  @Column({ name: 'decided_ip', type: 'varchar', length: 45, nullable: true })
  decidedIp!: string | null;

  @Column({ type: 'varchar', length: 20 })
  decision!: ApprovalDecisionValue;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', default: () => 'now()' })
  decidedAt!: Date;
}
