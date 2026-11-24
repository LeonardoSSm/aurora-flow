import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { In, type DataSource, type EntityManager } from 'typeorm';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  ApprovalDecisionEntity,
  ApprovalEntity,
  ApprovalStepEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ApprovalsService, orderApprovalSteps } from './approvals.service';

// Mirrors the seed matrix from 1786000000000-RolesAndPermissions for
// approvals.decide and approvals.manage.
const APPROVALS_DECIDE_SCOPE: Record<string, 'all' | 'assigned' | 'none'> = {
  ['admin']: 'all',
  ['manager']: 'all',
  ['editor']: 'assigned',
  ['viewer']: 'assigned',
};

const APPROVALS_MANAGE: Record<string, boolean> = {
  ['admin']: true,
  ['manager']: true,
  ['editor']: false,
  ['viewer']: false,
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-id',
    email: 'user@formhub.local',
    fullName: 'User',
    role: 'admin',
    tokenVersion: 0,
    ...overrides,
  };
}

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    title: 'Solicitação Teste',
    description: null,
    status: SolicitationStatus.IN_ANALYSIS,
    priority: 'medium' as never,
    originType: 'manual' as never,
    formId: null,
    form: null,
    submissionId: null,
    submission: null,
    createdBy: 'user-id',
    createdByUser: null,
    assigneeId: null,
    assignee: null,
    metadata: null,
    history: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as SolicitationEntity;
}

function makeApproval(overrides: Partial<ApprovalEntity> = {}): ApprovalEntity {
  return {
    id: 'approval-id',
    solicitationId: 'solicitation-id',
    status: ApprovalStatus.PENDING,
    mode: 'parallel',
    title: 'Aprovação Teste',
    description: null,
    requiredDecisions: 1,
    completedAt: null,
    cancelledAt: null,
    createdBy: 'user-id',
    createdByUser: null,
    steps: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as ApprovalEntity;
}

function makeStep(overrides: Partial<ApprovalStepEntity> = {}): ApprovalStepEntity {
  return {
    id: 'step-id',
    approvalId: 'approval-id',
    assignedUserId: 'user-id',
    assignedUser: null,
    status: ApprovalStepStatus.PENDING,
    order: 1,
    decidedAt: null,
    decision: null,
    approval: makeApproval(),
    ...overrides,
  } as ApprovalStepEntity;
}

// ── Mock factories ────────────────────────────────────────────────────────────

function makeWriteRepo() {
  return {
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest
      .fn()
      .mockImplementation((entity: object) => Promise.resolve({ id: 'generated-id', ...entity })),
  };
}

function makeManager(
  overrides: {
    findOne?: jest.Mock;
    findOneOrFail?: jest.Mock;
    find?: jest.Mock;
    count?: jest.Mock;
  } = {},
) {
  const approvalWriteRepo = makeWriteRepo();
  const stepWriteRepo = makeWriteRepo();
  const decisionWriteRepo = makeWriteRepo();
  const solicitationWriteRepo = makeWriteRepo();
  const historyWriteRepo = makeWriteRepo();

  const manager = {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    findOneOrFail: overrides.findOneOrFail ?? jest.fn().mockRejectedValue(new Error('not mocked')),
    find: overrides.find ?? jest.fn().mockResolvedValue([]),
    count: overrides.count ?? jest.fn().mockResolvedValue(0),
    getRepository: jest.fn().mockImplementation((entity: unknown) => {
      if (entity === ApprovalEntity) return approvalWriteRepo;
      if (entity === ApprovalStepEntity) return stepWriteRepo;
      if (entity === ApprovalDecisionEntity) return decisionWriteRepo;
      if (entity === SolicitationEntity) return solicitationWriteRepo;
      if (entity === SolicitationHistoryEntity) return historyWriteRepo;
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }),
  };

  return {
    manager,
    approvalWriteRepo,
    stepWriteRepo,
    decisionWriteRepo,
    solicitationWriteRepo,
    historyWriteRepo,
  };
}

function makeDataSource(manager: unknown) {
  return {
    transaction: jest
      .fn()
      .mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) =>
        cb(manager as EntityManager),
      ),
  };
}

