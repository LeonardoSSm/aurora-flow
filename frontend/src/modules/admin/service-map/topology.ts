import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ChartArea,
  Database,
  DatabaseZap,
  FileSearch,
  Flame,
  MessageCircle,
  Monitor,
  Rabbit,
  Server,
  SquareTerminal,
} from 'lucide-react';

/**
 * Topologia estática do Mapa de serviços, tirada de `docker-compose.yml` e
 * `observability/prometheus/prometheus.yml`. Se o compose mudar (serviço novo,
 * porta, perfil, limite de memória), atualize aqui — e a lista de ids do
 * endpoint `GET /admin/service-map/status` no backend.
 */

export type ServiceState = 'ativo' | 'demanda' | 'degradado' | 'falha';

/** Perfil do `docker compose --profile` que sobe o serviço. */
export type ServiceProfile = 'app' | 'tools' | 'observability' | 'erp-dev';

export type ServiceDef = {
  id: string;
  /** Coluna (0..3) e linha (0..3) na grade do mapa. */
  col: number;
  row: number;
  /** Porta curta exibida no nó. */
  port: string;
  icon: LucideIcon;
  desc: string;
  image: string;
  container: string;
  /** Mapeamento completo de portas, para o painel de detalhes. */
  ports: string;
  profile: ServiceProfile;
  mem: string;
  health: string;
};

/** Tipo da conexão: chamada da aplicação, coleta de métricas ou ferramenta sob demanda. */
export type EdgeKind = 'app' | 'metrics' | 'tools';

/** `[origem, destino, tipo]` — a seta aponta para a dependência (quem é chamado). */
export type ServiceEdge = readonly [source: string, target: string, kind: EdgeKind];

export const COLUMNS = ['Clientes', 'Aplicação', 'Serviços', 'Dados'] as const;

export const SERVICES: readonly ServiceDef[] = [
  {
    id: 'frontend',
    col: 0,
    row: 0,
    port: ':5173',
    icon: Monitor,
    desc: 'SPA React servida pelo nginx',
    image: 'build ./frontend',
    container: 'formhub-frontend',
    ports: '5173 → 80',
    profile: 'app',
    mem: '64 MB',
    health: 'depende do backend saudável',
  },
  {
    id: 'pgadmin',
    col: 0,
    row: 2,
    port: ':5050',
    icon: SquareTerminal,
    desc: 'Console web do Postgres',
    image: 'dpage/pgadmin4:latest',
    container: 'formhub-pgadmin',
    ports: '5050 → 80',
    profile: 'tools',
    mem: '256 MB',
    health: '—',
  },
  {
    id: 'grafana',
    col: 0,
    row: 3,
    port: ':3001',
    icon: ChartArea,
    desc: 'Dashboards de observabilidade',
    image: 'grafana/grafana:11.4.0',
    container: 'formhub-grafana',
    ports: '3001 → 3000',
    profile: 'observability',
    mem: '192 MB',
    health: '—',
  },
  {
    id: 'backend',
    col: 1,
    row: 0,
    port: ':3000',
    icon: Server,
    desc: 'API NestJS do Aurora Flow',
    image: 'build ./backend',
    container: 'formhub-backend',
    ports: '3000 → 3000',
    profile: 'app',
    mem: '384 MB',
    health: 'GET /api/v1/health a cada 15s',
  },
  {
    id: 'prometheus',
    col: 1,
    row: 3,
    port: ':9090',
    icon: Flame,
    desc: 'Coleta de métricas (retenção 15 dias)',
    image: 'prom/prometheus:v2.55.1',
    container: 'formhub-prometheus',
    ports: '9090 → 9090',
    profile: 'observability',
    mem: '256 MB',
    health: '—',
  },
  {
    id: 'rabbitmq',
    col: 2,
    row: 0,
    port: ':5672',
    icon: Rabbit,
    desc: 'Filas de eventos com dead-letter',
    image: 'rabbitmq:3-management-alpine',
    container: 'formhub-rabbitmq',
    ports: '5672, 15672',
    profile: 'app',
    mem: '192 MB',
    health: 'rabbitmq-diagnostics ping a cada 10s',
  },
  {
    id: 'evolution-api',
    col: 2,
    row: 1,
    port: ':8082',
    icon: MessageCircle,
    desc: 'Gateway do WhatsApp',
    image: 'atendai/evolution-api:latest',
    container: 'formhub-evolution',
    ports: '8082 → 8080',
    profile: 'app',
    mem: '384 MB',
    health: 'wget / a cada 15s',
  },
  {
    id: 'erp-lookup',
    col: 2,
    row: 2,
    port: ':3100',
    icon: FileSearch,
    desc: 'Consultas ao ERP para “Lista do ERP”',
    image: 'build ./erp-lookup',
    container: 'tijucaflow-erp-lookup',
    ports: '3100 (só rede interna)',
    profile: 'app',
    mem: '128 MB',
    health: 'GET /health a cada 15s',
  },
  {
    id: 'postgres-exporter',
    col: 2,
    row: 3,
    port: ':9187',
    icon: Activity,
    desc: 'Exporta métricas do Postgres',
    image: 'postgres-exporter:v0.15.0',
    container: 'formhub-postgres-exporter',
    ports: '9187 → 9187',
    profile: 'observability',
    mem: '64 MB',
    health: '—',
  },
  {
    id: 'postgres',
    col: 3,
    row: 1,
    port: ':5432',
    icon: Database,
    desc: 'Banco principal (formhub)',
    image: 'postgres:16-alpine',
    container: 'formhub-postgres',
    ports: '5432 → 5432',
    profile: 'app',
    mem: '384 MB',
    health: 'pg_isready a cada 10s',
  },
  {
    id: 'erp-mysql-dev',
    col: 3,
    row: 2,
    port: ':3307',
    icon: DatabaseZap,
    desc: 'MySQL falso para testar o erp-lookup',
    image: 'mysql:8.4',
    container: 'tijucaflow-erp-mysql-dev',
    ports: '3307 → 3306',
    profile: 'erp-dev',
    mem: '768 MB',
    health: 'mysqladmin ping a cada 10s',
  },
];

export const SERVICE_EDGES: readonly ServiceEdge[] = [
  ['frontend', 'backend', 'app'],
  ['backend', 'postgres', 'app'],
  ['backend', 'rabbitmq', 'app'],
  ['backend', 'evolution-api', 'app'],
  ['backend', 'erp-lookup', 'app'],
  ['evolution-api', 'postgres', 'app'],
  ['erp-lookup', 'erp-mysql-dev', 'tools'],
  ['pgadmin', 'postgres', 'tools'],
  ['postgres-exporter', 'postgres', 'metrics'],
  ['prometheus', 'backend', 'metrics'],
  ['prometheus', 'postgres-exporter', 'metrics'],
  ['prometheus', 'rabbitmq', 'metrics'],
  ['grafana', 'prometheus', 'metrics'],
];

/** Serviços que só sobem com um perfil opcional: sem resposta, ficam "sob demanda". */
export const ON_DEMAND_SERVICE_IDS: readonly string[] = ['pgadmin', 'erp-mysql-dev'];

export function getService(id: string): ServiceDef | undefined {
  return SERVICES.find((service) => service.id === id);
}

/** Quem o serviço chama (`Depende de`). */
export function dependenciesOf(id: string): string[] {
  return SERVICE_EDGES.filter(([source]) => source === id).map(([, target]) => target);
}

/** Quem chama o serviço (`Usado por`). */
export function dependentsOf(id: string): string[] {
  return SERVICE_EDGES.filter(([, target]) => target === id).map(([source]) => source);
}
