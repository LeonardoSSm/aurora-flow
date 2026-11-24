import {
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
import { SubmissionStatus } from '../../common/enums/submission-status.enum';
import { FormEntity } from './form.entity';
import { FormVersionEntity } from './form-version.entity';
import { SubmissionItemEntity } from './submission-item.entity';

@Entity('submissions')
@Index('IDX_submissions_form_id_submitted_at', ['formId', 'submittedAt'])
@Index('UQ_submissions_form_id_idempotency_key', ['formId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
export class SubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, (form) => form.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ name: 'form_version_id', type: 'uuid' })
  formVersionId!: string;

  @ManyToOne(() => FormVersionEntity, (version) => version.submissions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'form_version_id' })
  formVersion!: FormVersionEntity;

  @Column({ type: 'varchar', length: 25, default: SubmissionStatus.SUBMITTED })
  status!: SubmissionStatus;

  @Column({ name: 'responder_name', type: 'varchar', length: 180, nullable: true })
  responderName!: string | null;

  @Column({ name: 'responder_email', type: 'varchar', length: 180, nullable: true })
  responderEmail!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 120, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'submitter_ip', type: 'varchar', length: 45, nullable: true, select: false })
  submitterIp!: string | null;

  @Column({
    name: 'submitter_user_agent',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  submitterUserAgent!: string | null;

  @OneToMany(() => SubmissionItemEntity, (item) => item.submission, {
    cascade: ['insert', 'update'],
  })
  items!: SubmissionItemEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
