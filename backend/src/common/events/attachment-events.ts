import { DomainEvent } from './domain-event.base';

export class AttachmentUploadedEvent extends DomainEvent {
  readonly name = 'attachments.uploaded';

  constructor(
    actorId: string | null,
    readonly attachmentId: string,
    readonly submissionId: string | null,
  ) {
    super(actorId);
  }
}
