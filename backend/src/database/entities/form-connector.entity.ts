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
import { ConnectorType } from '../../modules/connectors/connector.interface';
import { FormEntity } from './form.entity';

@Entity('form_connectors')
@Index('IDX_form_connectors_form_id', ['formId'])
export class FormConnectorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ type: 'varchar', length: 30 })
  type!: ConnectorType;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  config!: Record<string, unknown>;

  @Column({ name: 'last_sync_at', type: 'timestamp with time zone', nullable: true })
  lastSyncAt!: Date | null;

  @Column({ name: 'last_sync_status', type: 'varchar', length: 255, nullable: true })
  lastSyncStatus!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
