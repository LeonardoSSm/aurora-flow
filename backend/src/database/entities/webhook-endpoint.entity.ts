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
import { UserEntity } from './user.entity';

@Entity('webhook_endpoints')
@Index('UQ_webhook_endpoints_token', ['token'], { unique: true })
@Index('IDX_webhook_endpoints_created_by', ['createdBy'])
export class WebhookEndpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 128 })
  token!: string;

  @Column({ name: 'signing_secret', type: 'varchar', length: 255, nullable: true })
  signingSecret!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'flow_trigger_enabled', type: 'boolean', default: true })
  flowTriggerEnabled!: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
