import { DomainEvent } from './domain-event.base';

export class ApprovalCreatedEvent extends DomainEvent {
  readonly name = 'approvals.created';

  constructor(
    actorId: string | null,
    readonly approvalId: string,
    readonly solicitationId: string,
    readonly assignedUserIds: string[],
  ) {
    super(actorId);
  }
}

/** Como a decisão foi tomada: logado no sistema, ou por link pessoal enviado por e-mail (sem usuário). */
export type ApprovalDecidedVia = 'system' | 'email_link';

export class ApprovalApprovedEvent extends DomainEvent {
  readonly name = 'approvals.approved';

  constructor(
    actorId: string | null,
    readonly approvalId: string,
    readonly solicitationId: string,
    readonly flowDepth = 0,
    readonly decidedVia: ApprovalDecidedVia = 'system',
    readonly decidedByEmail: string | null = null,
  ) {
    super(actorId);
  }
}

export class ApprovalRejectedEvent extends DomainEvent {
  readonly name = 'approvals.rejected';

  constructor(
    actorId: string | null,
    readonly approvalId: string,
    readonly solicitationId: string,
    readonly stepId: string,
    readonly flowDepth = 0,
    readonly decidedVia: ApprovalDecidedVia = 'system',
    readonly decidedByEmail: string | null = null,
  ) {
    super(actorId);
  }
}

export class ApprovalCancelledEvent extends DomainEvent {
  readonly name = 'approvals.cancelled';

  constructor(
    actorId: string,
    readonly approvalId: string,
    readonly solicitationId: string,
  ) {
    super(actorId);
  }
}
