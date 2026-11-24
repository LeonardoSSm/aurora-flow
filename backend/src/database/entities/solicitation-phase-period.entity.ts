import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KanbanPhaseEntity } from './kanban-phase.entity';
import { SolicitationEntity } from './solicitation.entity';

/**
 * Uma passagem do card por uma fase do Kanban: quando entrou, quando saiu e o prazo que valia.
 * É a linha do tempo do card (tempo em cada fase, dentro ou fora do prazo). A passagem aberta
 * (`leftAt` nulo) é a fase atual.
 */
@Entity('solicitation_phase_periods')
@Index('IDX_solicitation_phase_periods_solicitation', ['solicitationId', 'enteredAt'])
export class SolicitationPhasePeriodEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid' })
  solicitationId!: string;

  @ManyToOne(() => SolicitationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity;

  @Column({ name: 'phase_id', type: 'uuid', nullable: true })
  phaseId!: string | null;

  @ManyToOne(() => KanbanPhaseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'phase_id' })
  phase!: KanbanPhaseEntity | null;

  /** Nome da fase na época — a fase pode ser renomeada ou apagada depois. */
  @Column({ name: 'phase_label', type: 'varchar', length: 180 })
  phaseLabel!: string;

  @Column({ name: 'entered_at', type: 'timestamptz' })
  enteredAt!: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  /** Prazo que valia nesta passagem (já com prorrogação). Nulo = fase sem prazo. */
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'sla_business_hours', type: 'boolean', default: false })
  slaBusinessHours!: boolean;

  /** O prazo desta passagem foi prorrogado por alguém. */
  @Column({ type: 'boolean', default: false })
  extended!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
