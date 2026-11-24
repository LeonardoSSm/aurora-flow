import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AutomationRuleEntity } from './automation-rule.entity';
import { SolicitationEntity } from './solicitation.entity';
import { SubmissionEntity } from './submission.entity';
import { SubmissionProgressEntity } from './submission-progress.entity';

export type AutomationExecutionStatus = 'pending' | 'running' | 'success' | 'failed';

@Entity('automation_executions')
@Index('IDX_automation_executions_rule_id', ['ruleId'])
export class AutomationExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId!: string;

  @ManyToOne(() => AutomationRuleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule!: AutomationRuleEntity;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId!: string | null;

  @ManyToOne(() => SubmissionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submission_id' })
  submission!: SubmissionEntity | null;

  @Column({ name: 'progress_id', type: 'uuid', nullable: true })
  progressId!: string | null;

  @ManyToOne(() => SubmissionProgressEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'progress_id' })
  progress!: SubmissionProgressEntity | null;

  @Column({ name: 'solicitation_id', type: 'uuid', nullable: true })
  solicitationId!: string | null;

  @ManyToOne(() => SolicitationEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: AutomationExecutionStatus;

  @Column({ name: 'started_at', type: 'timestamp with time zone' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'actions_executed', type: 'jsonb', default: [] })
  actionsExecuted!: Record<string, unknown>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
