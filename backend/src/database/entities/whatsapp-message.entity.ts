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
import { SolicitationEntity } from './solicitation.entity';

export enum WhatsAppMessageStatus {
  SENT = 'sent',
  FAILED = 'failed',
  QUEUED = 'queued',
  PENDING = 'pending',
}

@Entity('whatsapp_messages')
@Index('IDX_whatsapp_messages_solicitation_id', ['solicitationId'])
@Index('IDX_whatsapp_messages_flow_execution_id', ['flowExecutionId'])
@Index('IDX_whatsapp_messages_status_created_at', ['status', 'createdAt'])
export class WhatsAppMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid', nullable: true })
  solicitationId!: string | null;

  @ManyToOne(() => SolicitationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity | null;

  @Column({ name: 'flow_execution_id', type: 'uuid', nullable: true })
  flowExecutionId!: string | null;

  @ManyToOne(() => FlowExecutionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'flow_execution_id' })
  flowExecution!: FlowExecutionEntity | null;

  @Column({ name: 'to', type: 'varchar', length: 30 })
  to!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ name: 'external_message_id', type: 'varchar', length: 255, nullable: true })
  externalMessageId!: string | null;

  @Column({
    type: 'enum',
    enum: WhatsAppMessageStatus,
    default: WhatsAppMessageStatus.PENDING,
  })
  status!: WhatsAppMessageStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
