import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DashboardEntity } from './dashboard.entity';

/**
 * Um bloco do painel.
 *
 * `configJson` guarda o que a pessoa escolheu (campo, agregacao, periodo,
 * limite) e e validado pelo motor de indicadores a cada leitura, nunca na
 * escrita apenas — versao do formulario muda, campo some, e a configuracao
 * guardada precisa falhar de forma visivel em vez de devolver numero errado.
 *
 * `x`, `y`, `w`, `h` sao a grade livre — mesma unidade que o react-grid-layout
 * usa no front, 12 colunas. `position` continua existindo como desempate
 * estavel (ordem de leitura, e ordem de blocos que ainda nao tem layout).
 */
@Entity('dashboard_widgets')
@Index('IDX_dashboard_widgets_dashboard_id_position', ['dashboardId', 'position'])
export class DashboardWidgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dashboard_id', type: 'uuid' })
  dashboardId!: string;

  @ManyToOne(() => DashboardEntity, (dashboard) => dashboard.widgets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dashboard_id' })
  dashboard!: DashboardEntity;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  /** Formato do widget: kpi | categorias | serie | ranking. */
  @Column({ type: 'varchar', length: 30 })
  kind!: string;

  @Column({ name: 'config_json', type: 'jsonb', default: () => "'{}'" })
  configJson!: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'int', default: 0 })
  x!: number;

  @Column({ type: 'int', default: 0 })
  y!: number;

  @Column({ type: 'int', default: 6 })
  w!: number;

  @Column({ type: 'int', default: 4 })
  h!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
