import { DomainEvent } from './domain-event.base';

export class UserCreatedEvent extends DomainEvent {
  readonly name = 'users.created';
  constructor(
    actorId: string,
    readonly userId: string,
    readonly email: string,
    readonly role: string,
  ) {
    super(actorId);
  }
}

export class UserUpdatedEvent extends DomainEvent {
  readonly name = 'users.updated';
  constructor(
    actorId: string,
    readonly userId: string,
    readonly changes: Record<string, unknown>,
  ) {
    super(actorId);
  }
}

export class UserInviteSentEvent extends DomainEvent {
  readonly name = 'users.invite_sent';
  constructor(
    actorId: string | null,
    readonly userId: string,
    readonly email: string,
    readonly expiresAt: Date,
  ) {
    super(actorId);
  }
}

export class UserDeactivatedEvent extends DomainEvent {
  readonly name = 'users.deactivated';
  constructor(
    actorId: string,
    readonly userId: string,
    readonly email: string,
  ) {
    super(actorId);
  }
}
