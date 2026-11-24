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
import type { ErpAuthType } from '../../modules/integrations/erp/erp-auth.types';
import type { ErpHealthResult } from '../../modules/integrations/erp/erp-health.types';
import { UserEntity } from './user.entity';

@Entity('erp_connectors')
@Index('IDX_erp_connectors_created_by', ['createdBy'])
@Index('UQ_erp_connectors_name', ['name'], { unique: true })
export class ErpConnectorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 150 })
  name!: string;

  @Column({ name: 'base_url', length: 500 })
  baseUrl!: string;

  /** Stored encrypted via TokenCipherService — never exposed in API responses */
  @Column({ name: 'bearer_token', length: 1000 })
  bearerToken!: string;

  @Column({ name: 'auth_type', type: 'varchar', length: 30, default: 'bearer_static' })
  authType!: ErpAuthType;

  /** Encrypted JSON blob (TokenCipherService) — never exposed in API responses */
  @Column({ name: 'refresh_credentials', type: 'text', nullable: true, default: null })
  refreshCredentials!: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true, default: null })
  tokenExpiresAt!: Date | null;

  @Column({ name: 'default_headers', type: 'jsonb', nullable: true, default: null })
  defaultHeaders!: Record<string, string> | null;

  @Column({ name: 'timeout_ms', type: 'int', default: 15000 })
  timeoutMs!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true, default: null })
  createdBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;

  @Column({ name: 'last_health_check', type: 'jsonb', nullable: true, default: null })
  lastHealthCheck!: ErpHealthResult | null;

  @Column({ name: 'last_health_checked_at', type: 'timestamptz', nullable: true, default: null })
  lastHealthCheckedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
