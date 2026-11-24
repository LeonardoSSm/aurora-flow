import { HealthCheckError } from '@nestjs/terminus';
import type { ProbeResponse } from './service-map.probe';
import { SERVICE_MAP_CACHE_TTL_MS, ServiceMapService } from './service-map.service';
import { SERVICE_MAP_IDS, type ServiceStatus } from './service-map.types';

type Route = ProbeResponse | Error | 'never';

function refused(): Error {
  return Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
}

function timedOut(): Error {
  return Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
}

/** Respostas de "tudo no ar", por trecho da URL. */
function healthyRoutes(): Record<string, Route> {
  return {
    'rabbitmq:15672/api/overview': { status: 200, latencyMs: 12, json: { queue_totals: { messages: 3 } } },
    'evolution-api:8080/': { status: 200, latencyMs: 20, json: { status: 200 } },
    'erp-lookup:3100/health': { status: 200, latencyMs: 15, json: { status: 'ok', db: 'ok' } },
    'prometheus:9090/-/healthy': { status: 200, latencyMs: 5 },
    'prometheus:9090/api/v1/targets': {
      status: 200,
      latencyMs: 8,
      json: {
        data: {
          activeTargets: [
            { labels: { job: 'postgres' }, health: 'up', lastScrapeDuration: 0.031 },
            { labels: { job: 'rabbitmq' }, health: 'up' },
          ],
        },
      },
    },
    'grafana:3000/api/health': { status: 200, latencyMs: 9, json: { database: 'ok' } },
    'pgadmin:80/misc/ping': { status: 200, latencyMs: 30 },
  };
}

function setup(options: {
  routes?: Record<string, Route>;
  env?: Record<string, string>;
  tcp?: 'ok' | 'refused';
  dbUp?: boolean;
} = {}) {
  const routes = options.routes ?? healthyRoutes();
  const probe = {
    httpGet: jest.fn((url: string) => {
      // Rota mais específica primeiro (".../api/v1/targets" antes de ".../").
      const key = Object.keys(routes)
        .sort((a, b) => b.length - a.length)
        .find((fragment) => url.includes(fragment));
      const route = key ? routes[key] : refused();
      if (route === 'never') return new Promise<ProbeResponse>(() => undefined);
      return route instanceof Error ? Promise.reject(route) : Promise.resolve(route);
    }),
    tcpConnect: jest.fn(() =>
      options.tcp === 'refused' ? Promise.reject(refused()) : Promise.resolve(4),
    ),
  };
  const env = options.env ?? {};
  const config = { get: jest.fn((key: string) => env[key]) };
  const db = {
    pingCheck: jest.fn(() =>
      options.dbUp === false
        ? Promise.reject(new HealthCheckError('down', { postgres: { status: 'down' } }))
        : Promise.resolve({ postgres: { status: 'up' } }),
    ),
  };
  const memory = { checkHeap: jest.fn().mockResolvedValue({}) };
  const disk = { checkStorage: jest.fn().mockResolvedValue({}) };
  const service = new ServiceMapService(
    config as never,
    probe as never,
    db as never,
    memory as never,
    disk as never,
  );
  return { service, probe, memory, disk };
}

function byId(services: ServiceStatus[]) {
  return Object.fromEntries(services.map((s) => [s.id, s]));
}

