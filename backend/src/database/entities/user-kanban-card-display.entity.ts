import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { KanbanPhaseEntity, type KanbanCardDisplay } from './kanban-phase.entity';
import { UserEntity } from './user.entity';

/**
 * O que UMA pessoa quer ver no card de UMA fase ("Personalizar card" no Kanban). Sobrescreve o
 * padrão da fase (kanban_phases.card_display) só para ela; apagar a linha volta ao padrão. Some
 * junto com a fase ou com o usuário.
 */
@Entity('user_kanban_card_displays')
@Unique('UQ_user_kanban_card_displays_user_phase', ['userId', 'phaseId'])
export class UserKanbanCardDisplayEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_user_kanban_card_displays' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_user_kanban_card_displays_user_id' })
  user!: UserEntity;

  @Column({ name: 'phase_id', type: 'uuid' })
  phaseId!: string;

  @ManyToOne(() => KanbanPhaseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'phase_id', foreignKeyConstraintName: 'FK_user_kanban_card_displays_phase_id' })
  phase!: KanbanPhaseEntity;

  @Column({ type: 'jsonb' })
  config!: KanbanCardDisplay;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;
}
