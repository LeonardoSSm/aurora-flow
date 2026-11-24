import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FormSectionEntity } from './form-section.entity';
import { FormFieldEntity } from './form-field.entity';
import { FormFieldOptionEntity } from './form-field-option.entity';

@Entity('form_section_branches')
export class FormSectionBranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId!: string;

  @ManyToOne(() => FormSectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section!: FormSectionEntity;

  @Column({ name: 'field_id', type: 'uuid', nullable: true })
  fieldId!: string | null;

  @ManyToOne(() => FormFieldEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'field_id' })
  field!: FormFieldEntity | null;

  @Column({ name: 'option_id', type: 'uuid', nullable: true })
  optionId!: string | null;

  @ManyToOne(() => FormFieldOptionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'option_id' })
  option!: FormFieldOptionEntity | null;

  @Column({ name: 'checkbox_value', type: 'boolean', nullable: true })
  checkboxValue!: boolean | null;

  @Column({ name: 'target_section_id', type: 'uuid', nullable: true })
  targetSectionId!: string | null;

  @ManyToOne(() => FormSectionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_section_id' })
  targetSection!: FormSectionEntity | null;

  @Column({ name: 'target_is_submit', type: 'boolean', default: true })
  targetIsSubmit!: boolean;

  @Column({ type: 'int' })
  order!: number;
}
