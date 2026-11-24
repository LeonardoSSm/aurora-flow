import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApprovalEntity,
  ApprovalStepEntity,
  FlowEntity,
  FlowExecutionEntity,
  FormEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { AuditModule } from '../audit/audit.module';
import { SolicitationsModule } from '../solicitations/solicitations.module';
import { DashboardService } from './dashboard.service';
import { OperationalDashboardService } from './operational-dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FormEntity,
      SubmissionEntity,
      UserEntity,
      SolicitationEntity,
      SolicitationHistoryEntity,
      ApprovalEntity,
      ApprovalStepEntity,
      FlowEntity,
      FlowExecutionEntity,
    ]),
    AuditModule,
    SolicitationsModule,
  ],
  controllers: [],
  providers: [DashboardService, OperationalDashboardService],
})
export class DashboardModule {}
