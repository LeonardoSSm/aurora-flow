import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSettingEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 100 })
  key!: string;

  @Column({ name: 'value', type: 'text', nullable: true })
  value!: string | null;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ name: 'value_type', type: 'varchar', length: 20, default: 'string' })
  valueType!: 'string' | 'boolean' | 'number' | 'json';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
