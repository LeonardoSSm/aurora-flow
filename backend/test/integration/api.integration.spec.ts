import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { Client } from 'pg';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_DEV_PASSWORD as SEED_ADMIN_PASSWORD } from '../../src/common/constants/product';
import { UsersService } from '../../src/modules/users/users.service';
import { FlowsScheduledTriggerService } from '../../src/modules/flows/flows-scheduled-trigger.service';

const dbHost = process.env.DB_HOST ?? 'localhost';
const dbPort = Number(process.env.DB_PORT ?? '5432');
const dbUser = process.env.DB_USER ?? 'aurora_flow';
const dbPassword = process.env.DB_PASSWORD ?? 'aurora_flow';
const dbName = process.env.DB_NAME ?? 'aurora_flow_test';
const apiPrefix = process.env.API_PREFIX ?? 'api';

async function ensureTestDatabase(): Promise<void> {
  const adminClient = new Client({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: 'postgres',
  });

  await adminClient.connect();
  try {
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await adminClient.end();
  }
}

async function resetSchema(): Promise<void> {
  const client = new Client({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

describe('API Integration — Aurora Flow', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    await resetSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(apiPrefix);
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    const usersService = app.get(UsersService);
    await usersService.ensureSeedAdmin();
  });

  afterAll(async () => {
    if (app) await app.close();
    await resetSchema();
  });

  function withIp<T extends request.Test>(testRequest: T, ipAddress: string) {
    return testRequest.set('X-Forwarded-For', ipAddress);
  }

  it('GET /api/health should return service status', async () => {
    const response = await request(app.getHttpServer()).get(`/${apiPrefix}/health`).expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('aurora-flow-backend');
  });

  it('POST /api/auth/login should authenticate seeded admin user', async () => {
    const response = await request(app.getHttpServer())
      .post(`/${apiPrefix}/auth/login`)
      .send({
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.email).toBe(SEED_ADMIN_EMAIL);
    expect(response.body.permissions['flows.view']).toBeDefined();
    expect(response.body.permissions['flows.manage']).toBeDefined();

    token = response.body.accessToken as string;
  });

  it('POST /api/auth/logout revoga o refresh token mandado no corpo', async () => {
    const login = await withIp(request(app.getHttpServer()).post(`/${apiPrefix}/auth/login`), '10.20.0.1')
      .send({ email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD })
      .expect(200);
    const { accessToken, refreshToken } = login.body as { accessToken: string; refreshToken: string };

    await request(app.getHttpServer())
      .post(`/${apiPrefix}/auth/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/${apiPrefix}/auth/refresh`)
      .send({ refreshToken })
      .expect(401);
  });

  it('rotas de formulário público não são mais expostas', async () => {
    await request(app.getHttpServer()).get(`/${apiPrefix}/public/forms/qualquer`).expect(404);
  });

  it('cria, lista e obtém um fluxo independente', async () => {
    const created = await request(app.getHttpServer())
      .post(`/${apiPrefix}/flows`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Fluxo webhook ciclo 01',
        isActive: false,
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger_webhook_received',
            position: { x: 0, y: 0 },
            data: { label: 'Entrada' },
          },
        ],
        edges: [],
      })
      .expect(201);

    expect(created.body.id).toBeDefined();
    expect(created.body.name).toBe('Fluxo webhook ciclo 01');

    const listed = await request(app.getHttpServer())
      .get(`/${apiPrefix}/flows`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listed.body.data.some((flow: { id: string }) => flow.id === created.body.id)).toBe(true);

    const one = await request(app.getHttpServer())
      .get(`/${apiPrefix}/flows/${created.body.id as string}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(one.body.id).toBe(created.body.id);
  });

  it('recusa criar fluxo sem autenticação', async () => {
    await request(app.getHttpServer())
      .post(`/${apiPrefix}/flows`)
      .send({ name: 'sem token', nodes: [], edges: [] })
      .expect(401);
  });

  it('recusa persistir nós descontinuados de formulário/processo', async () => {
    const response = await request(app.getHttpServer())
      .post(`/${apiPrefix}/flows`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Fluxo legado',
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger_form_submit',
            position: { x: 0, y: 0 },
            data: { label: 'Envio' },
          },
        ],
        edges: [],
      })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/trigger_form_submit|ENABLED|whitelist|type/i);
  });

  it('executa fluxo real por webhook e HTTP local (não é o endpoint /test)', async () => {
    const hits: Array<{ method: string; url: string; body: string }> = [];
    const mock = await listenLocal((req, res, body) => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', source: 'local-mock' }));
    });

    try {
      const endpoint = await request(app.getHttpServer())
        .post(`/${apiPrefix}/webhooks/endpoints`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ciclo-02-webhook', flowTriggerEnabled: true })
        .expect(201);

      const created = await request(app.getHttpServer())
        .post(`/${apiPrefix}/flows`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Ciclo 02 webhook HTTP',
          isActive: true,
          nodes: [
            {
              id: 't1',
              type: 'trigger_webhook_received',
              position: { x: 0, y: 0 },
              data: { endpointId: endpoint.body.id },
            },
            {
              id: 'h1',
              type: 'action_http_check',
              position: { x: 160, y: 0 },
              data: { url: `http://127.0.0.1:${mock.port}/probe`, method: 'GET' },
            },
            {
              id: 'c1',
              type: 'condition_response_value',
              position: { x: 320, y: 0 },
              data: { path: 'status', operator: 'equals', value: 'ok' },
            },
            {
              id: 'h2',
              type: 'action_http_check',
              position: { x: 480, y: 0 },
              data: { url: `http://127.0.0.1:${mock.port}/yes`, method: 'POST' },
            },
          ],
          edges: [
            { id: 'e1', source: 't1', target: 'h1' },
            { id: 'e2', source: 'h1', target: 'c1' },
            { id: 'e3', source: 'c1', target: 'h2', sourceHandle: 'yes' },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/${apiPrefix}/webhooks/in/${endpoint.body.token as string}`)
        .send({ kind: 'order', amount: 10 })
        .expect(200);

      const executions = await waitFor(async () => {
        const listed = await request(app.getHttpServer())
          .get(`/${apiPrefix}/flows/${created.body.id as string}/executions`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        if (!listed.body.data?.length) return null;
        return listed.body.data as Array<{ status?: string; results?: unknown }>;
      });

      expect(executions.length).toBeGreaterThan(0);
      expect(hits.some((hit) => hit.url === '/probe' && hit.method === 'GET')).toBe(true);
      expect(hits.some((hit) => hit.url === '/yes' && hit.method === 'POST')).toBe(true);
    } finally {
      await mock.close();
    }
  });

  it('executa fluxo real por agendamento (poller, não /test)', async () => {
    const hits: string[] = [];
    const mock = await listenLocal((_req, res) => {
      hits.push('scheduled');
      res.writeHead(204);
      res.end();
    });

    try {
      const created = await request(app.getHttpServer())
        .post(`/${apiPrefix}/flows`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Ciclo 02 agendado',
          isActive: true,
          nodes: [
            {
              id: 't1',
              type: 'trigger_scheduled',
              position: { x: 0, y: 0 },
              data: { mode: 'interval', intervalValue: 1, intervalUnit: 'minutes' },
            },
            {
              id: 'h1',
              type: 'action_http_check',
              position: { x: 200, y: 0 },
              data: { url: `http://127.0.0.1:${mock.port}/tick`, method: 'GET' },
            },
          ],
          edges: [{ id: 'e1', source: 't1', target: 'h1' }],
        })
        .expect(201);

      const client = new Client({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
      });
      await client.connect();
      try {
        await client.query('UPDATE flows SET next_run_at = NOW() - INTERVAL \'1 minute\' WHERE id = $1', [
          created.body.id,
        ]);
      } finally {
        await client.end();
      }

      await app.get(FlowsScheduledTriggerService).pollDueFlows();

      await waitFor(async () => (hits.length > 0 ? hits : null));

      const listed = await request(app.getHttpServer())
        .get(`/${apiPrefix}/flows/${created.body.id as string}/executions`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listed.body.data.length).toBeGreaterThan(0);
    } finally {
      await mock.close();
    }
  });
});

async function listenLocal(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock HTTP sem porta');
  return {
    port: address.port,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 15000): Promise<T> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error('timeout aguardando execução real do fluxo');
}
