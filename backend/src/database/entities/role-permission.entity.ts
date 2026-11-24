import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { PermissionScope } from '../../common/constants/permission-catalog';
import { RoleEntity } from './role.entity';

@Entity('role_permissions')
@Unique('UQ_role_permissions_role_code', ['roleId', 'permissionCode'])
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'role_id', type: 'varchar', length: 40 })
  roleId!: string;

  @ManyToOne(() => RoleEntity, (role) => role.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: RoleEntity;

  @Column({ name: 'permission_code', type: 'varchar', length: 80 })
  permissionCode!: string;

  @Column({ type: 'varchar', length: 10, default: 'none' })
  scope!: PermissionScope;
}
