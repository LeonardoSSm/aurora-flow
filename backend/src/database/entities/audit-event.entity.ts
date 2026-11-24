import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('audit_events')
@Index('IDX_audit_events_module_created_at', ['module', 'createdAt'])
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.auditEvents, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor!: UserEntity | null;

  @Column({ length: 80 })
  module!: string;

  @Column({ length: 120 })
  entity!: string;

  @Column({ name: 'entity_id', length: 60 })
  entityId!: string;

  @Column({ length: 80 })
  action!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
