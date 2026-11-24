import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { UserEntity } from './user.entity';

/**
 * Modelo de relatório salvo na tela Registros de um processo: colunas, ordem, agrupamento, layout.
 * É do processo (todos que exportam nele reaproveitam), não de uma pessoa. Some junto com o processo.
 * O formato de `config` é o `RecordReportConfig` de modules/records/record-report-config.ts.
 */
@Entity('record_report_templates')
@Unique('UQ_record_report_templates_form_name', ['formId', 'name'])
export class RecordReportTemplateEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_record_report_templates' })
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id', foreignKeyConstraintName: 'FK_record_report_templates_form_id' })
  form!: FormEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'jsonb' })
  config!: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'FK_record_report_templates_created_by' })
  createdByUser!: UserEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;
}
