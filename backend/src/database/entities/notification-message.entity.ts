import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  NotificationChannelId,
  NotificationMessageStatus,
  NotificationPriority,
} from '../../modules/notifications/domain/notification.types';
import { FlowExecutionEntity } from './flow-execution.entity';
import { FlowEntity } from './flow.entity';
import { NotificationRecipientEntity } from './notification-recipient.entity';
import { SolicitationEntity } from './solicitation.entity';

/**
 * Uma notificação “solicitada” (ex.: uma execução do nó `action_notification`): o conteúdo já
 * renderizado, o canal e a correlação com a origem. A entrega em si vive nos destinatários
 * (`notification_recipients`) e nas tentativas (`notification_attempts`).
 *
 * Dados pessoais: `title`/`body` podem conter dados do processo — por isso o acesso à API exige
 * `flows.manage` e há expurgo por retenção (`NOTIFICATIONS_RETENTION_DAYS`).
 * Não confundir com `notifications` (`NotificationEntity`), que é a caixa de entrada in-app.
 */
@Entity('notification_messages')
@Index('IDX_notification_messages_flow_execution_id', ['flowExecutionId'])
@Index('IDX_notification_messages_flow_id_created_at', ['flowId', 'createdAt'])
@Index('IDX_notification_messages_created_at', ['createdAt'])
@Index('UQ_notification_messages_idempotency_key', ['idempotencyKey'], { unique: true })
export class NotificationMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  channel!: NotificationChannelId;

  /** Agregado dos destinatários (ver `deriveMessageStatus`). */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: NotificationMessageStatus;

  @Column({ type: 'varchar', length: 10, default: 'normal' })
  priority!: NotificationPriority;

  /** Assunto (e-mail) / título (in-app) / prefixo (WhatsApp). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'text' })
  body!: string;

  /** Primeira tentativa programada para o futuro (atraso do nó); nulo = imediato. */
  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor!: Date | null;

  @Column({ name: 'max_attempts', type: 'smallint', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'backoff_seconds', type: 'int', default: 30 })
  backoffSeconds!: number;

  /**
   * Chave de idempotência (hash). Uma segunda solicitação com a mesma chave devolve esta
   * notificação em vez de criar outra — é o que impede envio duplicado em reprocessamento.
   */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey!: string | null;

  // ── Correlação com a origem (sem FK “forte”: a notificação sobrevive à exclusão da origem) ──
  @Column({ name: 'flow_id', type: 'uuid', nullable: true })
  flowId!: string | null;

  @ManyToOne(() => FlowEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'flow_id' })
  flow!: FlowEntity | null;

  @Column({ name: 'flow_execution_id', type: 'uuid', nullable: true })
  flowExecutionId!: string | null;

  @ManyToOne(() => FlowExecutionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'flow_execution_id' })
  flowExecution!: FlowExecutionEntity | null;

  @Column({ name: 'node_id', type: 'varchar', length: 100, nullable: true })
  nodeId!: string | null;

  @Column({ name: 'solicitation_id', type: 'uuid', nullable: true })
  solicitationId!: string | null;

  @ManyToOne(() => SolicitationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity | null;

  /** Variáveis ausentes, truncamento, modo de entrega… — nunca dados pessoais. */
  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @OneToMany(() => NotificationRecipientEntity, (recipient) => recipient.notification)
  recipients!: NotificationRecipientEntity[];

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
