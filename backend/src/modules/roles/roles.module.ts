import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RoleEntity, RolePermissionEntity, UserEntity } from '../../database/entities';
import { UsersModule } from '../users/users.module';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

// @Global(): PermissionsService/PermissionsGuard need to be injectable from
// every controller module as they migrate from @Roles to @RequirePermission
// (Fases 3-5), the same way Areas/Storage/Observability are global today.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RoleEntity, RolePermissionEntity]),
    UsersModule,
  ],
  controllers: [RolesController],
  providers: [RolesService, PermissionsService, PermissionsGuard, Reflector],
  exports: [PermissionsService, PermissionsGuard],
})
export class RolesModule {}
