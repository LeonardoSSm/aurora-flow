import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import { DemoSeedService } from './demo-seed.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$mockhashmockhash'),
}));

function makeManager(existingIds: Record<string, string> = {}): jest.Mocked<Pick<EntityManager, 'query'>> {
  return {
    query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
      const upper = sql.trim().toUpperCase();

      // Solicitation existence check (COUNT with metadata seed tag via $1 param)
      if (upper.includes('COUNT(*)') && sql.includes('metadata')) {
        return Promise.resolve([{ count: '9' }]);
      }

      // Admin user lookup — always return a user so the rest proceeds
      if (sql.includes('admin@tijucaalimentos.com')) {
        return Promise.resolve([{ id: existingIds['admin'] ?? 'admin-uuid' }]);
      }

      // All other SELECTs return existing data → skip inserts
      if (upper.startsWith('SELECT')) {
        const key = (params?.[0] as string | undefined) ?? 'existing';
        return Promise.resolve([{ id: existingIds[key] ?? 'mock-uuid' }]);
      }

      // INSERT / upsert — should not run when all data exists
      return Promise.resolve([]);
    }),
  };
}

function makeService(nodeEnv: string, manager: ReturnType<typeof makeManager>): DemoSeedService {
  const configService = {
    get: jest.fn().mockReturnValue(nodeEnv),
  } as unknown as ConfigService;

  const dataSource = {
    transaction: jest.fn().mockImplementation(
      async (cb: (em: EntityManager) => Promise<unknown>) => cb(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;

  return new DemoSeedService(dataSource, configService);
}

describe('DemoSeedService', () => {
  describe('seedAll', () => {
    it('throws ForbiddenException and never opens a transaction when NODE_ENV=production', async () => {
      const manager = makeManager();
      const service = makeService('production', manager);

      await expect(service.seedAll()).rejects.toThrow(ForbiddenException);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('returns zero created counts when all data already exists (idempotent)', async () => {
      const manager = makeManager();
      const service = makeService('development', manager);

      const result = await service.seedAll();

      expect(result.success).toBe(true);
      expect(result.created.areas).toBe(0);
      expect(result.created.users).toBe(0);
      expect(result.created.forms).toBe(0);
      expect(result.created.solicitations).toBe(0);
      expect(result.created.flows).toBe(0);

      // No INSERT should have been issued — every query that reached the DB was a SELECT or upsert
      const insertCalls = manager.query.mock.calls.filter((args) => {
        const sql = args[0] as string;
        return sql.trim().toUpperCase().startsWith('INSERT') && !sql.includes('ON CONFLICT');
      });
      expect(insertCalls).toHaveLength(0);
    });
  });
});
