import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ApprovalApprovedEvent,
  ApprovalCancelledEvent,
  ApprovalCreatedEvent,
  ApprovalRejectedEvent,
} from '../../../common/events/approval-events';
import {
  FormArchivedEvent,
  FormCreatedEvent,
  FormDuplicatedEvent,
  FormPublishedEvent,
  FormStatusChangedEvent,
  FormUpdatedEvent,
  GoogleSheetCreatedEvent,
  GoogleSyncReenqueuedEvent,
  GoogleSyncReprocessedEvent,
} from '../../../common/events/form-events';
import {
  ResponseExportedEvent,
  ResponseSubmittedEvent,
} from '../../../common/events/response-events';
import {
  SolicitationAssigneeChangedEvent,
  SolicitationCreatedEvent,
  SolicitationMovedEvent,
  SolicitationPriorityChangedEvent,
  SolicitationStatusChangedEvent,
} from '../../../common/events/solicitation-events';
import {
  GoogleConnectedEvent,
  GoogleDisconnectedEvent,
  PasswordDefinedEvent,
  UserLoggedInEvent,
} from '../../../common/events/auth-events';
import {
  UserCreatedEvent,
  UserDeactivatedEvent,
  UserInviteSentEvent,
  UserUpdatedEvent,
} from '../../../common/events/user-events';
import { ProcessMemberChangedEvent } from '../../../common/events/process-access-events';
import { AuditService } from '../audit.service';

@Injectable()
export class AuditListener {
  constructor(private readonly auditService: AuditService) {}

