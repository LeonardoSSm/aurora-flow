import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import type { PermissionScope } from '../../../common/constants/permission-catalog';

const SCOPES: PermissionScope[] = ['none', 'own', 'assigned', 'area', 'all'];

export class RolePermissionEntryDto {
  @ApiProperty({ example: 'forms.view' })
  @IsString()
  code!: string;

  @ApiProperty({ enum: SCOPES, example: 'own' })
  @IsIn(SCOPES)
  scope!: PermissionScope;
}