function makeService() {
  const eventEmitter: Partial<EventEmitter2> = { emit: jest.fn() };

  const approvalsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOneOrFail: jest.fn(),
    count: jest.fn().mockResolvedValue(1),
    manager: { getRepository: jest.fn() },
  };
  const stepsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOneOrFail: jest.fn(),
  };
  const usersRepo = {
    find: jest.fn().mockResolvedValue([]),
  };
  const metricsService = {
    setApprovalsPendingTotal: jest.fn(),
    incrementApprovalsDecided: jest.fn(),
  };
  const permissionsService = {
    getScope: jest
      .fn()
      .mockImplementation((role: string) =>
        Promise.resolve(APPROVALS_DECIDE_SCOPE[role] ?? 'none'),
      ),
    hasAny: jest
      .fn()
      .mockImplementation((role: string) => Promise.resolve(APPROVALS_MANAGE[role] ?? false)),
  };

  // DataSource and manager are set up per test — start with a noop
  const { manager, ...repos } = makeManager();
  const dataSource = makeDataSource(manager);

  const service = new ApprovalsService(
    dataSource as unknown as DataSource,
    eventEmitter as EventEmitter2,
    approvalsRepo as never,
    stepsRepo as never,
    usersRepo as never,
    metricsService as never,
    permissionsService as never,
  );

  return {
    service,
    eventEmitter,
    usersRepo,
    approvalsRepo,
    stepsRepo,
    metricsService,
    permissionsService,
    dataSource,
    manager,
    ...repos,
  };
}

// ── createApproval ────────────────────────────────────────────────────────────

