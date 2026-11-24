import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';
import { OperationalDashboardService } from './operational-dashboard.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(role: string, areaId?: string): JwtPayload {
  return { sub: 'user-id', email: 'u@test.com', role, areaId: areaId ?? null } as JwtPayload;
}

// Mirrors the seed matrix from 1786000000000-RolesAndPermissions for
// dashboard.view_org.
const DASHBOARD_VIEW_ORG: Record<string, boolean> = {
  ['admin']: true,
  ['manager']: true,
  ['editor']: false,
  ['viewer']: false,
};

type MockQb = Record<string, jest.Mock>;

function makeQb(overrides: Record<string, jest.Mock> = {}): MockQb {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(),
    addSelect: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orWhere: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    getCount: jest.fn().mockResolvedValue(0),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  // chain — every method returns the same qb
  for (const key of Object.keys(qb)) {
    if (key !== 'getCount' && key !== 'getRawMany' && key !== 'getRawOne' && key !== 'getMany') {
      qb[key].mockReturnValue(qb);
    }
  }
  return qb;
}

function makeRepo(qb: MockQb = makeQb(), countResult = 0) {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    count: jest.fn().mockResolvedValue(countResult),
  };
}

type MockRepo = ReturnType<typeof makeRepo>;

function makeService(overrides: Partial<{
  solicitationsRepo: MockRepo;
  historyRepo: MockRepo;
  approvalsRepo: MockRepo;
  stepsRepo: MockRepo;
  flowsRepo: MockRepo;
  flowExecutionsRepo: MockRepo;
  formsRepo: MockRepo;
}> = {}) {
  const solicitationsRepo = overrides.solicitationsRepo ?? makeRepo();
  const historyRepo = overrides.historyRepo ?? makeRepo();
  const approvalsRepo = overrides.approvalsRepo ?? makeRepo();
  const stepsRepo = overrides.stepsRepo ?? makeRepo();
  const flowsRepo = overrides.flowsRepo ?? makeRepo();
  const flowExecutionsRepo = overrides.flowExecutionsRepo ?? makeRepo();
  const formsRepo = overrides.formsRepo ?? makeRepo();

  const permissionsService = {
    hasAny: jest
      .fn()
      .mockImplementation((role: string) => Promise.resolve(DASHBOARD_VIEW_ORG[role] ?? false)),
  };

  const service = new OperationalDashboardService(
    solicitationsRepo as never,
    historyRepo as never,
    approvalsRepo as never,
    stepsRepo as never,
    flowsRepo as never,
    flowExecutionsRepo as never,
    formsRepo as never,
    permissionsService as never,
    // Admin com acesso total; os demais, vínculo com um processo (vê os cards dele).
    fakeProcessAccess({
      resolve: (actor) =>
        grantsFor(actor.sub, actor.role === 'admin', { 'form-1': { 'solicitations.view': 'all' } }),
    }),
  );

  return { service, solicitationsRepo, historyRepo, approvalsRepo, stepsRepo, flowsRepo, flowExecutionsRepo, formsRepo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OperationalDashboardService', () => {
  describe('getOperationalStats — shape', () => {
    it('returns all blocks for admin', async () => {
      const { service } = makeService();
      const result = await service.getOperationalStats(makeActor('admin'));

      expect(result).toHaveProperty('myWork');
      expect(result).toHaveProperty('solicitations');
      expect(result).toHaveProperty('trend');
      expect(result).toHaveProperty('recentActivity');
      expect(result.flows).not.toBeNull();
      expect(result.approvals).not.toBeNull();
    });

    it('returns null flows and approvals for editor', async () => {
      const { service } = makeService();
      const result = await service.getOperationalStats(makeActor('editor', 'area-1'));

      expect(result.flows).toBeNull();
      expect(result.approvals).toBeNull();
    });

    it('returns null flows and approvals for viewer', async () => {
      const { service } = makeService();
      const result = await service.getOperationalStats(makeActor('viewer'));

      expect(result.flows).toBeNull();
      expect(result.approvals).toBeNull();
    });
  });

  describe('trend block', () => {
    it('always returns exactly 30 data points', async () => {
      const { service } = makeService();
      const result = await service.getOperationalStats(makeActor('admin'));

      expect(result.trend.period).toBe('30d');
      expect(result.trend.data).toHaveLength(30);
    });

    it('each trend point has date, created and completed', async () => {
      const { service } = makeService();
      const { trend } = await service.getOperationalStats(makeActor('admin'));

      for (const point of trend.data) {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('created');
        expect(point).toHaveProperty('completed');
        expect(typeof point.created).toBe('number');
        expect(typeof point.completed).toBe('number');
        expect(/^\d{4}-\d{2}-\d{2}$/.test(point.date)).toBe(true);
      }
    });

    it('fills zero for days without data', async () => {
      const qb = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
      const solicitationsRepo = makeRepo(qb);
      const { service } = makeService({ solicitationsRepo });
      const { trend } = await service.getOperationalStats(makeActor('admin'));

      expect(trend.data.every((p) => p.created === 0 && p.completed === 0)).toBe(true);
    });
  });

  describe('pendingApprovals — counts only actor steps', () => {
    it('passes actor sub as uid parameter to step query', async () => {
      const stepsQb = makeQb({ getCount: jest.fn().mockResolvedValue(3) });
      const stepsRepo = makeRepo(stepsQb);
      const { service } = makeService({ stepsRepo });

      const actor = makeActor('editor', 'area-1');
      const result = await service.getOperationalStats(actor);

      expect(result.myWork.pendingApprovals).toBe(3);
      // confirm the where clause received the actor's sub
      const whereCalls = stepsQb.where.mock.calls;
      expect(whereCalls.some((c: unknown[]) =>
        typeof c[1] === 'object' && c[1] !== null && (c[1] as Record<string, unknown>).uid === actor.sub,
      )).toBe(true);
    });
  });

  describe('solicitations block — cards pelo vínculo com os processos', () => {
    it('sem acesso total: os próprios cards e os dos processos com "ver solicitações"', async () => {
      const solQb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue(null),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const solicitationsRepo = makeRepo(solQb);
      const { service } = makeService({ solicitationsRepo });

      const editor = makeActor('editor', 'my-area-id');
      await service.getOperationalStats(editor);

      const andWhereCalls = solQb.andWhere.mock.calls as unknown[][];
      const scoped = andWhereCalls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('solicitation.form_id IN (:...scopeAllFormIds)'),
      );
      expect(scoped).toBe(true);
      // A área não decide mais nada.
      expect(andWhereCalls.some((args) => typeof args[0] === 'string' && args[0].includes('area_id'))).toBe(false);
    });

    it('acesso total: nenhum filtro de escopo', async () => {
      const solQb = makeQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue(null),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const solicitationsRepo = makeRepo(solQb);
      const { service } = makeService({ solicitationsRepo });

      const admin = makeActor('admin');
      await service.getOperationalStats(admin);

      const andWhereCalls = solQb.andWhere.mock.calls as unknown[][];
      expect(andWhereCalls.some((args) => typeof args[0] === 'string' && args[0].includes('scopeActorId'))).toBe(false);
    });
  });

  describe('myWork block', () => {
    it('counts published forms separately', async () => {
      const { FormStatus } = await import('../../common/enums/form-status.enum');
      const formsQb = makeQb({
        getMany: jest.fn().mockResolvedValue([
          { status: FormStatus.PUBLISHED },
          { status: FormStatus.PUBLISHED },
          { status: FormStatus.DRAFT },
        ]),
      });
      const formsRepo = makeRepo(formsQb);
      const { service } = makeService({ formsRepo });

      const result = await service.getOperationalStats(makeActor('editor'));
      expect(result.myWork.myFormsCount).toBe(3);
      expect(result.myWork.myFormsPublished).toBe(2);
    });
  });
});
