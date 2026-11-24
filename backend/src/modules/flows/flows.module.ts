import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApprovalEntity,
  AttachmentEntity,
  FlowEntity,
  FlowExecutionEntity,
  FormEntity,
  FormFieldEntity,
  FormVersionEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  NotificationEntity,
  SolicitationEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { AuditModule } from '../audit/audit.module';
import { GoogleWorkspaceModule } from '../google-workspace/google-workspace.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ErpModule } from '../integrations/erp/erp.module';
import { LopsAiModule } from '../integrations/lops-ai/lops-ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../queue/queue.module';
import { SolicitationsModule } from '../solicitations/solicitations.module';
import { UsersModule } from '../users/users.module';
import { DlqMonitorService } from './dlq-monitor.service';
import { FlowExecutionEngine } from './flow-execution.engine';
import { FlowFieldLabelsService } from './flow-field-labels.service';
import { FlowsConsumer } from './flows.consumer';
import { FlowsApprovalListener } from './flows-approval.listener';
import { FlowsAttachmentListener } from './flows-attachment.listener';
import { FlowsPhaseFieldsListener } from './flows-phase-fields.listener';
import { FlowsPhaseEnteredListener } from './flows-phase-entered.listener';
import { FlowsController } from './flows.controller';
import { FlowsErpReconciliationService } from './flows-erp-reconciliation.service';
import { FlowsListener } from './flows.listener';
import { FlowsSolicitationListener } from './flows-solicitation.listener';
import { FlowsScheduledTriggerService } from './flows-scheduled-trigger.service';
import { FlowsSlaListener } from './flows-sla.listener';
import { FlowsWebhookListener } from './flows-webhook.listener';
import { FlowsService } from './flows.service';
import { FlowMailerService } from './mailer/flow-mailer.service';
import { FlowNotificationNodeExecutor } from './notification/flow-notification-node.executor';
import { NotificationRecipientResolver } from './notification/notification-recipient.resolver';
import { ScoreAlertListener } from './score-alert/score-alert.listener';
import { FlowNotificationsController } from './flow-notifications.controller';

@Module({
  imports: [
    QueueModule,
    ErpModule,
    GoogleWorkspaceModule,
    SolicitationsModule,
    ApprovalsModule,
    UsersModule,
    IntegrationsModule,
    LopsAiModule,
    NotificationsModule,
    AuditModule,
    TypeOrmModule.forFeature([
      FlowEntity,
      FlowExecutionEntity,
      SubmissionEntity,
      FormEntity,
      NotificationEntity,
      SolicitationEntity,
      ApprovalEntity,
      AttachmentEntity,
      KanbanPhaseEntity,
      KanbanPhaseFieldEntity,
      KanbanPhaseFieldValueEntity,
      FormFieldEntity,
      FormVersionEntity,
      UserEntity,
    ]),
  ],
  controllers: [FlowsController, FlowNotificationsController],
  providers: [
    FlowsService,
    FlowsListener,
    FlowsSolicitationListener,
    FlowsApprovalListener,
    FlowsAttachmentListener,
    FlowsPhaseFieldsListener,
    FlowsPhaseEnteredListener,
    FlowsWebhookListener,
    FlowsSlaListener,
    FlowsScheduledTriggerService,
    FlowsErpReconciliationService,
    FlowsConsumer,
    FlowExecutionEngine,
    FlowFieldLabelsService,
    FlowMailerService,
    FlowNotificationNodeExecutor,
    NotificationRecipientResolver,
    ScoreAlertListener,
    DlqMonitorService,
  ],
  exports: [FlowsService],
})
export class FlowsModule {}
