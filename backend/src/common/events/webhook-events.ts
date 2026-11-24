export class WebhookReceivedEvent {
  readonly name = 'webhooks.received';

  constructor(
    public readonly eventId: string,
    public readonly endpointId: string,
    public readonly payload: Record<string, unknown> | null,
  ) {}
}
