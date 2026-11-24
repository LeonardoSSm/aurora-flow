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
  NotificationErrorCategory,
  NotificationRecipientSource,
  NotificationRecipientStatus,
} from '../../modules/notifications/domain/notification.types';
import { NotificationAttemptEntity } from './notification-attempt.entity';
import { NotificationMessageEntity } from './notification-message.entity';
import { UserEntity } from './user.entity';

/**
 * Um destinatário de uma notificação — a unidade real de entrega: estado, tentativas e
 * resultado do provedor ficam aqui. É também a “fila” do worker (`status` + `next_attempt_at`).
 *
 * Dados pessoais: `address` (e-mail/telefone) e `display_name`. Nunca logados; expostos na API
 * mascarados, salvo para quem tem `flows.manage`. Expurgados com a mensagem pai.
 */
@Entity('notification_recipients')
@Index('IDX_notification_recipients_notification_id', ['notificationId'])
@Index('IDX_notification_recipients_due', ['priorityRank', 'nextAttemptAt'], {
  where: `"status" IN ('pending','scheduled')`,
})
@Index('IDX_notification_recipients_processing', ['lockedAt'], { where: `"status" = 'processing'` })
@Index('UQ_notification_recipients_message_key', ['notificationId', 'recipientKey'], {
  unique: true,
})
export class NotificationRecipientEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @ManyToOne(() => NotificationMessageEntity, (message) => message.recipients, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_id' })
  notification!: NotificationMessageEntity;

  /** Usuário do sistema, quando o destinatário é um (referência — não copia dados dele). */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity | null;

  @Column({ type: 'varchar', length: 20 })
  source!: NotificationRecipientSource;

  @Column({ name: 'display_name', type: 'varchar', length: 150, nullable: true })
  displayName!: string | null;

  /** E-mail ou telefone (normalizado). Nulo para `in_app` (usa `user_id`) ou se não resolvido. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  /** Identidade para deduplicar dentro da mesma notificação: `user_id` ou endereço normalizado. */
  @Column({ name: 'recipient_key', type: 'varchar', length: 255 })
  recipientKey!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: NotificationRecipientStatus;

  /** Cópia da prioridade da mensagem (0 = alta) para ordenar a fila sem JOIN. */
  @Column({ name: 'priority_rank', type: 'smallint', default: 1 })
  priorityRank!: number;

  @Column({ name: 'attempt_count', type: 'smallint', default: 0 })
  attemptCount!: number;

  /** Quando fica elegível: primeira tentativa programada ou próxima retentativa. */
  @Column({ name: 'next_attempt_at', type: 'timestamptz' })
  nextAttemptAt!: Date;

  /** Início do processamento atual — base para recuperar worker que morreu no meio. */
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  provider!: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'last_error_category', type: 'varchar', length: 30, nullable: true })
  lastErrorCategory!: NotificationErrorCategory | null;

  /** Erro já sanitizado (sem e-mail/telefone/URL/segredo). */
  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => NotificationAttemptEntity, (attempt) => attempt.recipient)
  attempts!: NotificationAttemptEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
