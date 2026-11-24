import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FlowExecutionEntity } from './flow-execution.entity';
import { maskedHeadersTransformer } from './webhook-entity-helpers';

export enum InboundWebhookEventStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  FAILED = 'failed',
  IGNORED = 'ignored',
}

@Entity('inbound_webhook_events')
@Index('IDX_inbound_webhook_events_endpoint_token', ['endpointToken'])
@Index('IDX_inbound_webhook_events_status_created_at', ['status', 'createdAt'])
@Index('IDX_inbound_webhook_events_flow_execution_id', ['flowExecutionId'])
export class InboundWebhookEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'endpoint_token', type: 'varchar', length: 128 })
  endpointToken!: string;

  @Column({ name: 'source_identifier', type: 'varchar', length: 255, nullable: true })
  sourceIdentifier!: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: maskedHeadersTransformer,
  })
  headers!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ name: 'raw_body', type: 'text', nullable: true })
  rawBody!: string | null;

  @Column({ name: 'signature_valid', type: 'boolean', nullable: true })
  signatureValid!: boolean | null;

  @Column({
    type: 'enum',
    enum: InboundWebhookEventStatus,
    default: InboundWebhookEventStatus.RECEIVED,
  })
  status!: InboundWebhookEventStatus;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'flow_execution_id', type: 'uuid', nullable: true })
  flowExecutionId!: string | null;

  @ManyToOne(() => FlowExecutionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'flow_execution_id' })
  flowExecution!: FlowExecutionEntity | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
