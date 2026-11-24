import {
  BeforeInsert,
  BeforeUpdate,
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
import { AreaEntity } from './area.entity';
import { FormEntity } from './form.entity';
import { AuditEventEntity } from './audit-event.entity';
import { RoleEntity } from './role.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', length: 150 })
  fullName!: string;

  @Column({ unique: true, length: 180 })
  @Index('IDX_users_email')
  email!: string;

  // select: false — never returned by default; use addSelect() where the hash is needed
  @Column({ name: 'password_hash', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'editor' })
  role!: string;

  // FK para roles.code, mesmo padrão de areaId/area logo abaixo — a coluna
  // escalar `role` continua sendo o valor lido/gravado em todo o resto do
  // código; esta relação existe para navegar até a definição do perfil
  // (nome/cor/permissões) quando necessário, sem exigir um join manual.
  @ManyToOne(() => RoleEntity, { nullable: false, eager: false })
  @JoinColumn({ name: 'role' })
  roleDefinition!: RoleEntity;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion!: number;

  // NULL = usuário nunca escolheu uma senha (conta criada pelo login Google, que
  // grava um hash aleatório). É o que dispara a tela de cadastro de senha.
  @Column({ name: 'password_defined_at', type: 'timestamp with time zone', nullable: true })
  passwordDefinedAt!: Date | null;

  // Convite por e-mail (link para criar a senha). Só o SHA-256 do token; select: false para o
  // hash nunca sair numa consulta comum. NULL = nenhum convite pendente (nunca enviado ou já usado).
  @Column({ name: 'invite_token_hash', type: 'varchar', length: 64, nullable: true, select: false })
  inviteTokenHash!: string | null;

  @Column({ name: 'invite_expires_at', type: 'timestamp with time zone', nullable: true })
  inviteExpiresAt!: Date | null;

  @Column({ name: 'invite_sent_at', type: 'timestamp with time zone', nullable: true })
  inviteSentAt!: Date | null;

  @Column({ name: 'google_sub', type: 'varchar', length: 120, nullable: true, unique: true })
  googleSub!: string | null;

  @Column({ name: 'google_account_email', type: 'varchar', length: 180, nullable: true })
  googleAccountEmail!: string | null;

  @Column({ name: 'google_refresh_token', type: 'text', nullable: true })
  googleRefreshToken!: string | null;

  @Column({ name: 'google_access_token', type: 'text', nullable: true })
  googleAccessToken!: string | null;

  @Column({ name: 'google_token_expires_at', type: 'timestamp with time zone', nullable: true })
  googleTokenExpiresAt!: Date | null;

  @Column({ name: 'google_connected_at', type: 'timestamp with time zone', nullable: true })
  googleConnectedAt!: Date | null;

  @Column({ name: 'google_disconnected_at', type: 'timestamp with time zone', nullable: true })
  googleDisconnectedAt!: Date | null;

  @Column({ name: 'google_last_used_at', type: 'timestamp with time zone', nullable: true })
  googleLastUsedAt!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamp with time zone', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'area_id', type: 'uuid', nullable: true })
  areaId!: string | null;

  @ManyToOne(() => AreaEntity, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'area_id' })
  area!: AreaEntity | null;

  @OneToMany(() => FormEntity, (form) => form.createdByUser)
  forms!: FormEntity[];

  @OneToMany(() => FormEntity, (form) => form.googleLinkedUser)
  googleLinkedForms!: FormEntity[];

  @OneToMany(() => AuditEventEntity, (audit) => audit.actor)
  auditEvents!: AuditEventEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail(): void {
    this.email = this.email.trim().toLowerCase();
  }
}
