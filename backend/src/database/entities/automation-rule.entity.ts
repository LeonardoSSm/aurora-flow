import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { FormSectionEntity } from './form-section.entity';
import { KanbanPhaseEntity } from './kanban-phase.entity';

@Entity('automation_rules')
@Index('IDX_automation_rules_form_id', ['formId'])
export class AutomationRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'on_submission' })
  trigger!: string;

  @Column({ name: 'target_section_id', type: 'uuid', nullable: true })
  targetSectionId!: string | null;

  @ManyToOne(() => FormSectionEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'target_section_id' })
  targetSection!: FormSectionEntity | null;

  @Column({ name: 'target_phase_id', type: 'uuid', nullable: true })
  targetPhaseId!: string | null;

  @ManyToOne(() => KanbanPhaseEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'target_phase_id' })
  targetPhase!: KanbanPhaseEntity | null;

  @Column({ type: 'jsonb', nullable: true })
  conditions!: Record<string, unknown> | null;

  @Column({ type: 'jsonb' })
  actions!: Record<string, unknown>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
