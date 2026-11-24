import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApprovalDecisionEntity,
  ApprovalEntity,
  ApprovalStepEntity,
  UserEntity,
} from '../../database/entities';
import { FlowMailerService } from '../flows/mailer/flow-mailer.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { ApprovalsService } from './approvals.service';
import { ExternalApprovalLinkService } from './external/external-approval-link.service';
import { ExternalApprovalsService } from './external/external-approvals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApprovalEntity,
      ApprovalStepEntity,
      ApprovalDecisionEntity,
      UserEntity,
    ]),
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [],
  providers: [ApprovalsService, ExternalApprovalLinkService, ExternalApprovalsService, FlowMailerService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
