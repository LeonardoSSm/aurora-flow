import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { GoogleSheetsSyncJobStatus } from '../../common/enums/google-sheets-sync-job-status.enum';
import { FormEntity } from './form.entity';
import { SubmissionEntity } from './submission.entity';

@Entity('google_sheets_sync_jobs')
@Unique(['submissionId'])
@Index(['status', 'nextAttemptAt'])
@Index(['formId', 'status'])
export class GoogleSheetsSyncJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId!: string;

  @ManyToOne(() => SubmissionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission!: SubmissionEntity;

  @Column({
    type: 'varchar',
    length: 20,
    default: GoogleSheetsSyncJobStatus.QUEUED,
  })
  status!: GoogleSheetsSyncJobStatus;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', default: 8 })
  maxAttempts!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamp with time zone', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
