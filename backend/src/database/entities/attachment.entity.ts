import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KanbanPhaseEntity } from './kanban-phase.entity';
import { SolicitationEntity } from './solicitation.entity';
import { SubmissionEntity } from './submission.entity';
import { UserEntity } from './user.entity';

@Entity('attachments')
@Index('IDX_attachments_solicitation_id', ['solicitationId'])
@Index('IDX_attachments_submission_id', ['submissionId'])
@Index('IDX_attachments_phase_id', ['phaseId'])
export class AttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  /** O que o arquivo é, nas palavras de quem enviou (ex.: "Nota fiscal do frete"). */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes!: number;

  @Column({ name: 'storage_path', type: 'varchar', length: 1000 })
  storagePath!: string;

  @Column({ name: 'storage_type', type: 'varchar', length: 20, default: 'local' })
  storageType!: string;

  @Column({ name: 'solicitation_id', type: 'uuid', nullable: true })
  solicitationId!: string | null;

  @ManyToOne(() => SolicitationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity | null;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId!: string | null;

  @ManyToOne(() => SubmissionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submission_id' })
  submission!: SubmissionEntity | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser!: UserEntity | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  /** Fase de Kanban para a qual este anexo foi capturado (ex.: foto de validação de uma etapa que exige aprovação). */
  @Column({ name: 'phase_id', type: 'uuid', nullable: true })
  phaseId!: string | null;

  @ManyToOne(() => KanbanPhaseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'phase_id' })
  phase!: KanbanPhaseEntity | null;

  /** Veredito do agente de IA "validador-de-etiquetas" para esta foto, quando aplicável. */
  @Column({ name: 'validation_result', type: 'jsonb', nullable: true })
  validationResult!: Record<string, unknown> | null;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true })
  validatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
