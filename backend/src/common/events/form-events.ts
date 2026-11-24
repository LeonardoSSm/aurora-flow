import type { FormStatus } from '../enums/form-status.enum';
import { DomainEvent } from './domain-event.base';

export class FormCreatedEvent extends DomainEvent {
  readonly name = 'forms.created';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly formName: string,
    readonly assignedUserIds: string[],
    readonly googleSheetsEnabled: boolean,
  ) {
    super(actorId);
  }
}

export class FormUpdatedEvent extends DomainEvent {
  readonly name = 'forms.updated';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly formName: string,
  ) {
    super(actorId);
  }
}

export class FormStatusChangedEvent extends DomainEvent {
  readonly name = 'forms.status_changed';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly status: FormStatus,
  ) {
    super(actorId);
  }
}

export class FormPublishedEvent extends DomainEvent {
  readonly name = 'forms.published';
  constructor(
    actorId: string,
    readonly formId: string,
  ) {
    super(actorId);
  }
}

export class FormArchivedEvent extends DomainEvent {
  readonly name = 'forms.archived';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly previousStatus: FormStatus,
  ) {
    super(actorId);
  }
}

export class FormDuplicatedEvent extends DomainEvent {
  readonly name = 'forms.duplicated';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly sourceFormId: string,
  ) {
    super(actorId);
  }
}

export class GoogleSheetCreatedEvent extends DomainEvent {
  readonly name = 'forms.google_sheet_created';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly spreadsheetId: string,
    readonly linkedAccountEmail: string | null,
  ) {
    super(actorId);
  }
}

export class GoogleSyncReenqueuedEvent extends DomainEvent {
  readonly name = 'forms.google_sync_reenqueued';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly requeuedJobs: number,
    readonly recoveredProcessingJobs: number,
  ) {
    super(actorId);
  }
}

export class GoogleSyncReprocessedEvent extends DomainEvent {
  readonly name = 'forms.google_sync_reprocessed';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly createdJobs: number,
    readonly skippedExistingJobs: number,
    readonly skippedCompletedJobs: number,
  ) {
    super(actorId);
  }
}
