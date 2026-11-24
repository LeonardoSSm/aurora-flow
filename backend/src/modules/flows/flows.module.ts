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
import { IntegrationsModule } from '../integrations/integrations.module';
import { ErpModule } from '../integrations/erp/erp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../queue/queue.module';
import { UsersModule } from '../users/users.module';
import { DlqMonitorService } from './dlq-monitor.service';
import { FlowExecutionEngine } from './flow-execution.engine';
import { FlowFieldLabelsService } from './flow-field-labels.service';
import { FlowsConsumer } from './flows.consumer';
import { FlowsController } from './flows.controller';
import { FlowsErpReconciliationService } from './flows-erp-reconciliation.service';
import { FlowsWebhookListener } from './flows-webhook.listener';
import { FlowsScheduledTriggerService } from './flows-scheduled-trigger.service';
import { FlowsService } from './flows.service';
import { FlowMailerService } from './mailer/flow-mailer.service';
import { FlowNotificationNodeExecutor } from './notification/flow-notification-node.executor';
import { NotificationRecipientResolver } from './notification/notification-recipient.resolver';
import { FlowNotificationsController } from './flow-notifications.controller';

/**
 * Núcleo de automações. Listeners de formulário/kanban/aprovação não são registrados:
 * os nós correspondentes são recusados na API e no motor (flow-capabilities).
 * Entidades TypeORM de processo permanecem enquanto o engine legado ainda as referencia
 * internamente — ver Docs/cycle-02/remaining-technical-debt.md.
 */
@Module({
  imports: [
    QueueModule,
    ErpModule,
    GoogleWorkspaceModule,
    UsersModule,
    IntegrationsModule,
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
    FlowsWebhookListener,
    FlowsScheduledTriggerService,
    FlowsErpReconciliationService,
    FlowsConsumer,
    FlowExecutionEngine,
    FlowFieldLabelsService,
    FlowMailerService,
    FlowNotificationNodeExecutor,
    NotificationRecipientResolver,
    DlqMonitorService,
  ],
  exports: [FlowsService],
})
export class FlowsModule {}
