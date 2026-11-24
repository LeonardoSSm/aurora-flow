import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalEntity, AreaEntity, SolicitationEntity } from '../../database/entities';
import { SettingsModule } from '../settings/settings.module';
import { ExecutiveReportService } from './executive-report.service';

@Module({
  imports: [
    SettingsModule,
    TypeOrmModule.forFeature([SolicitationEntity, AreaEntity, ApprovalEntity]),
  ],
  controllers: [],
  providers: [ExecutiveReportService],
})
export class ReportsModule {}
