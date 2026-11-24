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
import { FormStatus } from '../../common/enums/form-status.enum';
import { AreaEntity } from './area.entity';
import { UserEntity } from './user.entity';
import { FormVersionEntity } from './form-version.entity';
import { SubmissionEntity } from './submission.entity';

/** Configuração do Kanban do formulário (o que não é de uma fase só). */
export type FormKanbanSettings = {
  /**
   * Código do campo (do formulário ou de uma fase) cujo valor aparece em R$ no card e é somado no
   * total de cada coluna. Null = o card não mostra valor.
   */
  cardValueField: string | null;
};

/**
 * Como o processo aparece nos cards (modo simplificado): cor em hex (#RRGGBB) e o nome de um
 * ícone da lista do front. Null = cor e ícone padrão.
 */
export type FormAppearance = {
  color: string | null;
  icon: string | null;
};

@Entity('forms')
@Index('IDX_forms_created_by_status', ['createdBy', 'status'])
export class FormEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 180 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 25, default: FormStatus.DRAFT })
  status!: FormStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  area!: string | null;

  @Column({ name: 'area_id', type: 'uuid', nullable: true })
  areaId!: string | null;

  @ManyToOne(() => AreaEntity, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'area_id' })
  areaRef!: AreaEntity | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, (user) => user.forms, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity;

  @Column({ name: 'google_sheets_enabled', default: false })
  googleSheetsEnabled!: boolean;

  @Column({ name: 'google_sheets_auto_create', default: false })
  googleSheetsAutoCreate!: boolean;

  @Column({ name: 'google_spreadsheet_id', type: 'varchar', length: 255, nullable: true })
  googleSpreadsheetId!: string | null;

  @Column({ name: 'google_spreadsheet_url', type: 'text', nullable: true })
  googleSpreadsheetUrl!: string | null;

  @Column({ name: 'google_sheet_title', type: 'varchar', length: 180, nullable: true })
  googleSheetTitle!: string | null;

  @Column({ name: 'google_linked_user_id', type: 'uuid', nullable: true })
  googleLinkedUserId!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.googleLinkedForms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'google_linked_user_id' })
  googleLinkedUser!: UserEntity | null;

  @Column({ name: 'google_last_synced_at', type: 'timestamp with time zone', nullable: true })
  googleLastSyncedAt!: Date | null;

  @Column({ name: 'google_last_error', type: 'text', nullable: true })
  googleLastError!: string | null;

  @Column({ name: 'kanban_settings', type: 'jsonb', nullable: true })
  kanbanSettings!: FormKanbanSettings | null;

  /** Cor e ícone do card do processo. Muda sem criar versão nova do formulário. */
  @Column({ name: 'appearance', type: 'jsonb', nullable: true })
  appearance!: FormAppearance | null;

  @OneToMany(() => FormVersionEntity, (version) => version.form, { cascade: false })
  versions!: FormVersionEntity[];

  @OneToMany(() => SubmissionEntity, (submission) => submission.form)
  submissions!: SubmissionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