  @OnEvent('process_members.changed', { async: true })
  async onProcessMemberChanged(event: ProcessMemberChangedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form_member',
      entityId: event.formId,
      action: `access_${event.action}`,
      payload: { userId: event.userId, grants: event.grants, previous: event.previous },
    });
  }

  // ── Forms ─────────────────────────────────────────────────────────────────

  @OnEvent('forms.created', { async: true })
  async onFormCreated(event: FormCreatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'create',
      payload: {
        name: event.formName,
        assignedUserIds: event.assignedUserIds,
        googleSheetsEnabled: event.googleSheetsEnabled,
      },
    });
  }

  @OnEvent('forms.updated', { async: true })
  async onFormUpdated(event: FormUpdatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'update',
      payload: { name: event.formName },
    });
  }

  @OnEvent('forms.status_changed', { async: true })
  async onFormStatusChanged(event: FormStatusChangedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'status_change',
      payload: { status: event.status },
    });
  }

  @OnEvent('forms.published', { async: true })
  async onFormPublished(event: FormPublishedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'status_change',
      payload: { status: 'published' },
    });
  }

  @OnEvent('forms.archived', { async: true })
  async onFormArchived(event: FormArchivedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'archive',
      payload: { previousStatus: event.previousStatus },
    });
  }

  @OnEvent('forms.duplicated', { async: true })
  async onFormDuplicated(event: FormDuplicatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'duplicate',
      payload: { sourceFormId: event.sourceFormId },
    });
  }

  @OnEvent('forms.google_sheet_created', { async: true })
  async onGoogleSheetCreated(event: GoogleSheetCreatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'forms',
      entity: 'form',
      entityId: event.formId,
      action: 'google_sheet_create',
      payload: { spreadsheetId: event.spreadsheetId, linkedAccountEmail: event.linkedAccountEmail },
    });
  }

  @OnEvent('forms.google_sync_reenqueued', { async: true })
  async onGoogleSyncReenqueued(event: GoogleSyncReenqueuedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'responses',
      entity: 'form',
      entityId: event.formId,
      action: 'google_sync_reenqueue',
      payload: {
        requeuedJobs: event.requeuedJobs,
        recoveredProcessingJobs: event.recoveredProcessingJobs,
      },
    });
  }

  @OnEvent('forms.google_sync_reprocessed', { async: true })
  async onGoogleSyncReprocessed(event: GoogleSyncReprocessedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'responses',
      entity: 'form',
      entityId: event.formId,
      action: 'google_sync_reprocess',
      payload: {
        createdJobs: event.createdJobs,
        skippedExistingJobs: event.skippedExistingJobs,
        skippedCompletedJobs: event.skippedCompletedJobs,
      },
    });
  }

  // ── Responses ─────────────────────────────────────────────────────────────

  @OnEvent('responses.submitted', { async: true })
  async onResponseSubmitted(event: ResponseSubmittedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'responses',
      entity: 'submission',
      entityId: event.submissionId,
      action: 'submit',
      payload: { formId: event.formId, formVersionId: event.formVersionId },
    });
  }

  @OnEvent('responses.exported', { async: true })
  async onResponseExported(event: ResponseExportedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'responses',
      entity: 'form',
      entityId: event.formId,
      action: `export_${event.format}`,
      payload: { count: event.count },
    });
  }

  // ── Solicitations ────────────────────────────────────────────────────────

  @OnEvent('solicitations.created', { async: true })
  async onSolicitationCreated(event: SolicitationCreatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'solicitations',
      entity: 'solicitation',
      entityId: event.solicitationId,
      action: 'create',
      payload: {
        originType: event.originType,
        formId: event.formId,
        submissionId: event.submissionId,
      },
    });
  }

  @OnEvent('solicitations.status_changed', { async: true })
  async onSolicitationStatusChanged(event: SolicitationStatusChangedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'solicitations',
      entity: 'solicitation',
      entityId: event.solicitationId,
      action: 'status_change',
      payload: { fromStatus: event.fromStatus, toStatus: event.toStatus },
    });
  }

  @OnEvent('solicitations.assignee_changed', { async: true })
  async onSolicitationAssigneeChanged(event: SolicitationAssigneeChangedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'solicitations',
      entity: 'solicitation',
      entityId: event.solicitationId,
      action: 'assignee_change',
      payload: {
        fromAssigneeId: event.fromAssigneeId,
        toAssigneeId: event.toAssigneeId,
      },
    });
  }

  @OnEvent('solicitations.priority_changed', { async: true })
  async onSolicitationPriorityChanged(event: SolicitationPriorityChangedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'solicitations',
      entity: 'solicitation',
      entityId: event.solicitationId,
      action: 'priority_change',
      payload: { fromPriority: event.fromPriority, toPriority: event.toPriority },
    });
  }

  @OnEvent('solicitations.moved', { async: true })
  async onSolicitationMoved(event: SolicitationMovedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'solicitations',
      entity: 'solicitation',
      entityId: event.solicitationId,
      action: 'kanban_move',
      payload: { fromStatus: event.fromStatus, toStatus: event.toStatus },
    });
  }

  // ── Approvals ────────────────────────────────────────────────────────────

  @OnEvent('approvals.created', { async: true })
  async onApprovalCreated(event: ApprovalCreatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'approvals',
      entity: 'approval',
      entityId: event.approvalId,
      action: 'create',
      payload: { solicitationId: event.solicitationId, assignedUserIds: event.assignedUserIds },
    });
  }

  @OnEvent('approvals.approved', { async: true })
  async onApprovalApproved(event: ApprovalApprovedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'approvals',
      entity: 'approval',
      entityId: event.approvalId,
      action: 'approve',
      payload: {
        solicitationId: event.solicitationId,
        decidedVia: event.decidedVia,
        ...(event.decidedByEmail ? { decidedByEmail: event.decidedByEmail } : {}),
      },
    });
  }

  @OnEvent('approvals.rejected', { async: true })
  async onApprovalRejected(event: ApprovalRejectedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'approvals',
      entity: 'approval',
      entityId: event.approvalId,
      action: 'reject',
      payload: {
        solicitationId: event.solicitationId,
        stepId: event.stepId,
        decidedVia: event.decidedVia,
        ...(event.decidedByEmail ? { decidedByEmail: event.decidedByEmail } : {}),
      },
    });
  }

  @OnEvent('approvals.cancelled', { async: true })
  async onApprovalCancelled(event: ApprovalCancelledEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'approvals',
      entity: 'approval',
      entityId: event.approvalId,
      action: 'cancel',
      payload: { solicitationId: event.solicitationId },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  @OnEvent('auth.login', { async: true })
  async onUserLoggedIn(event: UserLoggedInEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'auth',
      entity: 'user',
      entityId: event.actorId ?? '',
      action: 'login',
      payload: { email: event.email },
    });
  }

  @OnEvent('auth.password_set', { async: true })
  async onPasswordDefined(event: PasswordDefinedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'auth',
      entity: 'user',
      entityId: event.actorId ?? '',
      action: event.wasChange ? 'password_change' : 'password_set',
      payload: { email: event.email },
    });
  }

  @OnEvent('auth.google_connect', { async: true })
  async onGoogleConnected(event: GoogleConnectedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'auth',
      entity: 'user',
      entityId: event.actorId ?? '',
      action: 'google_connect',
      payload: { email: event.email, googleAccountEmail: event.googleAccountEmail },
    });
  }

  @OnEvent('auth.google_disconnect', { async: true })
  async onGoogleDisconnected(event: GoogleDisconnectedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'auth',
      entity: 'user',
      entityId: event.actorId ?? '',
      action: 'google_disconnect',
      payload: { email: event.email, googleAccountEmail: event.googleAccountEmail },
    });
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  @OnEvent('users.created', { async: true })
  async onUserCreated(event: UserCreatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'users',
      entity: 'user',
      entityId: event.userId,
      action: 'create',
      payload: { email: event.email, role: event.role },
    });
  }

  @OnEvent('users.invite_sent', { async: true })
  async onUserInviteSent(event: UserInviteSentEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'users',
      entity: 'user',
      entityId: event.userId,
      action: 'invite_sent',
      payload: { email: event.email, expiresAt: event.expiresAt.toISOString() },
    });
  }

  @OnEvent('users.updated', { async: true })
  async onUserUpdated(event: UserUpdatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'users',
      entity: 'user',
      entityId: event.userId,
      action: 'update',
      payload: event.changes,
    });
  }

  @OnEvent('users.deactivated', { async: true })
  async onUserDeactivated(event: UserDeactivatedEvent): Promise<void> {
    await this.auditService.log({
      actorId: event.actorId,
      module: 'users',
      entity: 'user',
      entityId: event.userId,
      action: 'deactivate',
      payload: { email: event.email },
    });
  }
}
