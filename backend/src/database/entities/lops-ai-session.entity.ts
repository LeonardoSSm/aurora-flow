import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Sessão da LOPS IA: o token curto (tf-XXXX-XXXX-XXXX-XXXX) que a IA repete em cada chamada.
 * Guarda só o hash; a validade anda a cada uso (dura a conversa inteira).
 */
@Entity('lops_ai_sessions')
export class LopsAiSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'token_hash', length: 64 })
  @Index('IDX_lops_ai_sessions_token_hash', { unique: true })
  tokenHash!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index('IDX_lops_ai_sessions_user_id')
  userId!: string;

  /** tokenVersion do usuário ao abrir: trocar a senha derruba a sessão. */
  @Column({ name: 'token_version', type: 'int' })
  tokenVersion!: number;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamp with time zone', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;
}