describe('ApprovalsService.createApproval', () => {
  it('cria approval e um step por userId em assignedUserIds', async () => {
    const { service, eventEmitter, approvalsRepo, metricsService, dataSource } = makeService();

    const solicitation = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    const savedApproval = makeApproval({ id: 'approval-id' });
    const approvalWithSteps = makeApproval({ id: 'approval-id', steps: [makeStep()] });

    const { manager, approvalWriteRepo, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockResolvedValue(solicitation),
    });
    approvalWriteRepo.save.mockResolvedValue(savedApproval);
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    approvalsRepo.findOneOrFail.mockResolvedValue(approvalWithSteps);

    const dto = { title: 'Aprovação', assignedUserIds: ['approver-1', 'approver-2'] };
    const result = await service.createApproval('solicitation-id', dto, makeActor());

    expect(result).toBe(approvalWithSteps);
    expect(stepWriteRepo.create).toHaveBeenCalledTimes(2);
    expect(stepWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'approver-1', order: 1 }),
    );
    expect(stepWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'approver-2', order: 2 }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.created',
      expect.objectContaining({
        approvalId: 'approval-id',
        assignedUserIds: ['approver-1', 'approver-2'],
      }),
    );
    expect(approvalsRepo.count).toHaveBeenCalledWith({
      where: { status: ApprovalStatus.PENDING },
    });
    expect(metricsService.setApprovalsPendingTotal).toHaveBeenCalledWith(1);
  });

  it('atualiza status da solicitação para waiting_approval', async () => {
    const { service, approvalsRepo, dataSource } = makeService();

    const solicitation = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    const savedApproval = makeApproval({ id: 'approval-id' });

    const { manager, solicitationWriteRepo } = makeManager({
      findOne: jest.fn().mockResolvedValue(solicitation),
    });
    manager.getRepository(ApprovalEntity).save.mockResolvedValue(savedApproval);
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    approvalsRepo.findOneOrFail.mockResolvedValue(makeApproval());

    await service.createApproval(
      'solicitation-id',
      { title: 'Aprovação', assignedUserIds: ['approver-1'] },
      makeActor(),
    );

    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.WAITING_APPROVAL }),
    );
  });

  it('lança NotFoundException se solicitação não existe', async () => {
    const { service, dataSource } = makeService();

    const { manager } = makeManager({ findOne: jest.fn().mockResolvedValue(null) });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.createApproval(
        'solicitation-id',
        { title: 'Aprovação', assignedUserIds: ['approver-1'] },
        makeActor(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    SolicitationStatus.COMPLETED,
    SolicitationStatus.CANCELLED,
    SolicitationStatus.REJECTED,
  ])('lança BadRequestException para status terminal "%s"', async (terminalStatus) => {
    const { service, dataSource } = makeService();

    const { manager } = makeManager({
      findOne: jest.fn().mockResolvedValue(makeSolicitation({ status: terminalStatus })),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.createApproval(
        'solicitation-id',
        { title: 'Aprovação', assignedUserIds: ['approver-1'] },
        makeActor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException se não há assignedUserIds nem assignedRoleCodes', async () => {
    const { service } = makeService();

    await expect(
      service.createApproval('solicitation-id', { title: 'Aprovação' } as never, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aprovação de fase (phaseId setado): cria step por role e NÃO altera solicitation.status', async () => {
    const { service, approvalsRepo, dataSource, usersRepo } = makeService();

    const solicitation = makeSolicitation({ status: SolicitationStatus.IN_PROGRESS });
    const savedApproval = makeApproval({ id: 'approval-id', phaseId: 'phase-1' });

    const { manager, solicitationWriteRepo, historyWriteRepo, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === SolicitationEntity) return solicitation;
        if (entity === ApprovalEntity) return null; // sem aprovação pendente para a fase
        return null;
      }),
    });
    manager.getRepository(ApprovalEntity).save.mockResolvedValue(savedApproval);
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    approvalsRepo.findOneOrFail.mockResolvedValue(makeApproval({ phaseId: 'phase-1' }));

    await service.createApproval(
      'solicitation-id',
      { title: 'Aprovação de fase', phaseId: 'phase-1', assignedRoleCodes: ['supervisor'] },
      makeActor(),
    );

    expect(stepWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedRoleCode: 'supervisor', order: 1 }),
    );
    expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: SolicitationHistoryEventType.PHASE_APPROVAL_REQUESTED }),
    );
    // Ninguém tem assignedUserId numa etapa roteada por papel — sem resolver
    // usuários ativos com esse papel, o Supervisor nunca seria notificado.
    expect(usersRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: In(['supervisor']), isActive: true } }),
    );
  });

  it('rejeita criar uma segunda aprovação pendente para a mesma fase', async () => {
    const { service, dataSource } = makeService();

    const solicitation = makeSolicitation({ status: SolicitationStatus.IN_PROGRESS });
    const existingPendingPhaseApproval = makeApproval({
      id: 'approval-existing',
      phaseId: 'phase-1',
      status: ApprovalStatus.PENDING,
    });

    const { manager } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === SolicitationEntity) return solicitation;
        if (entity === ApprovalEntity) return existingPendingPhaseApproval;
        return null;
      }),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.createApproval(
        'solicitation-id',
        { title: 'Aprovação de fase', phaseId: 'phase-1', assignedRoleCodes: ['supervisor'] },
        makeActor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── approveStep ───────────────────────────────────────────────────────────────

describe('ApprovalsService.approveStep', () => {
  it('aprovação com todos os steps aprovados → Approval APPROVED, Solicitação approved', async () => {
    const { service, eventEmitter, stepsRepo, metricsService, dataSource } = makeService();

    const step = makeStep({
      status: ApprovalStepStatus.PENDING,
      assignedUserId: 'user-id',
      decision: null,
    });
    const approval = makeApproval({ status: ApprovalStatus.PENDING, requiredDecisions: 1 });
    const solicitation = makeSolicitation({ status: SolicitationStatus.WAITING_APPROVAL });
    const stepWithDecision = makeStep({ status: ApprovalStepStatus.APPROVED });

    const { manager, approvalWriteRepo, solicitationWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalEntity) return approval;
        if (entity === SolicitationEntity) return solicitation;
        throw new Error('unexpected');
      }),
      count: jest.fn().mockResolvedValue(1), // 1 approved step >= requiredDecisions: 1
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(stepWithDecision);

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(approvalWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStatus.APPROVED }),
    );
    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.APPROVED }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.approved',
      expect.objectContaining({ approvalId: 'approval-id' }),
    );
    expect(metricsService.setApprovalsPendingTotal).toHaveBeenCalledWith(1);
  });

  it('rejeição de um step → Approval REJECTED, Solicitação rejected, steps restantes SKIPPED', async () => {
    const { service, eventEmitter, stepsRepo, dataSource } = makeService();

    const step = makeStep({
      status: ApprovalStepStatus.PENDING,
      assignedUserId: 'user-id',
      decision: null,
    });
    const otherPendingStep = makeStep({ id: 'step-2', status: ApprovalStepStatus.PENDING });
    const approval = makeApproval({ status: ApprovalStatus.PENDING });
    const solicitation = makeSolicitation({ status: SolicitationStatus.WAITING_APPROVAL });

    const { manager, approvalWriteRepo, stepWriteRepo, solicitationWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalEntity) return approval;
        if (entity === SolicitationEntity) return solicitation;
        throw new Error('unexpected');
      }),
      find: jest.fn().mockResolvedValue([otherPendingStep]),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.REJECTED }));

    await service.approveStep(
      'step-id',
      { decision: 'rejected', comment: 'Não aprovado.' },
      makeActor(),
    );

    expect(approvalWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStatus.REJECTED }),
    );
    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.REJECTED }),
    );
    expect(stepWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStepStatus.SKIPPED }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.rejected',
      expect.objectContaining({ approvalId: 'approval-id', stepId: 'step-id' }),
    );
  });

  it('rejeição sem comentário → BadRequestException antes de qualquer acesso ao banco', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.approveStep('step-id', { decision: 'rejected' }, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('usuário não atribuído ao step → ForbiddenException', async () => {
    const { service, dataSource } = makeService();

    const step = makeStep({ assignedUserId: 'other-user', decision: null });
    const { manager } = makeManager({ findOne: jest.fn().mockResolvedValue(step) });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.approveStep(
        'step-id',
        { decision: 'approved' },
        makeActor({ sub: 'not-assigned-user' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('step não encontrado → NotFoundException', async () => {
    const { service, dataSource } = makeService();

    const { manager } = makeManager({ findOne: jest.fn().mockResolvedValue(null) });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.approveStep('step-id', { decision: 'approved' }, makeActor()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('step já decidido (status não PENDING) → BadRequestException', async () => {
    const { service, dataSource } = makeService();

    const step = makeStep({
      status: ApprovalStepStatus.APPROVED,
      assignedUserId: 'user-id',
      decision: null,
    });
    const { manager } = makeManager({ findOne: jest.fn().mockResolvedValue(step) });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.approveStep('step-id', { decision: 'approved' }, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decisão duplicada (step com decision já salva) → BadRequestException', async () => {
    const { service, dataSource } = makeService();

    const existingDecision = { id: 'decision-id', decision: 'approved' } as ApprovalDecisionEntity;
    const step = makeStep({ status: ApprovalStepStatus.PENDING, assignedUserId: 'user-id' });
    const { manager } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return existingDecision;
        return step;
      }),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.approveStep('step-id', { decision: 'approved' }, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não emite evento quando a aprovação ainda não foi concluída (steps restantes)', async () => {
    const { service, eventEmitter, stepsRepo, dataSource } = makeService();

    const step = makeStep({
      status: ApprovalStepStatus.PENDING,
      assignedUserId: 'user-id',
      decision: null,
    });
    const approval = makeApproval({ status: ApprovalStatus.PENDING, requiredDecisions: 3 });

    const { manager } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockResolvedValue(approval),
      count: jest.fn().mockResolvedValue(1), // 1 < requiredDecisions: 3
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('step roteado por assignedRoleCode: usuário com esse perfil decide mesmo sem assignedUserId', async () => {
    const { service, stepsRepo, dataSource } = makeService();

    const step = makeStep({
      assignedUserId: null,
      assignedRoleCode: 'supervisor',
      status: ApprovalStepStatus.PENDING,
      decision: null,
    });
    const approval = makeApproval({ status: ApprovalStatus.PENDING, requiredDecisions: 1 });
    const solicitation = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    const stepWithDecision = makeStep({ status: ApprovalStepStatus.APPROVED });

    const { manager } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalEntity) return approval;
        if (entity === SolicitationEntity) return solicitation;
        throw new Error('unexpected');
      }),
      count: jest.fn().mockResolvedValue(1),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(stepWithDecision);

    const result = await service.approveStep(
      'step-id',
      { decision: 'approved' },
      makeActor({ sub: 'someone-else', role: 'supervisor' }),
    );

    expect(result).toBe(stepWithDecision);
  });

  it('rejeita quem não é o assignedUserId nem tem o assignedRoleCode da etapa', async () => {
    const { service, dataSource } = makeService();

    const step = makeStep({
      assignedUserId: null,
      assignedRoleCode: 'supervisor',
      status: ApprovalStepStatus.PENDING,
      decision: null,
    });

    const { manager } = makeManager({
      findOne: jest.fn().mockResolvedValue(step),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      service.approveStep(
        'step-id',
        { decision: 'approved' },
        makeActor({ sub: 'someone-else', role: 'operador' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('conclui aprovação de fase sem alterar solicitation.status e registra PHASE_APPROVAL_APPROVED', async () => {
    const { service, stepsRepo, dataSource } = makeService();

    const step = makeStep({
      assignedUserId: null,
      assignedRoleCode: 'supervisor',
      status: ApprovalStepStatus.PENDING,
      decision: null,
    });
    const approval = makeApproval({
      status: ApprovalStatus.PENDING,
      requiredDecisions: 1,
      phaseId: 'phase-1',
    });
    const stepWithDecision = makeStep({ status: ApprovalStepStatus.APPROVED });

    const { manager, solicitationWriteRepo, historyWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalEntity) return approval;
        throw new Error('solicitation não deveria ser buscada para aprovação de fase');
      }),
      count: jest.fn().mockResolvedValue(1),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(stepWithDecision);

    await service.approveStep(
      'step-id',
      { decision: 'approved' },
      makeActor({ role: 'supervisor' }),
    );

    expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: SolicitationHistoryEventType.PHASE_APPROVAL_APPROVED }),
    );
  });
});

// ── cancelApproval ────────────────────────────────────────────────────────────

describe('ApprovalsService.cancelApproval', () => {
  it('cancela approval e marca steps pendentes como SKIPPED', async () => {
    const { service, eventEmitter, approvalsRepo, dataSource } = makeService();

    const approval = makeApproval({ status: ApprovalStatus.PENDING });
    const pendingStep = makeStep({ status: ApprovalStepStatus.PENDING });
    const cancelledApproval = makeApproval({ status: ApprovalStatus.CANCELLED });

    const { manager, approvalWriteRepo, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockResolvedValue(approval),
      find: jest.fn().mockResolvedValue([pendingStep]),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    approvalsRepo.findOneOrFail.mockResolvedValue(cancelledApproval);

    const result = await service.cancelApproval('approval-id', makeActor());

    expect(result).toBe(cancelledApproval);
    expect(approvalWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStatus.CANCELLED, cancelledAt: expect.any(Date) }),
    );
    expect(stepWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStepStatus.SKIPPED }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.cancelled',
      expect.objectContaining({ approvalId: 'approval-id', solicitationId: 'solicitation-id' }),
    );
  });

  // Quem pode cancelar ("pedir e cancelar aprovações" no processo do card) é conferido na rota:
  // ver approvals.controller.spec.ts.

  it('approval não encontrada → NotFoundException', async () => {
    const { service, dataSource } = makeService();

    const { manager } = makeManager({ findOne: jest.fn().mockResolvedValue(null) });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(service.cancelApproval('approval-id', makeActor())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('approval já concluída não pode ser cancelada → BadRequestException', async () => {
    const { service, dataSource } = makeService();

    const { manager } = makeManager({
      findOne: jest.fn().mockResolvedValue(makeApproval({ status: ApprovalStatus.APPROVED })),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(service.cancelApproval('approval-id', makeActor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// ── findMyPending ─────────────────────────────────────────────────────────────

describe('ApprovalsService.findMyPending', () => {
  it('retorna steps PENDING atribuídos ao userId via stepsRepo', async () => {
    const { service, stepsRepo } = makeService();
    const steps = [makeStep(), makeStep({ id: 'step-2' })];
    stepsRepo.find.mockResolvedValue(steps);

    const result = await service.findMyPending(makeActor());

    expect(result).toBe(steps);
    expect(stepsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { assignedUserId: 'user-id', status: ApprovalStepStatus.PENDING },
          { assignedRoleCode: 'admin', status: ApprovalStepStatus.PENDING },
        ],
      }),
    );
  });

  it('retorna lista vazia quando não há steps pendentes', async () => {
    const { service, stepsRepo } = makeService();
    stepsRepo.find.mockResolvedValue([]);

    const result = await service.findMyPending(makeActor());

    expect(result).toEqual([]);
  });
});

// ── findBySolicitation ────────────────────────────────────────────────────────

describe('ApprovalsService.findBySolicitation', () => {
  it('admin (scope all) vê todas as aprovações da solicitação', async () => {
    const { service, approvalsRepo } = makeService();
    const approvals = [makeApproval(), makeApproval({ id: 'approval-2' })];
    approvalsRepo.find.mockResolvedValue(approvals);

    const result = await service.findBySolicitation('solicitation-id', makeActor());

    expect(result).toBe(approvals);
    expect(approvalsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { solicitationId: 'solicitation-id' },
      }),
    );
  });

  it('pede as etapas ordenadas (a fila do modo sequencial aparece na ordem de decisão)', async () => {
    const { service, approvalsRepo } = makeService();
    approvalsRepo.find.mockResolvedValue([]);

    await service.findBySolicitation('solicitation-id', makeActor());

    expect(approvalsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'ASC', steps: { order: 'ASC' } } }),
    );
  });

  it('viewer (scope assigned) só vê aprovações com step atribuído a ele', async () => {
    const { service, approvalsRepo } = makeService();
    const assignedApproval = makeApproval({
      id: 'approval-assigned',
      steps: [makeStep({ assignedUserId: 'viewer-id' })],
    });
    const otherApproval = makeApproval({
      id: 'approval-other',
      steps: [makeStep({ assignedUserId: 'someone-else' })],
    });
    approvalsRepo.find.mockResolvedValue([assignedApproval, otherApproval]);

    const result = await service.findBySolicitation(
      'solicitation-id',
      makeActor({ role: 'viewer', sub: 'viewer-id' }),
    );

    expect(result).toEqual([assignedApproval]);
  });

  it('escopo all em card que a pessoa não enxerga: só as aprovações em que ela é chamada', async () => {
    const { service, approvalsRepo } = makeService();
    const mine = makeApproval({ id: 'mine', steps: [makeStep({ assignedUserId: 'user-id' })] });
    const other = makeApproval({ id: 'other', steps: [makeStep({ assignedUserId: 'x' })] });
    approvalsRepo.find.mockResolvedValue([mine, other]);
    const canSee = jest.fn().mockResolvedValue(false);

    const result = await service.findBySolicitation('solicitation-id', makeActor(), canSee);

    expect(canSee).toHaveBeenCalled();
    expect(result).toEqual([mine]);
  });

  it('escopo all em card que a pessoa enxerga: todas', async () => {
    const { service, approvalsRepo } = makeService();
    const approvals = [makeApproval(), makeApproval({ id: 'approval-2' })];
    approvalsRepo.find.mockResolvedValue(approvals);

    const result = await service.findBySolicitation(
      'solicitation-id',
      makeActor(),
      jest.fn().mockResolvedValue(true),
    );

    expect(result).toBe(approvals);
  });
});

describe('ApprovalsService.findById — card fora do alcance', () => {
  it('escopo all sem enxergar o card e sem ser chamado: 403', async () => {
    const { service, approvalsRepo } = makeService();
    approvalsRepo.findOneOrFail.mockResolvedValue(
      makeApproval({ steps: [makeStep({ assignedUserId: 'x' })] }),
    );
    const canSee = jest.fn().mockResolvedValue(false);

    await expect(service.findById('approval-id', makeActor(), canSee)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(canSee).toHaveBeenCalledWith('solicitation-id');
  });

  it('quem foi chamado a aprovar abre mesmo sem enxergar o card', async () => {
    const { service, approvalsRepo } = makeService();
    const approval = makeApproval({ steps: [makeStep({ assignedUserId: 'viewer-id' })] });
    approvalsRepo.findOneOrFail.mockResolvedValue(approval);
    const canSee = jest.fn().mockResolvedValue(false);

    await expect(
      service.findById('approval-id', makeActor({ role: 'viewer', sub: 'viewer-id' }), canSee),
    ).resolves.toBe(approval);
    expect(canSee).not.toHaveBeenCalled();
  });
});

// ── Sequential mode ───────────────────────────────────────────────────────────

describe('ApprovalsService - sequential mode', () => {
  it('createApproval sequential: primeiro step PENDING, demais WAITING', async () => {
    const { service, approvalsRepo, dataSource } = makeService();

    const solicitation = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    const savedApproval = makeApproval({ id: 'approval-id', mode: 'sequential' });

    const { manager, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockResolvedValue(solicitation),
    });
    manager.getRepository(ApprovalEntity).save.mockResolvedValue(savedApproval);
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    approvalsRepo.findOneOrFail.mockResolvedValue(makeApproval({ mode: 'sequential' }));

    await service.createApproval(
      'solicitation-id',
      { title: 'Seq', assignedUserIds: ['approver-1', 'approver-2', 'approver-3'], mode: 'sequential' },
      makeActor(),
    );

    expect(stepWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'approver-1', status: ApprovalStepStatus.PENDING }),
    );
    expect(stepWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'approver-2', status: ApprovalStepStatus.WAITING }),
    );
    expect(stepWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'approver-3', status: ApprovalStepStatus.WAITING }),
    );
  });

  it('approveStep sequential: aprovar step intermediário promove próximo WAITING para PENDING', async () => {
    const { service, stepsRepo, dataSource } = makeService();

    const step = makeStep({ status: ApprovalStepStatus.PENDING, assignedUserId: 'user-id', decision: null });
    const approval = makeApproval({ status: ApprovalStatus.PENDING, requiredDecisions: 2, mode: 'sequential' });
    const nextWaiting = makeStep({ id: 'step-2', status: ApprovalStepStatus.WAITING, assignedUserId: 'approver-2', order: 2 });

    const { manager, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockResolvedValue(approval),
      find: jest.fn().mockResolvedValue([nextWaiting]),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(stepWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'step-2', status: ApprovalStepStatus.PENDING }),
    );
  });

  it('approveStep sequential: último step aprovado conclui a aprovação', async () => {
    const { service, stepsRepo, eventEmitter, dataSource } = makeService();

    const step = makeStep({ status: ApprovalStepStatus.PENDING, assignedUserId: 'user-id', decision: null });
    const approval = makeApproval({ status: ApprovalStatus.PENDING, requiredDecisions: 1, mode: 'sequential' });
    const solicitation = makeSolicitation({ status: SolicitationStatus.WAITING_APPROVAL });

    const { manager, approvalWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalEntity) return approval;
        if (entity === SolicitationEntity) return solicitation;
        throw new Error('unexpected');
      }),
      find: jest.fn().mockResolvedValue([]),  // no more WAITING steps
      count: jest.fn().mockResolvedValue(1),  // approvedCount >= requiredDecisions
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(approvalWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStatus.APPROVED }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.approved',
      expect.objectContaining({ approvalId: 'approval-id' }),
    );
  });

  it('concluída: avisa quem pediu e o solicitante (menos quem decidiu), com link da solicitação', async () => {
    const { service, stepsRepo, dataSource } = makeService();
    const step = makeStep({ status: ApprovalStepStatus.PENDING, assignedUserId: 'aprovador-id', decision: null });
    const approval = makeApproval({ requiredDecisions: 1, createdBy: 'quem-pediu' });
    const solicitation = makeSolicitation({ status: SolicitationStatus.WAITING_APPROVAL });
    const { manager } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => (entity === ApprovalDecisionEntity ? null : step)),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) =>
        entity === ApprovalEntity ? approval : solicitation,
      ),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager as unknown as EntityManager));
    (dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 'solicitation-id', createdBy: 'solicitante-id' }),
    });
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));
    const userNotice = { notify: jest.fn().mockResolvedValue(undefined) };
    (service as unknown as { userNotice: typeof userNotice }).userNotice = userNotice;

    await service.approveStep('step-id', { decision: 'approved' }, makeActor({ sub: 'aprovador-id' }));
    await new Promise((resolve) => setImmediate(resolve));

    expect(userNotice.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'approval_approved',
        userIds: ['quem-pediu', 'solicitante-id'],
        exceptUserIds: ['aprovador-id'],
        link: '/solicitacoes?solicitationId=solicitation-id',
      }),
    );
  });

  it('approveStep sequential: rejeição skipa steps PENDING e WAITING', async () => {
    const { service, stepsRepo, dataSource } = makeService();

    const step = makeStep({ status: ApprovalStepStatus.PENDING, assignedUserId: 'user-id', decision: null });
    const approval = makeApproval({ status: ApprovalStatus.PENDING, mode: 'sequential' });
    const solicitation = makeSolicitation({ status: SolicitationStatus.WAITING_APPROVAL });
    const waitingStep = makeStep({ id: 'step-2', status: ApprovalStepStatus.WAITING });

    const { manager, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalDecisionEntity) return null;
        return step;
      }),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ApprovalEntity) return approval;
        if (entity === SolicitationEntity) return solicitation;
        throw new Error('unexpected');
      }),
      find: jest.fn().mockResolvedValue([waitingStep]),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.REJECTED }));

    await service.approveStep('step-id', { decision: 'rejected', comment: 'Motivo.' }, makeActor());

    expect(stepWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ApprovalStepStatus.SKIPPED }),
    );
  });
});

