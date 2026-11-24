import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import type { VisibilityRule } from '../../modules/forms/form-definition.utils';
import { FormVersionEntity } from './form-version.entity';
import { FormSectionEntity } from './form-section.entity';
import { FormFieldOptionEntity } from './form-field-option.entity';

@Entity('form_fields')
@Index(['formVersionId', 'code'], { unique: true })
export class FormFieldEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_version_id', type: 'uuid' })
  formVersionId!: string;

  @ManyToOne(() => FormVersionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_version_id' })
  formVersion!: FormVersionEntity;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId!: string;

  @ManyToOne(() => FormSectionEntity, (section) => section.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section!: FormSectionEntity;

  @Column({ length: 120 })
  code!: string;

  @Column({ length: 180 })
  label!: string;

  @Column({ name: 'field_type', type: 'varchar', length: 30 })
  fieldType!: FormFieldType;

  @Column({ type: 'int' })
  order!: number;

  @Column({ default: false })
  required!: boolean;

  @Column({ name: 'settings_json', type: 'jsonb', default: () => "'{}'" })
  settingsJson!: Record<string, unknown>;

  @Column({ name: 'conditions_json', type: 'jsonb', default: () => "'{}'" })
  conditionsJson!: Record<string, unknown>;

  @Column({ name: 'visibility_rules', type: 'jsonb', nullable: true })
  visibilityRules!: VisibilityRule[] | null;

  @Column({ name: 'is_sensitive', type: 'boolean', default: false })
  isSensitive!: boolean;

  @OneToMany(() => FormFieldOptionEntity, (option) => option.field, {
    cascade: ['insert', 'update'],
  })
  options!: FormFieldOptionEntity[];
}
