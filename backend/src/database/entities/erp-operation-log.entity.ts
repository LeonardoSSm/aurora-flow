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
import { ErpConnectorEntity } from './erp-connector.entity';
import { ErpOperationTemplateEntity } from './erp-operation-template.entity';
import { FlowExecutionEntity } from './flow-execution.entity';
import { SolicitationEntity } from './solicitation.entity';

@Entity('erp_operation_logs')
@Index('IDX_erp_logs_connector_id', ['connectorId'])
@Index('IDX_erp_logs_solicitation_id', ['solicitationId'])
@Index('IDX_erp_logs_status_next_attempt', ['status', 'nextAttemptAt'])
export class ErpOperationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true, default: null })
  templateId!: string | null;

  @ManyToOne(() => ErpOperationTemplateEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template!: ErpOperationTemplateEntity | null;

  @Column({ name: 'connector_id', type: 'uuid' })
  connectorId!: string;

  @ManyToOne(() => ErpConnectorEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'connector_id' })
  connector!: ErpConnectorEntity;

  @Column({ name: 'solicitation_id', type: 'uuid', nullable: true, default: null })
  solicitationId!: string | null;

  @ManyToOne(() => SolicitationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity | null;

  @Column({ name: 'flow_execution_id', type: 'uuid', nullable: true, default: null })
  flowExecutionId!: string | null;

  @ManyToOne(() => FlowExecutionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'flow_execution_id' })
  flowExecution!: FlowExecutionEntity | null;

  /** pending | success | failed | retrying */
  @Column({ length: 20 })
  status!: string;

  @Column({ name: 'request_url', type: 'varchar', length: 1000 })
  requestUrl!: string;

  /** Stored body (already interpolated, no bearer token) */
  @Column({ name: 'request_body', type: 'text', nullable: true, default: null })
  requestBody!: string | null;

  @Column({ name: 'response_status', type: 'int', nullable: true, default: null })
  responseStatus!: number | null;

  /** Truncated to 5 KB */
  @Column({ name: 'response_body', type: 'text', nullable: true, default: null })
  responseBody!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true, default: null })
  errorMessage!: string | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true, default: null })
  nextAttemptAt!: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true, default: null })
  durationMs!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
