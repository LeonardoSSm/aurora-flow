import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventEntity, UserEntity } from '../../database/entities';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditListener } from './listeners/audit.listener';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity, UserEntity])],
  providers: [AuditService, AuditListener],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
