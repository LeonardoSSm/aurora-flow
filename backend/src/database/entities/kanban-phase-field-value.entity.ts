import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { KanbanPhaseFieldEntity } from './kanban-phase-field.entity';
import { SolicitationEntity } from './solicitation.entity';

@Entity('kanban_phase_field_values')
@Index('IDX_kpfv_solicitation_id', ['solicitationId'])
@Index('UQ_kpfv_solicitation_field', ['solicitationId', 'phaseFieldId'], { unique: true })
export class KanbanPhaseFieldValueEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid' })
  solicitationId!: string;

  @ManyToOne(() => SolicitationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity;

  @Column({ name: 'phase_field_id', type: 'uuid', nullable: true })
  phaseFieldId!: string | null;

  @ManyToOne(() => KanbanPhaseFieldEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'phase_field_id' })
  phaseField!: KanbanPhaseFieldEntity | null;

  @Column({ name: 'field_code', type: 'varchar', length: 120 })
  fieldCode!: string;

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText!: string | null;

  @Column({ name: 'value_number', type: 'double precision', nullable: true })
  valueNumber!: number | null;

  @Column({ name: 'value_boolean', type: 'boolean', nullable: true })
  valueBoolean!: boolean | null;

  @Column({ name: 'value_json', type: 'jsonb', nullable: true })
  valueJson!: unknown | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
