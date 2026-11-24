export type ErpHealthResult = {
  connectorId: string;
  connectorName: string;
  reachable: boolean;
  authValid: boolean | null;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: Date;
  error?: string;
};