describe('ServiceMapService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('tudo no ar: os 11 serviços ativos, com latência e horário da checagem', async () => {
    const { service } = setup();

    const result = await service.getStatus();

    expect(result.services.map((s) => s.id)).toEqual([...SERVICE_MAP_IDS]);
    expect(result.services.every((s) => s.status === 'ativo')).toBe(true);
    expect(result.services.every((s) => !Number.isNaN(Date.parse(s.checkedAt)))).toBe(true);
    const services = byId(result.services);
    expect(services['evolution-api'].latencyMs).toBe(20);
    expect(services['postgres-exporter'].latencyMs).toBe(31);
    expect(services['erp-mysql-dev'].latencyMs).toBe(4);
  });

  it('usa os endereços da rede do docker-compose quando não há variável', async () => {
    const { service, probe } = setup();

    await service.getStatus();

    const urls = probe.httpGet.mock.calls.map(([url]) => url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'http://rabbitmq:15672/api/overview',
        'http://evolution-api:8080/',
        'http://erp-lookup:3100/health',
        'http://prometheus:9090/-/healthy',
        'http://grafana:3000/api/health',
        'http://pgadmin:80/misc/ping',
      ]),
    );
    expect(probe.tcpConnect).toHaveBeenCalledWith('erp-mysql-dev', 3306, 2500);
    expect(probe.httpGet).toHaveBeenCalledWith(
      'http://rabbitmq:15672/api/overview',
      expect.objectContaining({ timeoutMs: 2500, headers: { Authorization: expect.stringMatching(/^Basic /) } }),
    );
  });

  it('variável do mapa vazia conta como ausente: o evolution cai no gateway que o backend já usa', async () => {
    const { service, probe } = setup({
      env: { SERVICE_MAP_EVOLUTION_URL: '', WHATSAPP_EVOLUTION_BASE_URL: 'https://whats.exemplo.com/' },
      routes: { ...healthyRoutes(), 'whats.exemplo.com/': { status: 200, latencyMs: 40 } },
    });

    const services = byId((await service.getStatus()).services);

    expect(probe.httpGet).toHaveBeenCalledWith('https://whats.exemplo.com/', expect.anything());
    expect(services['evolution-api'].status).toBe('ativo');
  });

  it('RabbitMQ não reaproveita RABBITMQ_MANAGEMENT_URL (localhost no .env de dev): usa o da rede do compose', async () => {
    const { service, probe } = setup({ env: { RABBITMQ_MANAGEMENT_URL: 'http://localhost:15672' } });

    await service.getStatus();

    expect(probe.httpGet).toHaveBeenCalledWith('http://rabbitmq:15672/api/overview', expect.anything());
  });

  it('backend nunca fica fora do ar (é ele que responde); disco lento não conta, disco cheio degrada', async () => {
    jest.useFakeTimers();
    const lento = setup();
    lento.disk.checkStorage.mockReturnValue(new Promise(() => undefined));
    const pending = lento.service.getStatus();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(byId((await pending).services).backend.status).toBe('ativo');

    const travado = setup();
    travado.memory.checkHeap.mockReturnValue(new Promise(() => undefined));
    const pendingTravado = travado.service.getStatus();
    await jest.advanceTimersByTimeAsync(2_500);
    expect(byId((await pendingTravado).services).backend).toMatchObject({
      status: 'degradado',
      message: 'Sem resposta em 2,5 s.',
    });
    jest.useRealTimers();

    const cheio = setup();
    cheio.disk.checkStorage.mockRejectedValue(new HealthCheckError('disk', {}));
    expect(byId((await cheio.service.getStatus()).services).backend).toMatchObject({
      status: 'degradado',
      message: 'Disco com mais de 90% de uso.',
    });
  });

  it('erp-lookup que aceita a conexão e não responde a tempo fica degradado, não fora do ar', async () => {
    const { service } = setup({ routes: { ...healthyRoutes(), 'erp-lookup:3100/health': timedOut() } });

    expect(byId((await service.getStatus()).services)['erp-lookup']).toMatchObject({
      status: 'degradado',
      message: expect.stringContaining('banco do ERP'),
    });
  });

  it('conexão derrubada no meio: mensagem própria', async () => {
    const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const { service } = setup({ routes: { ...healthyRoutes(), 'prometheus:9090/-/healthy': reset } });

    expect(byId((await service.getStatus()).services).prometheus).toMatchObject({
      status: 'falha',
      message: 'A conexão caiu antes da resposta: o serviço não está atendendo nessa porta.',
    });
  });

  it('timeout de um serviço: fora do ar com "Sem resposta em 2,5 s."', async () => {
    const { service } = setup({ routes: { ...healthyRoutes(), 'evolution-api:8080/': timedOut() } });

    const services = byId((await service.getStatus()).services);

    expect(services['evolution-api']).toMatchObject({ status: 'falha', message: 'Sem resposta em 2,5 s.' });
    expect(services.backend.status).toBe('ativo');
  });

  it('checagem que nunca responde é cortada em 2,5 s e não segura as outras', async () => {
    jest.useFakeTimers();
    const { service } = setup({ routes: { ...healthyRoutes(), 'grafana:3000/api/health': 'never' } });

    const pending = service.getStatus();
    await jest.advanceTimersByTimeAsync(2_500);
    const services = byId((await pending).services);

    expect(services.grafana).toMatchObject({ status: 'falha', message: 'Sem resposta em 2,5 s.' });
    expect(services.prometheus.status).toBe('ativo');
  });

  it('container parado: fora do ar com o motivo', async () => {
    const { service } = setup({ routes: { ...healthyRoutes(), 'evolution-api:8080/': refused() } });

    const services = byId((await service.getStatus()).services);

    expect(services['evolution-api']).toMatchObject({
      status: 'falha',
      message: 'Conexão recusada: o container está parado ou a porta não responde.',
    });
  });

  it('perfis opcionais fora (pgadmin, erp-mysql-dev): sob demanda, nunca fora do ar', async () => {
    const routes = healthyRoutes();
    delete routes['pgadmin:80/misc/ping'];
    const { service } = setup({ routes, tcp: 'refused' });

    const services = byId((await service.getStatus()).services);

    expect(services.pgadmin.status).toBe('demanda');
    expect(services['erp-mysql-dev'].status).toBe('demanda');
    expect(services.pgadmin.message).toBeUndefined();
  });

  it('fila acima do limite: RabbitMQ degradado, nomeando a fila e o número de mensagens', async () => {
    const { service } = setup({
      routes: {
        ...healthyRoutes(),
        'rabbitmq:15672/api/overview': { status: 200, latencyMs: 10, json: { queue_totals: { messages: 1240 } } },
        'rabbitmq:15672/api/queues': {
          status: 200,
          latencyMs: 10,
          json: [{ name: 'notificacoes.whatsapp', messages: 1240 }, { name: 'outra', messages: 0 }],
        },
      },
    });

    const services = byId((await service.getStatus()).services);

    expect(services.rabbitmq).toMatchObject({
      status: 'degradado',
      message: 'Fila notificacoes.whatsapp com 1.240 mensagens acumuladas.',
    });
  });

  it('o limite da fila vem de SERVICE_MAP_RABBIT_QUEUE_WARN; sem a lista de filas, informa o total', async () => {
    const overview = (messages: number): Route => ({
      status: 200,
      latencyMs: 10,
      json: { queue_totals: { messages } },
    });

    const abaixo = setup({
      env: { SERVICE_MAP_RABBIT_QUEUE_WARN: '2000' },
      routes: { ...healthyRoutes(), 'rabbitmq:15672/api/overview': overview(1500) },
    });
    expect(byId((await abaixo.service.getStatus()).services).rabbitmq.status).toBe('ativo');

    const acima = setup({
      env: { SERVICE_MAP_RABBIT_QUEUE_WARN: '2000' },
      routes: { ...healthyRoutes(), 'rabbitmq:15672/api/overview': overview(2500) },
    });
    expect(byId((await acima.service.getStatus()).services).rabbitmq).toMatchObject({
      status: 'degradado',
      message: '2.500 mensagens acumuladas nas filas.',
    });
  });

  it('credenciais recusadas no painel do RabbitMQ: fora do ar explicando as variáveis', async () => {
    const { service } = setup({
      routes: { ...healthyRoutes(), 'rabbitmq:15672/api/overview': { status: 401, latencyMs: 3 } },
    });

    expect(byId((await service.getStatus()).services).rabbitmq).toMatchObject({
      status: 'falha',
      message: expect.stringContaining('RABBITMQ_USER'),
    });
  });

  it('postgres-exporter fora do ar quando o alvo "postgres" do Prometheus está down', async () => {
    const { service } = setup({
      routes: {
        ...healthyRoutes(),
        'prometheus:9090/api/v1/targets': {
          status: 200,
          latencyMs: 5,
          json: {
            data: {
              activeTargets: [
                { labels: { job: 'postgres' }, health: 'down', lastError: 'connection refused' },
              ],
            },
          },
        },
      },
    });

    const services = byId((await service.getStatus()).services);

    expect(services['postgres-exporter']).toMatchObject({
      status: 'falha',
      message: 'O Prometheus não consegue coletar as métricas do Postgres: connection refused',
    });
    expect(services.prometheus.status).toBe('ativo');
  });

  it('erp-lookup: degradado se lento, se "não configurada" (503) ou sem banco do ERP', async () => {
    const run = async (route: Route) =>
      byId((await setup({ routes: { ...healthyRoutes(), 'erp-lookup:3100/health': route } }).service.getStatus()).services)[
        'erp-lookup'
      ];

    expect(await run({ status: 200, latencyMs: 2400, json: { status: 'ok', db: 'ok' } })).toMatchObject({
      status: 'degradado',
      message: 'Consultas ao ERP respondendo em 2,4 s (limite: 2 s).',
    });
    expect((await run({ status: 503, latencyMs: 10 })).status).toBe('degradado');
    expect(
      (await run({ status: 200, latencyMs: 10, json: { status: 'ok', db: 'nao_configurado' } })).status,
    ).toBe('degradado');
    expect((await run({ status: 500, latencyMs: 10 })).status).toBe('falha');
  });

  it('backend degradado quando a memória passa do limite do /health; postgres fora quando o ping falha', async () => {
    const { service, memory } = setup({ dbUp: false });
    memory.checkHeap.mockRejectedValue(new HealthCheckError('heap', {}));

    const services = byId((await service.getStatus()).services);

    expect(services.backend).toMatchObject({ status: 'degradado', message: 'Memória do processo acima de 300 MB.' });
    expect(services.postgres).toMatchObject({ status: 'falha', message: 'O banco não respondeu ao ping.' });
  });

  it('guarda o resultado por 10 s e divide uma rodada entre chamadas simultâneas', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { service, probe } = setup();

    await Promise.all([service.getStatus(), service.getStatus()]);
    const perRound = probe.httpGet.mock.calls.length;

    now += SERVICE_MAP_CACHE_TTL_MS - 1;
    await service.getStatus();
    expect(probe.httpGet).toHaveBeenCalledTimes(perRound);

    now += 2;
    await service.getStatus();
    expect(probe.httpGet).toHaveBeenCalledTimes(perRound * 2);
  });
});