describe('ApprovalsService.pendingApproverUserIds', () => {
  it('titulares das etapas pendentes + usuários ativos dos perfis, sem repetir; externos ficam de fora', async () => {
    const { service, stepsRepo, usersRepo } = makeService();
    stepsRepo.find.mockResolvedValue([
      { assignedUserId: 'user-ana', assignedRoleCode: null, assignedEmail: null },
      { assignedUserId: null, assignedRoleCode: 'logistica', assignedEmail: null },
      { assignedUserId: null, assignedRoleCode: null, assignedEmail: 'externo@x.com' },
    ]);
    usersRepo.find.mockResolvedValue([{ id: 'user-bia' }, { id: 'user-ana' }]);

    await expect(service.pendingApproverUserIds('approval-1')).resolves.toEqual(['user-ana', 'user-bia']);
    expect(stepsRepo.find).toHaveBeenCalledWith({
      where: { approvalId: 'approval-1', status: ApprovalStepStatus.PENDING },
    });
  });
});

describe('ApprovalsService — várias aprovações (qualquer um, todos, em ordem)', () => {
  function setupCreate() {
    const ctx = makeService();
    const { manager, approvalWriteRepo, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockResolvedValue(makeSolicitation()),
    });
    ctx.dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );
    ctx.approvalsRepo.findOneOrFail.mockResolvedValue(makeApproval());
    return { ...ctx, approvalWriteRepo, stepWriteRepo };
  }

  it('"todos": exige a decisão de cada aprovador (um perfil conta como um)', async () => {
    const { service, approvalWriteRepo } = setupCreate();
    await service.createApproval(
      'solicitation-id',
      { title: 'Compra', assignedUserIds: ['u-1', 'u-2'], assignedRoleCodes: ['diretoria'], requireAll: true },
      makeActor(),
    );
    expect(approvalWriteRepo.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'parallel', requiredDecisions: 3 }));
  });

  it('"qualquer um" (padrão) basta uma decisão', async () => {
    const { service, approvalWriteRepo } = setupCreate();
    await service.createApproval('solicitation-id', { title: 'Compra', assignedUserIds: ['u-1', 'u-2'] }, makeActor());
    expect(approvalWriteRepo.create).toHaveBeenCalledWith(expect.objectContaining({ requiredDecisions: 1 }));
  });

  it('"em ordem": etapas na ordem pedida (perfil antes de usuário) e só a primeira pendente; avisa só ela', async () => {
    const { service, stepWriteRepo, approvalWriteRepo, usersRepo } = setupCreate();
    usersRepo.find.mockResolvedValue([{ id: 'u-gerente' }]);
    await service.createApproval(
      'solicitation-id',
      {
        title: 'Compra',
        assignedUserIds: ['u-diretor'],
        assignedRoleCodes: ['gerente'],
        mode: 'sequential',
        assigneeOrder: ['role:gerente', 'user:u-diretor'],
      },
      makeActor(),
    );
    const created = stepWriteRepo.create.mock.calls.map(([step]) => step);
    expect(created).toEqual([
      expect.objectContaining({ assignedRoleCode: 'gerente', order: 1, status: ApprovalStepStatus.PENDING }),
      expect.objectContaining({ assignedUserId: 'u-diretor', order: 2, status: ApprovalStepStatus.WAITING }),
    ]);
    expect(approvalWriteRepo.create).toHaveBeenCalledWith(expect.objectContaining({ requiredDecisions: 2 }));
    expect(usersRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { role: In(['gerente']), isActive: true } }));
  });

  it('"qualquer um": ao aprovar, as outras etapas pendentes deixam de esperar', async () => {
    const { service, stepsRepo, dataSource } = makeService();
    const step = makeStep({ status: ApprovalStepStatus.PENDING, decision: null });
    const other = makeStep({ id: 'step-2', assignedUserId: 'u-2', status: ApprovalStepStatus.PENDING });
    const { manager, stepWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => (entity === ApprovalDecisionEntity ? null : step)),
      findOneOrFail: jest.fn().mockImplementation(async (entity: unknown) =>
        entity === ApprovalEntity ? makeApproval({ requiredDecisions: 1 }) : makeSolicitation(),
      ),
      find: jest.fn().mockResolvedValue([other]),
      count: jest.fn().mockResolvedValue(1),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager as unknown as EntityManager));
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(stepWriteRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'step-2', status: ApprovalStepStatus.SKIPPED }));
  });

  it('"todos": aprovar um não conclui enquanto faltam os outros', async () => {
    const { service, stepsRepo, dataSource, eventEmitter } = makeService();
    const step = makeStep({ status: ApprovalStepStatus.PENDING, decision: null });
    const { manager, approvalWriteRepo } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => (entity === ApprovalDecisionEntity ? null : step)),
      findOneOrFail: jest.fn().mockResolvedValue(makeApproval({ requiredDecisions: 3 })),
      count: jest.fn().mockResolvedValue(2),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager as unknown as EntityManager));
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(approvalWriteRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith('approvals.approved', expect.anything());
  });

  it('em ordem: a próxima etapa de perfil avisa quem tem o perfil', async () => {
    const { service, stepsRepo, dataSource, usersRepo } = makeService();
    const step = makeStep({ status: ApprovalStepStatus.PENDING, decision: null });
    const next = makeStep({ id: 'step-2', assignedUserId: null, assignedRoleCode: 'diretoria', status: ApprovalStepStatus.WAITING, order: 2 });
    const { manager } = makeManager({
      findOne: jest.fn().mockImplementation(async (entity: unknown) => (entity === ApprovalDecisionEntity ? null : step)),
      findOneOrFail: jest.fn().mockResolvedValue(makeApproval({ mode: 'sequential', requiredDecisions: 2 })),
      find: jest.fn().mockResolvedValue([next]),
    });
    dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager as unknown as EntityManager));
    stepsRepo.findOneOrFail.mockResolvedValue(makeStep({ status: ApprovalStepStatus.APPROVED }));
    usersRepo.find.mockResolvedValue([{ id: 'u-diretor' }]);
    const userNotice = { notify: jest.fn().mockResolvedValue(undefined) };
    (service as unknown as { userNotice: typeof userNotice }).userNotice = userNotice;

    await service.approveStep('step-id', { decision: 'approved' }, makeActor());

    expect(usersRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'diretoria', isActive: true } }));
    expect(userNotice.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'approval', userIds: ['u-diretor'], link: '/aprovacoes?id=approval-id' }),
    );
  });
});

describe('orderApprovalSteps', () => {
  it('segue a ordem pedida; quem não está nela vai para o fim, na ordem original', () => {
    const steps = [{ key: 'user:a' }, { key: 'user:b' }, { key: 'role:x' }, { key: 'email:e' }];
    expect(orderApprovalSteps(steps, ['role:x', 'user:b']).map((s) => s.key)).toEqual([
      'role:x',
      'user:b',
      'user:a',
      'email:e',
    ]);
    expect(orderApprovalSteps(steps, undefined)).toBe(steps);
  });
});
