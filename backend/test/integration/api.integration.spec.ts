import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } from '../../src/common/constants/product';
import { UsersService } from '../../src/modules/users/users.service';

const dbHost = process.env.DB_HOST ?? 'localhost';
const dbPort = Number(process.env.DB_PORT ?? '5432');
const dbUser = process.env.DB_USER ?? 'formhub';
const dbPassword = process.env.DB_PASSWORD ?? 'formhub';
const dbName = process.env.DB_NAME ?? 'formhub_test';
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
    await app.close();
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
});
