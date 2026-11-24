import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingEntity } from '../../database/entities';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettingEntity])],
  controllers: [SettingsController],
  providers: [SettingsService, Reflector],
  exports: [SettingsService],
})
export class SettingsModule {}
