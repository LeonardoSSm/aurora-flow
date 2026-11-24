/**
 * Contratos estáveis do Aurora Flow para o Aurora Ecosystem.
 *
 * O motor consome eventos genéricos. Não importa entidades, tabelas ou código
 * de Aurora Forms / Tijuca Flow. Produtos vizinhos publicam webhooks HTTP
 * (ou enfileiram payloads JSON) neste formato.
 */

export const AURORA_FLOW_EVENT_CONTRACT_VERSION = '1';

export const AURORA_FLOW_INTEGRATION_EVENTS = [
  'webhooks.received',
  'flow.execution.completed',
] as const;

export type AuroraFlowInboundEventV1 = {
  contractVersion: typeof AURORA_FLOW_EVENT_CONTRACT_VERSION;
  eventName: string;
  occurredAt: string;
  source: {
    product: string;
    instanceId?: string;
  };
  payload: Record<string, unknown>;
};

/**
 * Exemplo (não implementado aqui): Aurora Forms POSTa em
 * `/api/v1/webhooks/in/:token` com corpo { contractVersion, eventName, payload }.
 * O gatilho `trigger_webhook_received` inicia o fluxo; o payload vira
 * `ctx.metadata.payload` para templates e condições.
 */
export function isAuroraFlowInboundEventV1(value: unknown): value is AuroraFlowInboundEventV1 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.contractVersion === AURORA_FLOW_EVENT_CONTRACT_VERSION && typeof record.eventName === 'string';
}
