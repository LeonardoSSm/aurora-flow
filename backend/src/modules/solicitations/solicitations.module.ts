import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AttachmentEntity,
  FormEntity,
  FormFieldEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationCommentEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  SolicitationPhasePeriodEntity,
  SolicitationStandardAnswerEntity,
  SubmissionEntity,
  SubmissionItemEntity,
  UserEntity,
} from '../../database/entities';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { FlowMailerService } from '../flows/mailer/flow-mailer.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { SolicitationCommentsService } from './solicitation-comments.service';
import { PhaseSlaService } from './phase-sla.service';
import { SlaCalculatorService } from './sla-calculator.service';
import { SolicitationsListener } from './solicitations.listener';
import { PhaseApprovalAutomationListener } from './phase-approval-automation.listener';
import { SolicitationsService } from './solicitations.service';
import { ErpLookupModule } from '../integrations/erp/lookup/erp-lookup.module';
import { ItemListsModule } from '../item-lists/item-lists.module';
import { UserEmailModule } from '../user-email/user-email.module';
import { KanbanPhasesModule } from '../kanban-phases/kanban-phases.module';

@Module({
  imports: [
    ApprovalsModule,
    ErpLookupModule,
    ItemListsModule,
    UserEmailModule,
    KanbanPhasesModule,
    AttachmentsModule,
    NotificationsModule,
    SettingsModule,
    TypeOrmModule.forFeature([
      SolicitationCommentEntity,
      SolicitationEntity,
      SolicitationHistoryEntity,
      KanbanPhaseEntity,
      KanbanPhaseFieldValueEntity,
      SolicitationStandardAnswerEntity,
      SolicitationPhasePeriodEntity,
      UserEntity,
      FormEntity,
      FormFieldEntity,
      KanbanPhaseFieldEntity,
      SubmissionEntity,
      SubmissionItemEntity,
      AttachmentEntity,
    ]),
  ],
  controllers: [],
  providers: [SolicitationsService, SolicitationsListener, PhaseApprovalAutomationListener, SlaCalculatorService, PhaseSlaService, SolicitationCommentsService, FlowMailerService],
  exports: [SolicitationsService, SlaCalculatorService],
})
export class SolicitationsModule {}
