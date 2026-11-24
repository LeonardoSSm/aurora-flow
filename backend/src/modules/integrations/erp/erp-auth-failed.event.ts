export class ErpAuthFailedEvent {
  constructor(
    public readonly connectorId: string,
    public readonly connectorName: string,
  ) {}
}
