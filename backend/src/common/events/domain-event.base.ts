export abstract class DomainEvent {
  readonly occurredAt: Date;
  readonly actorId: string | null;

  constructor(actorId: string | null = null) {
    this.occurredAt = new Date();
    this.actorId = actorId;
  }

  abstract get name(): string;
}
