import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DiskHealthIndicator,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HEALTH_DISK_THRESHOLD_PERCENT, HEALTH_HEAP_LIMIT_BYTES } from '../health.controller';
import { type ProbeResponse, ServiceMapProbe } from './service-map.probe';
import {
  ON_DEMAND_SERVICE_IDS,
  SERVICE_MAP_IDS,
  type ServiceMapId,
  type ServiceMapState,
  type ServiceMapStatusResponse,
  type ServiceStatus,
} from './service-map.types';

/** Cada checagem tem 2,5 s; todas rodam em paralelo. */
export const SERVICE_MAP_CHECK_TIMEOUT_MS = 2_500;
/** O mapa faz polling a cada 15 s por aba aberta; o cache evita martelar os serviços. */
export const SERVICE_MAP_CACHE_TTL_MS = 10_000;
/** erp-lookup acima disso responde, mas devagar. */
export const ERP_LOOKUP_SLOW_MS = 2_000;
/** Dentro dos 2,5 s da checagem do backend, com folga. */
const BACKEND_DISK_CHECK_TIMEOUT_MS = 2_000;
const DEFAULT_QUEUE_WARN = 1_000;

/** Endereços padrão dentro da `formhub-network` do docker-compose. */
const DEFAULT_URLS = {
  rabbitmq: 'http://rabbitmq:15672',
  evolution: 'http://evolution-api:8080',
  erpLookup: 'http://erp-lookup:3100',
  prometheus: 'http://prometheus:9090',
  grafana: 'http://grafana:3000',
  pgadmin: 'http://pgadmin:80',
  erpMysqlDev: 'erp-mysql-dev:3306',
} as const;

type CheckResult = { status: ServiceMapState; latencyMs?: number; message?: string };

/** Falha com explicação pronta para o painel do serviço. */
class ServiceCheckError extends Error {}

class CheckTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function isOk(response: ProbeResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Checagens do Mapa de serviços (Admin › Plataforma). Regras por serviço no
 * README do handoff (`design_handoff_mapa_servicos/README.md`, seção "Status"):
 * pgadmin e erp-mysql-dev são perfis opcionais e viram "sob demanda" quando não
 * respondem; o resto vira "fora do ar".
 */
@Injectable()
export class ServiceMapService {
  private cache: { at: number; value: ServiceMapStatusResponse } | null = null;
  private inflight: Promise<ServiceMapStatusResponse> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly probe: ServiceMapProbe,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  async getStatus(): Promise<ServiceMapStatusResponse> {
    if (this.cache && Date.now() - this.cache.at < SERVICE_MAP_CACHE_TTL_MS) {
      return this.cache.value;
    }
    // Duas abas pedindo ao mesmo tempo dividem a mesma rodada de checagens.
    this.inflight ??= this.runChecks()
      .then((value) => {
        this.cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async runChecks(): Promise<ServiceMapStatusResponse> {
    const checks: Record<ServiceMapId, () => Promise<CheckResult>> = {
      // A requisição chegou ao backend pelo frontend: ele está no ar.
      frontend: () => Promise.resolve({ status: 'ativo' }),
      backend: () => this.checkBackend(),
      postgres: () => this.checkPostgres(),
      rabbitmq: () => this.checkRabbitmq(),
      'evolution-api': () => this.checkEvolution(),
      'erp-lookup': () => this.checkErpLookup(),
      prometheus: () => this.checkPrometheus(),
      'postgres-exporter': () => this.checkPostgresExporter(),
      grafana: () => this.checkGrafana(),
      pgadmin: () => this.checkPgadmin(),
      'erp-mysql-dev': () => this.checkErpMysqlDev(),
    };

    const settled = await Promise.allSettled(
      SERVICE_MAP_IDS.map(async (id): Promise<ServiceStatus> => {
        try {
          const result = await withTimeout(checks[id](), SERVICE_MAP_CHECK_TIMEOUT_MS);
          return { id, ...result, checkedAt: new Date().toISOString() };
        } catch (error) {
          return { id, ...this.unreachable(id, error), checkedAt: new Date().toISOString() };
        }
      }),
    );

    const services = settled.map((outcome, index): ServiceStatus =>
      outcome.status === 'fulfilled'
        ? outcome.value
        : {
            id: SERVICE_MAP_IDS[index],
            ...this.unreachable(SERVICE_MAP_IDS[index], outcome.reason),
            checkedAt: new Date().toISOString(),
          },
    );
    return { services, checkedAt: new Date().toISOString() };
  }

  /**
   * Sem resposta: perfil opcional fica "sob demanda"; o resto, "fora do ar" com o motivo.
   * Exceções: o backend está respondendo esta requisição, então no máximo fica degradado; e o
   * erp-lookup que aceita a conexão mas demora é lento (em geral, esperando o banco do ERP).
   */
  private unreachable(id: ServiceMapId, error: unknown): CheckResult {
    if (ON_DEMAND_SERVICE_IDS.includes(id)) return { status: 'demanda' };
    if (id === 'backend') return { status: 'degradado', message: this.describeError(error) };
    if (id === 'erp-lookup' && this.isTimeout(error)) {
      return {
        status: 'degradado',
        message: `A API não respondeu em ${formatSeconds(SERVICE_MAP_CHECK_TIMEOUT_MS)} s: em geral, o banco do ERP está lento ou fora do ar.`,
      };
    }
    return { status: 'falha', message: this.describeError(error) };
  }

  private isTimeout(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name;
    return error instanceof CheckTimeoutError || name === 'TimeoutError' || name === 'AbortError';
  }

  private describeError(error: unknown): string {
    if (error instanceof ServiceCheckError) return error.message;
    if (this.isTimeout(error)) return `Sem resposta em ${formatSeconds(SERVICE_MAP_CHECK_TIMEOUT_MS)} s.`;
    const code =
      (error as { code?: string; cause?: { code?: string } } | null)?.cause?.code ??
      (error as { code?: string } | null)?.code;
    if (code === 'ECONNREFUSED') return 'Conexão recusada: o container está parado ou a porta não responde.';
    if (code === 'ENOTFOUND' || code === 'EAI_ADDRINFO' || code === 'EAI_AGAIN') {
      return 'Endereço não encontrado na rede: o container está parado ou fora da formhub-network.';
    }
    if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') {
      return 'A conexão caiu antes da resposta: o serviço não está atendendo nessa porta.';
    }
    const message = error instanceof Error ? error.message : String(error);
    return `A checagem falhou: ${message.slice(0, 160)}`;
  }

  // ─── Checagens ──────────────────────────────────────────────────────────────

  private async checkBackend(): Promise<CheckResult> {
    const problems: string[] = [];
    await this.memory
      .checkHeap('memory_heap', HEALTH_HEAP_LIMIT_BYTES)
      .catch(() =>
        problems.push(`Memória do processo acima de ${HEALTH_HEAP_LIMIT_BYTES / 1024 / 1024} MB.`),
      );
    // A leitura do disco é lenta fora do Linux (segundos no Windows): sem resposta, não conclui nada.
    await withTimeout(
      this.disk.checkStorage('disk', {
        path: process.cwd(),
        thresholdPercent: HEALTH_DISK_THRESHOLD_PERCENT,
      }),
      BACKEND_DISK_CHECK_TIMEOUT_MS,
    ).catch((error: unknown) => {
      if (!(error instanceof CheckTimeoutError)) {
        problems.push(`Disco com mais de ${HEALTH_DISK_THRESHOLD_PERCENT * 100}% de uso.`);
      }
    });
    return problems.length > 0
      ? { status: 'degradado', message: problems.join(' ') }
      : { status: 'ativo' };
  }

  private async checkPostgres(): Promise<CheckResult> {
    const startedAt = Date.now();
    try {
      await this.db.pingCheck('postgres', { timeout: SERVICE_MAP_CHECK_TIMEOUT_MS });
    } catch {
      throw new ServiceCheckError('O banco não respondeu ao ping.');
    }
    return { status: 'ativo', latencyMs: Date.now() - startedAt };
  }

  private async checkRabbitmq(): Promise<CheckResult> {
    // Não reaproveita RABBITMQ_MANAGEMENT_URL: no .env de desenvolvimento ele aponta para localhost,
    // que dentro do container não é o RabbitMQ.
    const base = this.url('SERVICE_MAP_RABBITMQ_URL', DEFAULT_URLS.rabbitmq);
    const user = this.env('RABBITMQ_USER') ?? 'formhub';
    const password = this.env('RABBITMQ_PASSWORD') ?? this.env('RABBITMQ_PASS') ?? 'formhub';
    const headers = { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` };

    const overview = await this.get(`${base}/api/overview`, headers);
    if (overview.status === 401) {
      throw new ServiceCheckError(
        'O painel de gestão recusou as credenciais (RABBITMQ_USER / RABBITMQ_PASSWORD).',
      );
    }
    if (!isOk(overview)) throw new ServiceCheckError(`O painel de gestão respondeu ${overview.status}.`);

    const total = Number(
      (overview.json as { queue_totals?: { messages?: number } } | undefined)?.queue_totals?.messages ?? 0,
    );
    if (!(total > this.queueWarnLimit())) return { status: 'ativo', latencyMs: overview.latencyMs };

    return {
      status: 'degradado',
      latencyMs: overview.latencyMs,
      message: await this.describeBacklog(base, headers, total),
    };
  }

  /** Nomeia a fila mais cheia; sem isso, só o total. */
  private async describeBacklog(
    base: string,
    headers: Record<string, string>,
    total: number,
  ): Promise<string> {
    try {
      const queues = await this.get(
        `${base}/api/queues?sort=messages&sort_reverse=true&columns=name,messages`,
        headers,
      );
      const top = Array.isArray(queues.json)
        ? (queues.json[0] as { name?: string; messages?: number } | undefined)
        : undefined;
      if (isOk(queues) && top?.name && (top.messages ?? 0) > 0) {
        const topCount = top.messages ?? 0;
        return topCount >= total
          ? `Fila ${top.name} com ${formatCount(topCount)} mensagens acumuladas.`
          : `Fila ${top.name} com ${formatCount(topCount)} mensagens acumuladas (${formatCount(total)} no total).`;
      }
    } catch {
      // cai no total abaixo
    }
    return `${formatCount(total)} mensagens acumuladas nas filas.`;
  }

  private async checkEvolution(): Promise<CheckResult> {
    const base = this.url('SERVICE_MAP_EVOLUTION_URL', DEFAULT_URLS.evolution, 'WHATSAPP_EVOLUTION_BASE_URL');
    const response = await this.get(`${base}/`);
    if (!isOk(response)) throw new ServiceCheckError(`O gateway do WhatsApp respondeu ${response.status}.`);
    return { status: 'ativo', latencyMs: response.latencyMs };
  }

  private async checkErpLookup(): Promise<CheckResult> {
    const base = this.url('SERVICE_MAP_ERP_LOOKUP_URL', DEFAULT_URLS.erpLookup);
    const response = await this.get(`${base}/health`);
    const { latencyMs } = response;
    if (response.status === 503) {
      return {
        status: 'degradado',
        latencyMs,
        message: 'A API respondeu “não configurada” (503): os campos Lista do ERP ficam sem dados.',
      };
    }
    if (!isOk(response)) throw new ServiceCheckError(`A API respondeu ${response.status}.`);

    // O /health do erp-lookup responde 200 enquanto o processo está de pé e informa o banco em `db`.
    const db = (response.json as { db?: string } | undefined)?.db;
    if (db === 'nao_configurado') {
      return {
        status: 'degradado',
        latencyMs,
        message: 'A API está no ar, mas sem banco do ERP configurado: os campos Lista do ERP ficam sem dados.',
      };
    }
    if (db === 'down') {
      return { status: 'degradado', latencyMs, message: 'A API está no ar, mas não alcança o banco do ERP.' };
    }
    if (latencyMs > ERP_LOOKUP_SLOW_MS) {
      return {
        status: 'degradado',
        latencyMs,
        message: `Consultas ao ERP respondendo em ${formatSeconds(latencyMs)} s (limite: ${formatSeconds(ERP_LOOKUP_SLOW_MS)} s).`,
      };
    }
    return { status: 'ativo', latencyMs };
  }

  private async checkPrometheus(): Promise<CheckResult> {
    const response = await this.get(`${this.prometheusUrl()}/-/healthy`);
    if (!isOk(response)) throw new ServiceCheckError(`O Prometheus respondeu ${response.status}.`);
    return { status: 'ativo', latencyMs: response.latencyMs };
  }

  /** O exportador não tem health check próprio: vale o que o Prometheus vê ao coletá-lo. */
  private async checkPostgresExporter(): Promise<CheckResult> {
    let response: ProbeResponse;
    try {
      response = await this.get(`${this.prometheusUrl()}/api/v1/targets?state=active`);
    } catch {
      throw new ServiceCheckError('Prometheus fora do ar: não dá para conferir o exportador.');
    }
    if (!isOk(response)) {
      throw new ServiceCheckError(`O Prometheus respondeu ${response.status} ao listar os alvos.`);
    }
    const targets =
      (response.json as {
        data?: {
          activeTargets?: Array<{
            labels?: Record<string, string>;
            health?: string;
            lastError?: string;
            lastScrapeDuration?: number;
          }>;
        };
      } | undefined)?.data?.activeTargets ?? [];
    const target = targets.find((t) => t.labels?.job === 'postgres');
    if (!target) throw new ServiceCheckError('O Prometheus não tem o alvo "postgres" configurado.');
    if (target.health === 'down') {
      throw new ServiceCheckError(
        `O Prometheus não consegue coletar as métricas do Postgres${target.lastError ? `: ${target.lastError}` : '.'}`,
      );
    }
    return {
      status: 'ativo',
      ...(typeof target.lastScrapeDuration === 'number'
        ? { latencyMs: Math.round(target.lastScrapeDuration * 1000) }
        : {}),
    };
  }

  private async checkGrafana(): Promise<CheckResult> {
    const base = this.url('SERVICE_MAP_GRAFANA_URL', DEFAULT_URLS.grafana);
    const response = await this.get(`${base}/api/health`);
    if (!isOk(response)) throw new ServiceCheckError(`O Grafana respondeu ${response.status}.`);
    return { status: 'ativo', latencyMs: response.latencyMs };
  }

  private async checkPgadmin(): Promise<CheckResult> {
    const base = this.url('SERVICE_MAP_PGADMIN_URL', DEFAULT_URLS.pgadmin);
    const response = await this.get(`${base}/misc/ping`);
    // Qualquer resposta (até um redirecionamento para o login) quer dizer que o container subiu.
    if (response.status >= 500) {
      return { status: 'degradado', latencyMs: response.latencyMs, message: `O pgAdmin respondeu ${response.status}.` };
    }
    return { status: 'ativo', latencyMs: response.latencyMs };
  }

  private async checkErpMysqlDev(): Promise<CheckResult> {
    const address = this.env('SERVICE_MAP_ERP_MYSQL_DEV_ADDR') ?? DEFAULT_URLS.erpMysqlDev;
    const separator = address.lastIndexOf(':');
    const host = separator > 0 ? address.slice(0, separator) : address;
    const port = separator > 0 ? Number(address.slice(separator + 1)) : 3306;
    const latencyMs = await this.probe.tcpConnect(host, port, SERVICE_MAP_CHECK_TIMEOUT_MS);
    return { status: 'ativo', latencyMs };
  }

  // ─── Apoio ──────────────────────────────────────────────────────────────────

  private get(url: string, headers?: Record<string, string>): Promise<ProbeResponse> {
    return this.probe.httpGet(url, { timeoutMs: SERVICE_MAP_CHECK_TIMEOUT_MS, headers });
  }

  /** Variável própria do mapa, senão a que o backend já usa para o serviço, senão o padrão do compose. */
  private url(key: string, fallback: string, sharedKey?: string): string {
    const configured = this.env(key) ?? (sharedKey ? this.env(sharedKey) : undefined);
    return (configured ?? fallback).replace(/\/+$/, '');
  }

  /** Variável de ambiente; vazia (ex.: `SERVICE_MAP_RABBITMQ_URL=` no .env) conta como ausente. */
  private env(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value === '' ? undefined : value;
  }

  private prometheusUrl(): string {
    return this.url('SERVICE_MAP_PROMETHEUS_URL', DEFAULT_URLS.prometheus);
  }

  private queueWarnLimit(): number {
    const value = Number(this.config.get<string>('SERVICE_MAP_RABBIT_QUEUE_WARN'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_QUEUE_WARN;
  }
}
