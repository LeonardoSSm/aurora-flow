import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FormFieldEntity } from './form-field.entity';

@Entity('form_field_options')
export class FormFieldOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'field_id', type: 'uuid' })
  fieldId!: string;

  @ManyToOne(() => FormFieldEntity, (field) => field.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field!: FormFieldEntity;

  @Column({ name: 'internal_value', length: 120 })
  internalValue!: string;

  @Column({ name: 'display_label', length: 180 })
  displayLabel!: string;

  @Column({ type: 'int' })
  order!: number;
}
