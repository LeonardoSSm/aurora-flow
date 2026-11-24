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
import type { FlowEdge, FlowNode } from '../../modules/flows/types/flow.types';
import { FormEntity } from './form.entity';
import { UserEntity } from './user.entity';

@Entity('flows')
@Index('IDX_flows_form_id', ['formId'])
@Index('IDX_flows_next_run_at', ['nextRunAt'])
export class FlowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid', nullable: true })
  formId!: string | null;

  @ManyToOne(() => FormEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity | null;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt!: Date | null;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Column({ name: 'consecutive_failure_count', type: 'int', default: 0 })
  consecutiveFailureCount!: number;

  @Column({ type: 'jsonb', default: [] })
  nodes!: FlowNode[];

  @Column({ type: 'jsonb', default: [] })
  edges!: FlowEdge[];

  @Column({ type: 'jsonb', nullable: true })
  viewport!: { x: number; y: number; zoom: number } | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
