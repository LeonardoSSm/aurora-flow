import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationEntity } from './solicitation.entity';
import { UserEntity } from './user.entity';

@Entity('solicitation_history')
@Index('IDX_solicitation_history_solicitation_created_at', ['solicitationId', 'createdAt'])
export class SolicitationHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid' })
  solicitationId!: string;

  @ManyToOne(() => SolicitationEntity, (solicitation) => solicitation.history, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity;

  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType!: SolicitationHistoryEventType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor!: UserEntity | null;

  @Column({ name: 'from_value', type: 'varchar', length: 120, nullable: true })
  fromValue!: string | null;

  @Column({ name: 'to_value', type: 'varchar', length: 120, nullable: true })
  toValue!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
