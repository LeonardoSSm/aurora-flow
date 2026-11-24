/**
 * Estado de cada container do docker-compose para o Mapa de serviços do Admin
 * (`GET /admin/service-map/status`). Os ids batem com a topologia do frontend
 * (`frontend/src/modules/admin/service-map/topology.ts`).
 */
export type ServiceMapState = 'ativo' | 'demanda' | 'degradado' | 'falha';

export type ServiceStatus = {
  id: ServiceMapId;
  status: ServiceMapState;
  latencyMs?: number;
  /** Explicação para quem administra, ex.: "Fila notificacoes.whatsapp com 1.240 mensagens acumuladas." */
  message?: string;
  checkedAt: string;
};

export type ServiceMapStatusResponse = {
  services: ServiceStatus[];
  checkedAt: string;
};

export const SERVICE_MAP_IDS = [
  'frontend',
  'pgadmin',
  'grafana',
  'backend',
  'prometheus',
  'rabbitmq',
  'evolution-api',
  'erp-lookup',
  'postgres-exporter',
  'postgres',
  'erp-mysql-dev',
] as const;

export type ServiceMapId = (typeof SERVICE_MAP_IDS)[number];

/** Perfis opcionais do compose (`tools`, `erp-dev`): sem resposta vira "sob demanda", nunca falha. */
export const ON_DEMAND_SERVICE_IDS: readonly ServiceMapId[] = ['pgadmin', 'erp-mysql-dev'];
