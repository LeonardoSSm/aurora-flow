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
import { FlowExecutionEntity } from './flow-execution.entity';
import { FormConnectorEntity } from './form-connector.entity';
import {
  maskedHeadersTransformer,
  truncatedResponseBodyTransformer,
} from './webhook-entity-helpers';

export enum WebhookDeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Entity('webhook_deliveries')
@Index('IDX_webhook_deliveries_connector_id', ['connectorId'])
@Index('IDX_webhook_deliveries_flow_execution_id', ['flowExecutionId'])
@Index('IDX_webhook_deliveries_status_next_attempt', ['status', 'nextAttemptAt'])
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'connector_id', type: 'uuid', nullable: true })
  connectorId!: string | null;

  @ManyToOne(() => FormConnectorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connector_id' })
  connector!: FormConnectorEntity | null;

  @Column({ name: 'flow_execution_id', type: 'uuid', nullable: true })
  flowExecutionId!: string | null;

  @ManyToOne(() => FlowExecutionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'flow_execution_id' })
  flowExecution!: FlowExecutionEntity | null;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({
    name: 'request_headers',
    type: 'jsonb',
    nullable: true,
    transformer: maskedHeadersTransformer,
  })
  requestHeaders!: Record<string, unknown> | null;

  @Column({ name: 'request_body', type: 'text', nullable: true })
  requestBody!: string | null;

  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus!: number | null;

  @Column({
    name: 'response_body',
    type: 'text',
    nullable: true,
    transformer: truncatedResponseBodyTransformer,
  })
  responseBody!: string | null;

  @Column({
    type: 'enum',
    enum: WebhookDeliveryStatus,
    default: WebhookDeliveryStatus.PENDING,
  })
  status!: WebhookDeliveryStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'int', nullable: true })
  duration!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
