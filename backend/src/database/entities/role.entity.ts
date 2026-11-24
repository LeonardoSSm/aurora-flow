import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RolePermissionEntity } from './role-permission.entity';

@Entity('roles')
export class RoleEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  code!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'gray' })
  color!: string;

  // Puramente informativo (badge "perfil padrão" na UI) — nunca deve virar um
  // `if (role.isSystem)` em lógica de acesso; os 4 perfis seedados são
  // perfis editáveis comuns como qualquer outro.
  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @OneToMany(() => RolePermissionEntity, (permission) => permission.role)
  permissions!: RolePermissionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
