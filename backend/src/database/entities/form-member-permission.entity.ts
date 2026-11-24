import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProcessPermissionScope } from '../../common/constants/process-permission-catalog';
import { FormMemberEntity } from './form-member.entity';

/** Uma permissão marcada no vínculo (ver PROCESS_PERMISSION_CATALOG). Ausente = não pode. */
@Entity('form_member_permissions')
export class FormMemberPermissionEntity {
  @PrimaryColumn({ name: 'member_id', type: 'uuid', primaryKeyConstraintName: 'PK_form_member_permissions' })
  memberId!: string;

  @ManyToOne(() => FormMemberEntity, (member) => member.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', foreignKeyConstraintName: 'FK_form_member_permissions_member_id' })
  member!: FormMemberEntity;

  @PrimaryColumn({
    name: 'permission_code',
    type: 'varchar',
    length: 80,
    primaryKeyConstraintName: 'PK_form_member_permissions',
  })
  permissionCode!: string;

  @Column({ type: 'varchar', length: 10, default: 'all' })
  scope!: ProcessPermissionScope;
}
