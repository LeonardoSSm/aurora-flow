import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormEntity } from './form.entity';

export type FormStandardQuestionOption = {
  value: string;
  label: string;
};

@Entity('form_standard_questions')
@Index('IDX_form_standard_questions_form_id', ['formId'])
export class FormStandardQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ type: 'varchar', length: 120 })
  code!: string;

  @Column({ type: 'varchar', length: 180 })
  label!: string;

  @Column({ name: 'field_type', type: 'varchar', length: 30 })
  fieldType!: FormFieldType;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @Column({ type: 'int' })
  order!: number;

  @Column({ name: 'settings_json', type: 'jsonb', nullable: true })
  settingsJson!: Record<string, unknown> | null;

  @Column({ name: 'options_json', type: 'jsonb', nullable: true })
  optionsJson!: FormStandardQuestionOption[] | null;
}
