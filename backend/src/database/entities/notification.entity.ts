import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('notifications')
@Index('IDX_notifications_user_id_created_at', ['userId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  /** Título opcional (preenchido pelo canal `in_app` do módulo de notificações). */
  @Column({ type: 'varchar', length: 150, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 500 })
  message!: string;

  /** Caminho interno do app que o aviso abre ao ser clicado (ex.: `/aprovacoes?id=…`). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  link!: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
