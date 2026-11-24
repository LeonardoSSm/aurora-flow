import type { Response } from 'express';
import { fakeProcessAccess } from '../access/testing/fake-process-access';
import type { Repository } from 'typeorm';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type { ApprovalEntity, AreaEntity, SolicitationEntity } from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { SettingsService } from '../settings/settings.service';
import { ReportsController } from './reports.controller';
import { ExecutiveReportService } from './executive-report.service';
import { ReportFiltersDto } from './dto/report-filters.dto';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'admin-id',
    email: 'admin@formhub.local',
    fullName: 'Admin',
    role: 'admin',
    tokenVersion: 0,
    areaId: null,
    ...overrides,
  };
}

function makeSolicitation(
  overrides: Partial<SolicitationEntity> = {},
): SolicitationEntity {
  return {
    id: 'sol-1',
    title: 'Solicitação teste para o relatório',
    description: null,
    status: SolicitationStatus.OPEN,
    priority: SolicitationPriority.MEDIUM,
    originType: 'manual' as never,
    trackingToken: null,
    formId: null,
    form: null,
    submissionId: null,
    submission: null,
    createdBy: null,
    createdByUser: null,
    assigneeId: null,
    assignee: null,
    metadata: null,
    slaStatus: null,
    slaDueAt: null,
    slaStartedAt: null,
    slaPausedAt: null,
    slaBreachedAt: null,
    slaDurationHours: null,
    slaWarningThresholdPercent: null,
    areaId: null,
    externalRefs: null,
    requesterPhone: null,
    responsiblePhone: null,
    history: [],
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-16T10:00:00.000Z'),
    ...overrides,
  } as SolicitationEntity;
}

// ── QB mock factory ───────────────────────────────────────────────────────────

function makeQb(overrides: {
  rawOne?: unknown;
  rawMany?: unknown[];
  count?: number;
  many?: SolicitationEntity[];
} = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(
      overrides.rawOne ?? {
        total: '3',
        completed: '1',
        slaBreached: '0',
        avgResolutionDays: '1.5',
      },
    ),
    getRawMany: jest.fn().mockResolvedValue(
      overrides.rawMany ?? [{ status: 'open', count: '3' }],
    ),
    getCount: jest.fn().mockResolvedValue(overrides.count ?? 3),
    getMany: jest.fn().mockResolvedValue(overrides.many ?? [makeSolicitation()]),
  };
}

// ── Service factory ───────────────────────────────────────────────────────────

