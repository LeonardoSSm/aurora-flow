import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { KanbanPhaseEntity } from './kanban-phase.entity';

export type KanbanPhaseFieldOption = {
  value: string;
  label: string;
};

@Entity('kanban_phase_fields')
@Index('IDX_kanban_phase_fields_phase_id', ['phaseId'])
export class KanbanPhaseFieldEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'phase_id', type: 'uuid' })
  phaseId!: string;

  @ManyToOne(() => KanbanPhaseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'phase_id' })
  phase!: KanbanPhaseEntity;

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
  optionsJson!: KanbanPhaseFieldOption[] | null;
}
