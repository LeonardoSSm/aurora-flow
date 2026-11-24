import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SubmissionEntity } from './submission.entity';
import { FormFieldEntity } from './form-field.entity';

@Entity('submission_items')
export class SubmissionItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId!: string;

  @ManyToOne(() => SubmissionEntity, (submission) => submission.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission!: SubmissionEntity;

  @Column({ name: 'field_id', type: 'uuid' })
  fieldId!: string;

  @ManyToOne(() => FormFieldEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'field_id' })
  field!: FormFieldEntity;

  @Column({ name: 'field_code', length: 120 })
  fieldCode!: string;

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText!: string | null;

  @Column({ name: 'value_number', type: 'double precision', nullable: true })
  valueNumber!: number | null;

  @Column({ name: 'value_boolean', type: 'boolean', nullable: true })
  valueBoolean!: boolean | null;

  @Column({ name: 'value_json', type: 'jsonb', nullable: true })
  valueJson!: unknown | null;
}