function makeService(opts: {
  solQbFactory?: () => ReturnType<typeof makeQb>;
  approvalCount?: number;
  orgName?: string;
} = {}) {
  let solCallIdx = 0;
  const solQbs = [
    makeQb(),  // summary
    makeQb({ rawMany: [{ status: 'open', count: '3' }] }), // status
    makeQb({ rawMany: [] }), // area
    makeQb({ count: 3 }),    // total count
    makeQb({ many: [makeSolicitation()] }), // sol list
  ];

  const solicitationsRepo = {
    createQueryBuilder: jest.fn().mockImplementation(() => {
      const qb = opts.solQbFactory?.() ?? solQbs[solCallIdx] ?? makeQb();
      solCallIdx++;
      return qb;
    }),
  } as unknown as jest.Mocked<Repository<SolicitationEntity>>;

  const areasRepo = {
    findBy: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<AreaEntity>>;

  const approvalsQb = makeQb({ count: opts.approvalCount ?? 2 });
  const approvalsRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(approvalsQb),
  } as unknown as jest.Mocked<Repository<ApprovalEntity>>;

  const settingsService = {
    getValue: jest.fn().mockResolvedValue(opts.orgName ?? 'FormHub Testes'),
  } as unknown as jest.Mocked<SettingsService>;

  const service = new ExecutiveReportService(
    solicitationsRepo,
    areasRepo,
    approvalsRepo,
    settingsService,
    // O relatório cobre os cards que a pessoa vê; aqui, acesso total.
    fakeProcessAccess({ everyoneFullAccess: true }),
  );

  return { service, solicitationsRepo, areasRepo, settingsService };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecutiveReportService.generateSolicitationsReport', () => {
  it('retorna Buffer não vazio com magic bytes %PDF', async () => {
    const { service } = makeService();

    const buffer = await service.generateSolicitationsReport(
      new ReportFiltersDto(),
      makeActor(),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  }, 15000);

  it('retorna Buffer com filtros de período aplicados', async () => {
    const { service } = makeService();
    const filters = Object.assign(new ReportFiltersDto(), {
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });

    const buffer = await service.generateSolicitationsReport(filters, makeActor());

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
  }, 15000);

  it('filtro de área é aplicado corretamente nos QueryBuilders', async () => {
    // Capture the andWhere calls on the first QB (summary)
    const capturedCalls: [string, unknown][] = [];
    let firstQb: ReturnType<typeof makeQb> | null = null;

    const { service, solicitationsRepo } = makeService({
      solQbFactory: () => {
        const qb = makeQb();
        if (!firstQb) {
          firstQb = qb;
          const origAndWhere = qb.andWhere.bind(qb);
          qb.andWhere = jest.fn().mockImplementation((clause: string, params: unknown) => {
            capturedCalls.push([clause, params]);
            return origAndWhere(clause, params);
          });
        }
        return qb;
      },
    });

    const filters = Object.assign(new ReportFiltersDto(), {
      areaId: 'area-uuid-123',
    });
    await service.generateSolicitationsReport(filters, makeActor({ role: 'manager', areaId: null }));

    // At least one QB should have the area filter applied
    const hasAreaFilter = capturedCalls.some(
      ([clause]) => typeof clause === 'string' && clause.includes('area_id') && clause.includes('rptAreaId'),
    );
    expect(hasAreaFilter).toBe(true);

    expect(solicitationsRepo.createQueryBuilder).toHaveBeenCalledTimes(5);
  }, 15000);

  it('nota de rodapé presente quando totalCount > 200', async () => {
    let callIdx = 0;
    const service = makeService({
      solQbFactory: () => {
        const idx = callIdx++;
        if (idx === 3) return makeQb({ count: 350 }); // totalCount query
        if (idx === 4) return makeQb({ many: Array.from({ length: 200 }, (_, i) => makeSolicitation({ id: `sol-${i}` })) });
        return makeQb();
      },
    }).service;

    const buffer = await service.generateSolicitationsReport(new ReportFiltersDto(), makeActor());

    expect(buffer.length).toBeGreaterThan(500);
  }, 20000);

  it('gera PDF sem área quando filtro de área não está aplicado e areaRows é vazio', async () => {
    const { service } = makeService();
    const buffer = await service.generateSolicitationsReport(new ReportFiltersDto(), makeActor());
    expect(buffer.length).toBeGreaterThan(500);
  }, 15000);
});

// ── Controller tests ──────────────────────────────────────────────────────────

describe('ReportsController.generateExecutiveReport', () => {
  it('chama o service e responde com Content-Type application/pdf', async () => {
    const fakeBuffer = Buffer.from('%PDF-test');
    const mockService = {
      generateSolicitationsReport: jest.fn().mockResolvedValue(fakeBuffer),
    } as unknown as ExecutiveReportService;

    const controller = new ReportsController(mockService);

    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as Response;

    await controller.generateExecutiveReport(
      new ReportFiltersDto(),
      makeActor(),
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="relatorio-solicitacoes.pdf"',
    );
    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
  });

  it('repassa os filtros recebidos ao service', async () => {
    const fakeBuffer = Buffer.from('%PDF-test');
    const mockService = {
      generateSolicitationsReport: jest.fn().mockResolvedValue(fakeBuffer),
    } as unknown as ExecutiveReportService;

    const controller = new ReportsController(mockService);
    const res = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response;
    const filters = Object.assign(new ReportFiltersDto(), { areaId: 'area-id-xyz' });
    const actor = makeActor({ role: 'manager' });

    await controller.generateExecutiveReport(filters, actor, res);

    expect(mockService.generateSolicitationsReport).toHaveBeenCalledWith(filters, actor);
  });
});
