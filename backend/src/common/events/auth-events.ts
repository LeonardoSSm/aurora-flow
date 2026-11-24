import { DomainEvent } from './domain-event.base';

export class UserLoggedInEvent extends DomainEvent {
  readonly name = 'auth.login';
  constructor(
    actorId: string,
    readonly email: string,
  ) {
    super(actorId);
  }
}

export class PasswordDefinedEvent extends DomainEvent {
  readonly name = 'auth.password_set';
  constructor(
    actorId: string,
    readonly email: string,
    // false = primeiro cadastro de senha (conta vinda do login Google);
    // true = troca de uma senha que já existia.
    readonly wasChange: boolean,
  ) {
    super(actorId);
  }
}

export class GoogleConnectedEvent extends DomainEvent {
  readonly name = 'auth.google_connect';
  constructor(
    actorId: string,
    readonly email: string,
    readonly googleAccountEmail: string | null,
  ) {
    super(actorId);
  }
}

export class GoogleDisconnectedEvent extends DomainEvent {
  readonly name = 'auth.google_disconnect';
  constructor(
    actorId: string,
    readonly email: string,
    readonly googleAccountEmail: string | null,
  ) {
    super(actorId);
  }
}
