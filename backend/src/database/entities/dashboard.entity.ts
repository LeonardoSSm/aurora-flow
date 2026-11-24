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
import { DashboardWidgetEntity } from './dashboard-widget.entity';
import { FormEntity } from './form.entity';
import { UserEntity } from './user.entity';

/**
 * Painel de indicadores, em dois sabores que dividem a mesma tabela:
 *
 * - **Painel de formulario** (`formId` preenchido): um por formulario, mora na
 *   aba Analytics do builder e e visto por quem enxerga o formulario.
 * - **Painel livre** (`formId` nulo): cruza formularios, pertence a quem criou
 *   e so aparece para os outros depois de publicado.
 *
 * O unico em `form_id` e parcial justamente para nao valer entre os livres.
 */
@Entity('dashboards')
@Index('UQ_dashboards_form_id', ['formId'], { unique: true, where: '"form_id" IS NOT NULL' })
export class DashboardEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Nulo = painel livre. */
  @Column({ name: 'form_id', type: 'uuid', nullable: true })
  formId!: string | null;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity | null;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Dono do painel livre — quem pode editar, publicar e excluir. Em painel de
   * formulario e so o registro de quem montou.
   */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  /** Nulo = privado do dono. Preenchido = visivel para a organizacao. */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity;

  @OneToMany(() => DashboardWidgetEntity, (widget) => widget.dashboard, { cascade: false })
  widgets!: DashboardWidgetEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
