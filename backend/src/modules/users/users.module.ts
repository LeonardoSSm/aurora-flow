import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity, UserEntity } from '../../database/entities';
import { FlowMailerService } from '../flows/mailer/flow-mailer.service';
import { SettingsModule } from '../settings/settings.module';
import { UserInviteService } from './invite/user-invite.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity]), SettingsModule],
  controllers: [UsersController],
  providers: [UsersService, UserInviteService, FlowMailerService, Reflector],
  exports: [UsersService, UserInviteService],
})
export class UsersModule {}
