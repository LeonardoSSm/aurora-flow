import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { FormMemberPermissionEntity } from './form-member-permission.entity';
import { UserEntity } from './user.entity';

/**
 * Vínculo de uma pessoa com um processo. Quem tem vínculo vê o processo; o que mais pode fazer nele
 * está nas permissões do vínculo. Sem vínculo, o processo não existe para a pessoa (salvo acesso
 * total pelo perfil, aprovação roteada a ela e o próprio pedido).
 */
@Entity('form_members')
@Unique('UQ_form_members_form_user', ['formId', 'userId'])
@Index('IDX_form_members_user_id', ['userId'])
export class FormMemberEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_form_members' })
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id', foreignKeyConstraintName: 'FK_form_members_form_id' })
  form!: FormEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_form_members_user_id' })
  user!: UserEntity;

  /** Quem criou o vínculo; nulo = a migration que converteu o acesso antigo. */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @OneToMany(() => FormMemberPermissionEntity, (permission) => permission.member, { cascade: true })
  permissions!: FormMemberPermissionEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
