import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('areas')
export class AreaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 180 })
  name!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  code!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => AreaEntity, (area) => area.children, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent!: AreaEntity | null;

  @OneToMany(() => AreaEntity, (area) => area.parent)
  children!: AreaEntity[];

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
