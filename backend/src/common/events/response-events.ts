import { DomainEvent } from './domain-event.base';

export class ResponseSubmittedEvent extends DomainEvent {
  readonly name = 'responses.submitted';
  constructor(
    readonly submissionId: string,
    readonly formId: string,
    readonly formVersionId: string,
  ) {
    super(null);
  }
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export class ResponseExportedEvent extends DomainEvent {
  readonly name = 'responses.exported';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly format: ExportFormat,
    readonly count: number,
  ) {
    super(actorId);
  }
}
