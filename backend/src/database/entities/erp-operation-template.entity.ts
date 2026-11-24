import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ErpConnectorEntity } from './erp-connector.entity';

@Entity('erp_operation_templates')
@Index('IDX_erp_templates_connector_id', ['connectorId'])
export class ErpOperationTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'connector_id', type: 'uuid' })
  connectorId!: string;

  @ManyToOne(() => ErpConnectorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connector_id' })
  connector!: ErpConnectorEntity;

  @Column({ length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true, default: null })
  description!: string | null;

  /** HTTP method: GET | POST | PUT | PATCH | DELETE */
  @Column({ length: 10 })
  method!: string;

  /** Relative path appended to connector.baseUrl, e.g. /api/pedidos-compra */
  @Column({ name: 'endpoint_path', length: 500 })
  endpointPath!: string;

  /** JSON body with {{fieldCode}} variables; null for GET requests */
  @Column({ name: 'body_template', type: 'text', nullable: true, default: null })
  bodyTemplate!: string | null;

  /** HTTP status codes that indicate success */
  @Column({ name: 'success_status_codes', type: 'jsonb', default: () => "'[200,201]'" })
  successStatusCodes!: number[];

  /** JSON field key to extract from the response and save in solicitation.externalRefs.erp */
  @Column({ name: 'save_response_field', type: 'varchar', length: 100, nullable: true, default: null })
  saveResponseField!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
