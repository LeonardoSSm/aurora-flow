/**
 * Fronteiras do Aurora Flow para integrações futuras.
 *
 * Este ciclo não inventa conectores fictícios. O produto já expõe:
 * - webhooks de entrada (`POST /webhooks/in/:token`) que disparam `webhooks.received`
 *   e alimentam o nó `trigger_webhook_received`;
 * - ação `action_webhook` para HTTP de saída;
 * - fila RabbitMQ para execução assíncrona de fluxos.
 *
 * Integrações com Aurora Forms ou outros produtos do ecossistema devem usar
 * esses contratos (HTTP, eventos, webhooks), sem importar módulos internos
 * daqueles sistemas.
 */
export const AURORA_FLOW_INTEGRATION_EVENTS = [
  'webhooks.received',
  'flow.execution.completed',
] as const;
