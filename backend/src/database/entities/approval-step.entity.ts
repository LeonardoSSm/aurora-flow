import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { ApprovalDecisionEntity } from './approval-decision.entity';
import { ApprovalEntity } from './approval.entity';
import { RoleEntity } from './role.entity';
import { UserEntity } from './user.entity';

/**
 * Uma etapa tem EXATAMENTE um responsável: um usuário nomeado, um perfil ("quem tiver este papel")
 * ou um **aprovador externo** identificado só pelo e-mail (sem usuário no sistema), que decide por um
 * link pessoal enviado por e-mail.
 */
@Entity('approval_steps')
@Check(
  'CHK_approval_steps_assignee_xor',
  `("assigned_user_id" IS NOT NULL)::int + ("assigned_role_code" IS NOT NULL)::int + ("assigned_email" IS NOT NULL)::int = 1`,
)
@Index('UQ_approval_steps_access_token_hash', ['accessTokenHash'], {
  unique: true,
  where: '"access_token_hash" IS NOT NULL',
})
export class ApprovalStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'approval_id', type: 'uuid' })
  approvalId!: string;

  @ManyToOne(() => ApprovalEntity, (approval) => approval.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'approval_id' })
  approval!: ApprovalEntity;

  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser!: UserEntity | null;

  /** Alternativa a assignedUserId: roteia a etapa para "quem tiver este perfil" em vez de um usuário nomeado. Exatamente um dos dois é preenchido (CHECK no banco). */
  @Column({ name: 'assigned_role_code', type: 'varchar', length: 40, nullable: true })
  assignedRoleCode!: string | null;

  @ManyToOne(() => RoleEntity, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'assigned_role_code' })
  assignedRole!: RoleEntity | null;

  /** Aprovador externo (sem usuário no sistema): e-mail normalizado em minúsculas. Exclusivo com usuário/perfil. */
  @Column({ name: 'assigned_email', type: 'varchar', length: 180, nullable: true })
  assignedEmail!: string | null;

  /**
   * SHA-256 do token do link de aprovação externa (o token em si NUNCA é guardado). `select: false`:
   * não sai em nenhuma consulta nem resposta da API, só quando pedido explicitamente. Nulo = sem link
   * ativo (ainda não emitido, já usado, bloqueado por tentativas ou invalidado por um reenvio).
   */
  @Column({ name: 'access_token_hash', type: 'varchar', length: 64, nullable: true, select: false })
  accessTokenHash!: string | null;

  @Column({ name: 'access_token_expires_at', type: 'timestamptz', nullable: true })
  accessTokenExpiresAt!: Date | null;

  /** Quando o e-mail com o link foi aceito pelo SMTP; nulo enquanto o link não foi enviado (permite achar o que ficou preso). */
  @Column({ name: 'access_link_sent_at', type: 'timestamptz', nullable: true })
  accessLinkSentAt!: Date | null;

  /** Confirmações de e-mail erradas no link atual; ao passar do limite o link é invalidado. */
  @Column({ name: 'access_failed_attempts', type: 'smallint', default: 0, select: false })
  accessFailedAttempts!: number;

  @Column({ type: 'varchar', length: 20, default: ApprovalStepStatus.PENDING })
  status!: ApprovalStepStatus;

  @Column({ type: 'int', default: 1 })
  order!: number;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @OneToOne(() => ApprovalDecisionEntity, (d) => d.approvalStep, { nullable: true })
  decision!: ApprovalDecisionEntity | null;
}
