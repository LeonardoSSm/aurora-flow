import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  NotificationAttemptStatus,
  NotificationErrorCategory,
} from '../../modules/notifications/domain/notification.types';
import { NotificationRecipientEntity } from './notification-recipient.entity';

/**
 * Registro imutável de cada tentativa de envio a um destinatário (auditoria e diagnóstico):
 * quando começou/terminou, o provedor, o id devolvido por ele e o erro **sanitizado**.
 * `status` = `started` enquanto em curso; `abandoned` quando o worker morreu no meio.
 */
@Entity('notification_attempts')
@Index('UQ_notification_attempts_recipient_attempt', ['recipientId', 'attemptNumber'], {
  unique: true,
})
export class NotificationAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => NotificationRecipientEntity, (recipient) => recipient.attempts, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: NotificationRecipientEntity;

  @Column({ name: 'attempt_number', type: 'smallint' })
  attemptNumber!: number;

  @Column({ type: 'varchar', length: 12 })
  status!: NotificationAttemptStatus;

  @Column({ type: 'varchar', length: 40, nullable: true })
  provider!: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'error_category', type: 'varchar', length: 30, nullable: true })
  errorCategory!: NotificationErrorCategory | null;

  @Column({ name: 'error_message', type: 'varchar', length: 500, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'http_status', type: 'smallint', nullable: true })
  httpStatus!: number | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
