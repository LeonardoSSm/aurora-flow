import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, EntityManager } from 'typeorm';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  ApprovalEntity,
  ApprovalStepEntity,
  FormEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  RoleEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  SolicitationPhasePeriodEntity,
  SubmissionEntity,
  SubmissionItemEntity,
  UserEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SolicitationsService } from './solicitations.service';
import type { AccessActor } from '../access/process-access.service';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';
import { CardFilterService } from '../access/card-filter.service';

function makeActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'actor-id',
    email: 'actor@formhub.local',
    fullName: 'Actor',
    role: 'admin',
    tokenVersion: 0,
    ...overrides,
  };
}

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    title: 'Solicitacao',
    description: null,
    status: SolicitationStatus.OPEN,
    priority: SolicitationPriority.MEDIUM,
    originType: SolicitationOriginType.MANUAL,
    trackingToken: 'test-tracking-token',
    formId: null,
    form: null,
    submissionId: null,
    submission: null,
    createdBy: 'actor-id',
    createdByUser: null,
    assigneeId: null,
    assignee: null,
    metadata: null,
    history: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as SolicitationEntity;
}

function makeSubmission(): SubmissionEntity {
  return {
    id: 'submission-id',
    formId: 'form-id',
    formVersionId: 'version-id',
    responderName: 'Maria',
    responderEmail: 'maria@formhub.local',
    form: { id: 'form-id', name: 'Formulario de TI' },
  } as SubmissionEntity;
}

function makeRepository() {
  return {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockImplementation((entity: object) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(),
  };
}

function makeDataSource() {
  const solicitationWriteRepo = makeRepository();
  const historyWriteRepo = makeRepository();
  const phasePeriodsRepo = makeRepository();
  phasePeriodsRepo.findOne.mockResolvedValue(null);
  const manager = {
    findOne: jest.fn(),
    // Campos calculados da versão e itens da submissão (faixas de pontuação): nenhum por padrão.
    find: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SolicitationEntity) return solicitationWriteRepo;
      if (entity === SolicitationHistoryEntity) return historyWriteRepo;
      if (entity === SolicitationPhasePeriodEntity) return phasePeriodsRepo;
      throw new Error('Unexpected repository');
    }),
    // Aprovação desta passagem pela fase (consulta no banco): devolve o que o teste configurou em
    // findOne(ApprovalEntity).
    createQueryBuilder: jest.fn((entity: unknown) => {
      const chain = {
        innerJoin: () => chain,
        where: () => chain,
        andWhere: () => chain,
        orderBy: () => chain,
        getOne: () => manager.findOne(entity, {}),
      };
      return chain;
    }),
  };
  const dataSource = {
    manager,
    transaction: jest.fn((cb: (manager: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    ),
  };
  return { dataSource, manager, solicitationWriteRepo, historyWriteRepo, phasePeriodsRepo };
}

function makeMetricsService() {
  return {
    incrementSolicitationsByStatus: jest.fn(),
    decrementSolicitationsByStatus: jest.fn(),
    incrementKanbanMoves: jest.fn(),
    incrementSolicitationsCreatedTotal: jest.fn(),
    observeSolicitationCompletionHours: jest.fn(),
  };
}

function makeSettingsService() {
  return {
    getValue: jest.fn().mockResolvedValue(null),
  };
}

function makeSlaCalculatorService() {
  return {
    initializeSlaForSolicitation: jest.fn(),
  };
}

function makeApprovalsService() {
  return {
    createApproval: jest.fn(),
  };
}

// Mirrors the seed matrix from 1786000000000-RolesAndPermissions for
// solicitations.view/solicitations.manage.
const SOLICITATIONS_SCOPE_MATRIX: Record<string, { view: string; manage: string }> = {
  ['admin']: { view: 'all', manage: 'all' },
  ['manager']: { view: 'area', manage: 'area' },
  ['editor']: { view: 'own', manage: 'own' },
  ['viewer']: { view: 'assigned', manage: 'none' },
  // Perfis do processo de cancelamento, usados nos testes de "Visível para".
  ['vendedor']: { view: 'all', manage: 'all' },
  ['logistica']: { view: 'all', manage: 'all' },
  ['financeiro']: { view: 'all', manage: 'all' },
  // Opera o processo, mas não está na lista de quem atua na fase: só acesso total passa por cima dela.
  ['consulta']: { view: 'all', manage: 'all' },
};

function makePermissionsService() {
  return {
    getScope: jest.fn().mockImplementation((role: string, code: string) => {
      const row = SOLICITATIONS_SCOPE_MATRIX[role];
      if (code === 'solicitations.view') return Promise.resolve(row.view);
      if (code === 'solicitations.manage') return Promise.resolve(row.manage);
      return Promise.resolve('none');
    }),
    hasAny: jest.fn().mockResolvedValue(false),
  };
}


/** Processos usados nos testes. */
const TEST_FORMS = ['form-id', 'outro-form'];

function grantsFromMatrix(actor: AccessActor, seesAll: boolean) {
  if (actor.role === 'admin') return grantsFor(actor.sub, true);
  const row = SOLICITATIONS_SCOPE_MATRIX[actor.role] ?? { view: 'none', manage: 'none' };
  const permissions: Record<string, 'all' | 'own'> = {};
  if (row.view === 'all' || row.view === 'area') permissions['solicitations.view'] = 'all';
  else if (row.view !== 'none') permissions['solicitations.view'] = 'own';
  if (row.manage !== 'none') {
    permissions['solicitations.create'] = 'all';
    permissions['solicitations.act'] = 'all';
    permissions['solicitations.reassign'] = 'all';
  }
  if (seesAll) permissions['kanban_phases.manage'] = 'all';
  return grantsFor(actor.sub, false, Object.fromEntries(TEST_FORMS.map((formId) => [formId, permissions])));
}

function makeService() {
  const solicitationsRepo = makeRepository();
  const historyRepo = makeRepository();
  const kanbanPhasesRepo = makeRepository();
  const phaseFieldValuesRepo = makeRepository();
  const standardAnswersRepo = makeRepository();
  const eventEmitter: Partial<EventEmitter2> = { emit: jest.fn() };
  const metricsService = makeMetricsService();
  const settingsService = makeSettingsService();
  const slaCalculatorService = makeSlaCalculatorService();
  const permissionsService = makePermissionsService();
  const approvalsService = makeApprovalsService();
  const itemOrderFields = { resolvePhaseValue: jest.fn() };
  const data = makeDataSource();
  // As permissões de processo saem da mesma matriz dos perfis antigos, convertida para vínculo com os
  // processos dos testes: 'admin' tem acesso total; os demais, vínculo com o que o perfil dava.
  // `access.seesAll` liga "configurar as fases" (o teste de visibilidade de fase).
  const access = { seesAll: false };
  // Filtro de cards da fase de verdade, sobre os mesmos repositórios do teste.
  const cardFilter = new CardFilterService(
    data.dataSource as unknown as DataSource,
    kanbanPhasesRepo as never,
    phaseFieldValuesRepo as never,
  );
  const processAccess = fakeProcessAccess({
    solicitationsRepository: solicitationsRepo,
    resolve: (actor) => grantsFromMatrix(actor, access.seesAll),
    cardFilter,
  });
  const assertProcessVisible = jest
    .spyOn(processAccess, 'assertProcessVisible')
    .mockResolvedValue({} as never);
  const service = new SolicitationsService(
    data.dataSource as unknown as DataSource,
    eventEmitter as EventEmitter2,
    solicitationsRepo as never,
    historyRepo as never,
    kanbanPhasesRepo as never,
    phaseFieldValuesRepo as never,
    standardAnswersRepo as never,
    metricsService as never,
    settingsService as never,
    slaCalculatorService as never,
    permissionsService as never,
    approvalsService as never,
    itemOrderFields as never,
    processAccess,
    cardFilter,
  );
  return {
    service,
    access,
    processAccess,
    assertProcessVisible,
    solicitationsRepo,
    historyRepo,
    kanbanPhasesRepo,
    phaseFieldValuesRepo,
    standardAnswersRepo,
    eventEmitter,
    metricsService,
    approvalsService,
    settingsService,
    slaCalculatorService,
    permissionsService,
    itemOrderFields,
    ...data,
  };
}

describe('SolicitationsService.createFromSubmission', () => {
  it('cria solicitacao, historico e evento a partir de uma submissao', async () => {
    const { service, solicitationsRepo, manager, solicitationWriteRepo, historyWriteRepo, eventEmitter } =
      makeService();
    const saved = makeSolicitation({
      originType: SolicitationOriginType.FORM_SUBMISSION,
      formId: 'form-id',
      submissionId: 'submission-id',
      createdBy: null,
    });

    solicitationsRepo.findOne.mockResolvedValueOnce(null);
    solicitationsRepo.findOneOrFail.mockResolvedValue(saved);
    manager.findOne.mockResolvedValue(makeSubmission());
    solicitationWriteRepo.save.mockResolvedValue(saved);

    const result = await service.createFromSubmission('submission-id');

    expect(result).toBe(saved);
    expect(solicitationWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originType: SolicitationOriginType.FORM_SUBMISSION,
        formId: 'form-id',
        submissionId: 'submission-id',
        status: SolicitationStatus.NEW,
      }),
    );
    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitationId: 'solicitation-id',
        eventType: SolicitationHistoryEventType.CREATED,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.created',
      expect.objectContaining({ solicitationId: 'solicitation-id' }),
    );
  });

  it('gera tracking token automaticamente ao criar solicitacao', async () => {
    const { service, solicitationsRepo, manager, solicitationWriteRepo } = makeService();
    const saved = makeSolicitation({
      originType: SolicitationOriginType.FORM_SUBMISSION,
      formId: 'form-id',
      submissionId: 'submission-id',
      createdBy: null,
    });

    solicitationsRepo.findOne.mockResolvedValueOnce(null);
    solicitationsRepo.findOneOrFail.mockResolvedValue(saved);
    manager.findOne.mockResolvedValue(makeSubmission());
    solicitationWriteRepo.save.mockResolvedValue(saved);

    await service.createFromSubmission('submission-id');

    const createCall = solicitationWriteRepo.create.mock.calls[0][0] as Record<string, unknown>;
    expect(createCall.trackingToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('nao cria duplicidade quando ja existe solicitacao para a submissao', async () => {
    const { service, solicitationsRepo, solicitationWriteRepo, eventEmitter } = makeService();
    const existing = makeSolicitation({
      originType: SolicitationOriginType.FORM_SUBMISSION,
      submissionId: 'submission-id',
    });
    solicitationsRepo.findOne.mockResolvedValue(existing);

    const result = await service.createFromSubmission('submission-id');

    expect(result).toBe(existing);
    expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  describe('faixas de pontuação do campo calculado', () => {
    const phases = [
      { id: 'fase-1', formId: 'form-id', label: 'Novo', order: 0 },
      { id: 'fase-b', formId: 'form-id', label: 'Atenção', order: 1 },
      { id: 'fase-outra', formId: 'outro-form', label: 'Outro', order: 0 },
    ] as KanbanPhaseEntity[];
    const pontuacao = {
      code: 'pontos',
      label: 'Pontuação',
      order: 0,
      section: { order: 0 },
      settingsJson: {
        formula: 'SOMA({p1}; {p2})',
        scoreRanges: [
          { id: 'a', from: 20, label: 'A', phaseId: 'fase-1' },
          { id: 'b', from: 30, label: 'B', phaseId: 'fase-b' },
          { id: 'c', from: 50, label: 'C', phaseId: 'fase-outra' },
        ],
      },
    };

    function setup(value: number) {
      const ctx = makeService();
      ctx.solicitationsRepo.findOne.mockResolvedValue(null);
      ctx.solicitationsRepo.findOneOrFail.mockImplementation(() =>
        Promise.resolve(ctx.solicitationWriteRepo.save.mock.results.at(-1)?.value),
      );
      ctx.manager.findOne.mockResolvedValue(makeSubmission());
      ctx.manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === SubmissionItemEntity ? [{ fieldCode: 'pontos', valueNumber: value }] : [pontuacao],
        ),
      );
      ctx.kanbanPhasesRepo.findOne.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(phases.find((phase) => phase.id === where.id) ?? null),
      );
      ctx.kanbanPhasesRepo.find.mockResolvedValue(phases.filter((phase) => phase.formId === 'form-id'));
      ctx.solicitationWriteRepo.save.mockImplementation((entity: object) =>
        Promise.resolve({ id: 'solicitation-id', ...entity }),
      );
      return ctx;
    }

    it('o card nasce na fase da faixa, com período aberto, histórico e "Entrou na fase"', async () => {
      const { service, solicitationWriteRepo, phasePeriodsRepo, historyWriteRepo, eventEmitter } =
        setup(35);

      await service.createFromSubmission('submission-id');

      expect(solicitationWriteRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          currentPhaseId: 'fase-b',
          metadata: expect.objectContaining({
            scoreRange: { fieldCode: 'pontos', value: 35, from: 30, label: 'B', phaseId: 'fase-b' },
          }),
        }),
      );
      expect(phasePeriodsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phaseId: 'fase-b', leftAt: null }),
      );
      expect(historyWriteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SolicitationHistoryEventType.PHASE_CHANGED,
          toValue: 'Atenção',
          message: expect.stringContaining('Faixa "B" do cálculo "Pontuação" (35)'),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ solicitationId: 'solicitation-id', fromPhaseId: null, toPhaseId: 'fase-b' }),
      );
    });

    it('faixa da 1ª fase só registra a faixa: o card nasce como sempre', async () => {
      const { service, solicitationWriteRepo, phasePeriodsRepo, eventEmitter } = setup(25);

      await service.createFromSubmission('submission-id');

      const last = solicitationWriteRepo.save.mock.calls.at(-1)?.[0] as SolicitationEntity;
      expect(last.currentPhaseId).toBeUndefined();
      expect(last.metadata).toEqual(expect.objectContaining({ scoreRange: expect.objectContaining({ label: 'A' }) }));
      expect(phasePeriodsRepo.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('solicitations.phase_changed', expect.anything());
    });

    it('abaixo da primeira faixa nada muda', async () => {
      const { service, solicitationWriteRepo, eventEmitter } = setup(10);

      await service.createFromSubmission('submission-id');

      expect(solicitationWriteRepo.save).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('solicitations.phase_changed', expect.anything());
    });

    it('fase de outro processo não trava a abertura: o card nasce na 1ª fase', async () => {
      const { service, solicitationWriteRepo, eventEmitter } = setup(80);

      await service.createFromSubmission('submission-id');

      expect(solicitationWriteRepo.save).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith('solicitations.created', expect.anything());
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('solicitations.phase_changed', expect.anything());
    });
  });
});

describe('SolicitationsService.createFromFlowPayload', () => {
  it('cria solicitacao de origem webhook com historico e evento', async () => {
    const { service, solicitationsRepo, solicitationWriteRepo, historyWriteRepo, eventEmitter } =
      makeService();
    const saved = makeSolicitation({
      originType: SolicitationOriginType.WEBHOOK,
      title: 'Pedido PC-123',
      metadata: { valorTotal: 999 },
    });
    solicitationsRepo.findOne.mockResolvedValue(null);
    solicitationWriteRepo.save.mockResolvedValue(saved);

    const result = await service.createFromFlowPayload({
      title: 'Pedido PC-123',
      description: 'Urgente',
      metadata: { valorTotal: 999 },
    });

    expect(result).toEqual({ solicitation: saved, reused: false });
    expect(solicitationWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pedido PC-123',
        originType: SolicitationOriginType.WEBHOOK,
        formId: null,
        submissionId: null,
        status: SolicitationStatus.NEW,
      }),
    );
    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitationId: 'solicitation-id',
        eventType: SolicitationHistoryEventType.CREATED,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.created',
      expect.objectContaining({ solicitationId: 'solicitation-id' }),
    );
  });

  it('retorna solicitacao existente quando a chave de idempotencia ja foi usada (dedupe de reenvio)', async () => {
    const { service, solicitationsRepo, solicitationWriteRepo, eventEmitter } = makeService();
    const existing = makeSolicitation({
      originType: SolicitationOriginType.WEBHOOK,
      idempotencyKey: 'PC-123',
    } as Partial<SolicitationEntity>);
    solicitationsRepo.findOne.mockResolvedValue(existing);

    const result = await service.createFromFlowPayload({
      title: 'Pedido PC-123',
      idempotencyKey: 'PC-123',
    });

    expect(result).toEqual({ solicitation: existing, reused: true });
    expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  describe('fase de entrada (entrada externa do mapa)', () => {
    const phases = [
      { id: 'fase-1', formId: 'form-id', label: 'Novo', order: 0 },
      { id: 'fase-3', formId: 'form-id', label: 'Financeiro', order: 2 },
    ] as KanbanPhaseEntity[];

    function setup() {
      const ctx = makeService();
      ctx.solicitationsRepo.findOne.mockResolvedValue(null);
      ctx.kanbanPhasesRepo.findOne.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(phases.find((phase) => phase.id === where.id) ?? null),
      );
      ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
      ctx.solicitationWriteRepo.save.mockImplementation((entity: object) =>
        Promise.resolve({ id: 'solicitation-id', ...entity }),
      );
      return ctx;
    }

    it('nasce direto na fase escolhida, abre o período dela e dispara "Entrou na fase"', async () => {
      const { service, solicitationWriteRepo, phasePeriodsRepo, eventEmitter } = setup();

      const { solicitation } = await service.createFromFlowPayload({
        title: 'Pedido 42',
        formId: 'form-id',
        phaseId: 'fase-3',
        flowEventDepth: 1,
      });

      expect(solicitation.currentPhaseId).toBe('fase-3');
      expect(solicitationWriteRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentPhaseId: 'fase-3' }),
      );
      expect(phasePeriodsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phaseId: 'fase-3', leftAt: null }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ solicitationId: 'solicitation-id', fromPhaseId: null, toPhaseId: 'fase-3', flowDepth: 1 }),
      );
    });

    it('na 1ª fase nasce como qualquer solicitação, sem "Entrou na fase"', async () => {
      const { service, phasePeriodsRepo, eventEmitter } = setup();

      const { solicitation } = await service.createFromFlowPayload({
        title: 'Pedido 42',
        formId: 'form-id',
        phaseId: 'fase-1',
      });

      expect(solicitation.currentPhaseId).toBeUndefined();
      expect(phasePeriodsRepo.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('solicitations.phase_changed', expect.anything());
    });

    it('recusa fase de outro formulário sem criar nada', async () => {
      const { service, solicitationWriteRepo } = setup();

      await expect(
        service.createFromFlowPayload({ title: 'Pedido 42', formId: 'outro-form', phaseId: 'fase-3' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('SolicitationsService updates', () => {
  it('altera status com historico e evento', async () => {
    const { service, solicitationsRepo, manager, solicitationWriteRepo, historyWriteRepo, eventEmitter } =
      makeService();
    const current = makeSolicitation({ status: SolicitationStatus.OPEN });
    const updated = makeSolicitation({ status: SolicitationStatus.IN_PROGRESS });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    const result = await service.updateStatus(
      'solicitation-id',
      { status: SolicitationStatus.IN_PROGRESS, note: 'Assumida pelo time.' },
      makeActor(),
    );

    expect(result.status).toBe(SolicitationStatus.IN_PROGRESS);
    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.IN_PROGRESS }),
    );
    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SolicitationHistoryEventType.STATUS_CHANGED,
        fromValue: SolicitationStatus.OPEN,
        toValue: SolicitationStatus.IN_PROGRESS,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.status_changed',
      expect.objectContaining({
        fromStatus: SolicitationStatus.OPEN,
        toStatus: SolicitationStatus.IN_PROGRESS,
      }),
    );
  });

  it('altera responsavel com historico e evento', async () => {
    const { service, solicitationsRepo, manager, historyWriteRepo, eventEmitter } = makeService();
    const current = makeSolicitation({ assigneeId: null });
    const updated = makeSolicitation({ assigneeId: 'new-assignee-id' });

    manager.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ id: 'new-assignee-id', isActive: true });
    solicitationsRepo.findOne.mockResolvedValue(updated);

    await service.updateAssignee(
      'solicitation-id',
      { assigneeId: 'new-assignee-id' },
      makeActor(),
    );

    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SolicitationHistoryEventType.ASSIGNEE_CHANGED,
        fromValue: null,
        toValue: 'new-assignee-id',
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.assignee_changed',
      expect.objectContaining({ toAssigneeId: 'new-assignee-id' }),
    );
  });

  it('altera prioridade com historico e evento', async () => {
    const { service, solicitationsRepo, manager, historyWriteRepo, eventEmitter } = makeService();
    const current = makeSolicitation({ priority: SolicitationPriority.MEDIUM });
    const updated = makeSolicitation({ priority: SolicitationPriority.URGENT });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    await service.updatePriority(
      'solicitation-id',
      { priority: SolicitationPriority.URGENT },
      makeActor(),
    );

    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SolicitationHistoryEventType.PRIORITY_CHANGED,
        fromValue: SolicitationPriority.MEDIUM,
        toValue: SolicitationPriority.URGENT,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.priority_changed',
      expect.objectContaining({ toPriority: SolicitationPriority.URGENT }),
    );
  });
});

describe('SolicitationsService access — vínculo com o processo', () => {
  const card = (overrides: Partial<SolicitationEntity> = {}) =>
    makeSolicitation({ formId: 'form-id', createdBy: 'someone-else', assigneeId: 'other-user-id', ...overrides });

  function withGrants(grants: ReturnType<typeof grantsFor>) {
    const ctx = makeService();
    (ctx.processAccess.grantsOf as jest.Mock).mockResolvedValue(grants);
    return ctx;
  }

  it('sem vínculo com o processo: bloqueia quem não abriu o card nem é responsável', async () => {
    const { service, solicitationsRepo } = withGrants(grantsFor('u1', false, { 'outro-form': { 'solicitations.view': 'all' } }));
    solicitationsRepo.findOne.mockResolvedValue(card());
    await expect(service.findOne('solicitation-id', makeActor({ sub: 'u1', role: 'manager' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('"ver solicitações" no processo: qualquer card dele, de qualquer área', async () => {
    const { service, solicitationsRepo } = withGrants(grantsFor('u1', false, { 'form-id': { 'solicitations.view': 'all' } }));
    solicitationsRepo.findOne.mockResolvedValue(card({ areaId: 'area-formulario' }));
    const solicitation = await service.findOne('solicitation-id', makeActor({ sub: 'u1', areaId: 'area-diferente' }));
    expect(solicitation.id).toBe('solicitation-id');
  });

  it('"só os meus": vê os cards de que é responsável, não os outros', async () => {
    const grants = grantsFor('u1', false, { 'form-id': { 'solicitations.view': 'own' } });
    const denied = withGrants(grants);
    denied.solicitationsRepo.findOne.mockResolvedValue(card());
    await expect(denied.service.findOne('solicitation-id', makeActor({ sub: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);

    const allowed = withGrants(grants);
    allowed.solicitationsRepo.findOne.mockResolvedValue(card({ assigneeId: 'u1' }));
    await expect(allowed.service.findOne('solicitation-id', makeActor({ sub: 'u1' }))).resolves.toBeDefined();
  });

  it('quem abriu o pedido o vê mesmo sem vínculo — mas não atua nele', async () => {
    const { service, solicitationsRepo, manager } = withGrants(grantsFor('u1', false));
    solicitationsRepo.findOne.mockResolvedValue(card({ createdBy: 'u1' }));
    manager.findOne.mockResolvedValue(card({ createdBy: 'u1' }));
    await expect(service.findOne('solicitation-id', makeActor({ sub: 'u1' }))).resolves.toBeDefined();
    await expect(
      service.updatePriority('solicitation-id', { priority: SolicitationPriority.HIGH } as never, makeActor({ sub: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function makeBoardQueryBuilder(solicitations: SolicitationEntity[]) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(solicitations),
  };
}

describe('SolicitationsService.getKanbanBoard', () => {
  it('sem formulario rejeita: o board por status foi descontinuado', async () => {
    const { service } = makeService();

    await expect(service.getKanbanBoard(makeActor())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('"unassigned" monta as colunas padrao Novo/Pendente/Concluido a partir do status', async () => {
    const { service, solicitationsRepo } = makeService();
    const qb = makeBoardQueryBuilder([
      makeSolicitation({ id: 'sol-new', status: SolicitationStatus.NEW }),
      makeSolicitation({ id: 'sol-open', status: SolicitationStatus.OPEN }),
      makeSolicitation({ id: 'sol-waiting', status: SolicitationStatus.WAITING_APPROVAL }),
      makeSolicitation({ id: 'sol-cancelled', status: SolicitationStatus.CANCELLED }),
    ]);
    solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    const board = await service.getKanbanBoard(makeActor(), 'unassigned');

    expect(qb.where).toHaveBeenCalledWith('solicitation.formId IS NULL');
    expect(board.groupBy).toBe('stage');
    expect(board.columns.map((c) => [c.id, c.label, c.color])).toEqual([
      ['novo', 'Novo', 'blue'],
      ['pendente', 'Pendente', 'amber'],
      ['concluido', 'Concluído', 'green'],
    ]);
    expect(board.columns[0].cards.map((c) => c.id)).toEqual(['sol-new', 'sol-open']);
    expect(board.columns[1].cards.map((c) => c.id)).toEqual(['sol-waiting']);
    expect(board.columns[2].cards.map((c) => c.id)).toEqual(['sol-cancelled']);
  });

  it('card possui hasIntegrationError true quando metadata.integrationError estiver presente', async () => {
    const { service, solicitationsRepo } = makeService();
    solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([
        makeSolicitation({
          status: SolicitationStatus.WAITING_INTEGRATION,
          metadata: { integrationError: 'timeout' },
        }),
      ]),
    );

    const board = await service.getKanbanBoard(makeActor(), 'unassigned');
    const col = board.columns.find((c) => c.id === 'pendente');
    expect(col?.cards[0].hasIntegrationError).toBe(true);
  });

  it('formulario com fases agrupa por fase', async () => {
    const { service, solicitationsRepo, kanbanPhasesRepo } = makeService();
    kanbanPhasesRepo.find.mockResolvedValue([
      { id: 'phase-1', label: 'Triagem', color: 'blue', order: 0 },
      { id: 'phase-2', label: 'Execução', color: 'green', order: 1 },
    ]);
    solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([
        makeSolicitation({ id: 'sol-1', formId: 'form-id', currentPhaseId: 'phase-2' }),
        makeSolicitation({ id: 'sol-2', formId: 'form-id', currentPhaseId: null }),
      ]),
    );

    const board = await service.getKanbanBoard(makeActor(), 'form-id');

    expect(board.groupBy).toBe('phase');
    expect(board.columns.map((c) => c.id)).toEqual(['phase-1', 'phase-2']);
    expect(board.columns[0].cards.map((c) => c.id)).toEqual(['sol-2']);
    expect(board.columns[1].cards.map((c) => c.id)).toEqual(['sol-1']);
  });

  it('board por fase leva o nome do processo, inclusive sem nenhum card', async () => {
    const { service, solicitationsRepo, kanbanPhasesRepo, dataSource } = makeService();
    kanbanPhasesRepo.find.mockResolvedValue([{ id: 'phase-1', label: 'Triagem', color: 'blue', order: 0 }]);

    solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([
        makeSolicitation({
          id: 'sol-1',
          formId: 'form-id',
          form: { id: 'form-id', name: 'Compras', kanbanSettings: null } as never,
        }),
      ]),
    );
    expect((await service.getKanbanBoard(makeActor(), 'form-id')).formName).toBe('Compras');
    expect(dataSource.manager.findOne).not.toHaveBeenCalled();

    // Board vazio (processo novo, ou tudo escondido pelo filtro de cards): busca o formulário.
    solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(makeBoardQueryBuilder([]));
    dataSource.manager.findOne.mockResolvedValue({ id: 'form-id', name: 'Compras', kanbanSettings: null });
    const empty = await service.getKanbanBoard(makeActor(), 'form-id');
    expect(empty.formName).toBe('Compras');
    expect(dataSource.manager.findOne).toHaveBeenCalledWith(FormEntity, expect.objectContaining({ where: { id: 'form-id' } }));
  });

  it('card cancelado sai do board por fase e do resumo', async () => {
    const { service, solicitationsRepo, kanbanPhasesRepo } = makeService();
    kanbanPhasesRepo.find.mockResolvedValue([
      { id: 'phase-1', formId: 'form-id', label: 'Triagem', color: 'blue', order: 0, isTerminal: false },
      { id: 'phase-2', formId: 'form-id', label: 'Execução', color: 'green', order: 1, isTerminal: false },
    ]);
    solicitationsRepo.createQueryBuilder = jest.fn().mockImplementation(() =>
      makeBoardQueryBuilder([
        makeSolicitation({ id: 'sol-open', formId: 'form-id', currentPhaseId: 'phase-2' }),
        makeSolicitation({
          id: 'sol-cancelled',
          formId: 'form-id',
          currentPhaseId: 'phase-2',
          status: SolicitationStatus.CANCELLED,
        }),
        makeSolicitation({
          id: 'sol-cancelled-no-phase',
          formId: 'form-id',
          currentPhaseId: null,
          status: SolicitationStatus.CANCELLED,
        }),
      ]),
    );

    const board = await service.getKanbanBoard(makeActor(), 'form-id');
    expect(board.columns.map((c) => [c.id, c.cards.map((card) => card.id)])).toEqual([
      ['phase-1', []],
      ['phase-2', ['sol-open']],
    ]);

    const summary = await service.getKanbanSummary(makeActor());
    expect(summary).toEqual([expect.objectContaining({ formId: 'form-id', totalCards: 1 })]);
  });

  describe('"Visível para" das fases', () => {
    const phases = [
      { id: 'solicitado', label: 'Solicitado', color: 'blue', order: 0, visibleTo: null },
      {
        id: 'logistica',
        label: 'Logística',
        color: 'amber',
        order: 1,
        visibleTo: { roleCodes: ['logistica'], areaIds: ['area-expedicao'], userIds: ['user-gerente'] },
      },
      {
        id: 'financeiro',
        label: 'Financeiro',
        color: 'purple',
        order: 2,
        visibleTo: { roleCodes: ['financeiro'], areaIds: [], userIds: [] },
      },
    ];

    function setup(seesAll = false) {
      const ctx = makeService();
      ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
      ctx.access.seesAll = seesAll;
      ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
        makeBoardQueryBuilder([
          makeSolicitation({ id: 'sol-novo', formId: 'form-id', currentPhaseId: null }),
          makeSolicitation({ id: 'sol-log', formId: 'form-id', currentPhaseId: 'logistica' }),
          makeSolicitation({ id: 'sol-fin', formId: 'form-id', currentPhaseId: 'financeiro' }),
        ]),
      );
      return ctx;
    }

    const columns = (board: { columns: Array<{ id: string; cards: Array<{ id: string }> }> }) =>
      board.columns.map((column) => [column.id, column.cards.map((card) => card.id)]);

    it('quem não casa com nenhum critério só vê as fases abertas (e os cards delas)', async () => {
      const { service } = setup();
      const board = await service.getKanbanBoard(makeActor({ role: 'vendedor' }), 'form-id');
      expect(columns(board)).toEqual([['solicitado', ['sol-novo']]]);
    });

    it.each([
      ['perfil', { role: 'logistica' }],
      ['área', { role: 'vendedor', areaId: 'area-expedicao' }],
      ['usuário', { role: 'vendedor', sub: 'user-gerente' }],
    ])('casar por %s basta para ver a fase', async (_criterio, actor) => {
      const { service } = setup();
      const board = await service.getKanbanBoard(makeActor(actor), 'form-id');
      expect(columns(board)).toEqual([
        ['solicitado', ['sol-novo']],
        ['logistica', ['sol-log']],
      ]);
    });

    it('quem gerencia fases vê todas, com as restritas marcadas', async () => {
      const { service, processAccess } = setup(true);
      const board = await service.getKanbanBoard(makeActor({ role: 'editor' }), 'form-id');
      expect(processAccess.grantsOf).toHaveBeenCalledWith(expect.objectContaining({ role: 'editor' }));
      expect(board.columns.map((column) => [column.id, column.restrictedVisibility ?? false])).toEqual([
        ['solicitado', false],
        ['logistica', true],
        ['financeiro', true],
      ]);
    });

    it('o resumo do Kanban não conta cards de fases que o usuário não vê', async () => {
      const { service, kanbanPhasesRepo, solicitationsRepo } = setup();
      kanbanPhasesRepo.find.mockResolvedValue(phases.map((phase) => ({ ...phase, formId: 'form-id', isTerminal: false })));
      solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
        makeBoardQueryBuilder([
          makeSolicitation({ id: 'sol-novo', formId: 'form-id', currentPhaseId: null, form: { name: 'Cancelamento' } as never }),
          makeSolicitation({ id: 'sol-log', formId: 'form-id', currentPhaseId: 'logistica', form: { name: 'Cancelamento' } as never }),
          makeSolicitation({ id: 'sol-fin', formId: 'form-id', currentPhaseId: 'financeiro', form: { name: 'Cancelamento' } as never }),
        ]),
      );

      const summary = await service.getKanbanSummary(makeActor({ role: 'financeiro' }));
      expect(summary).toEqual([expect.objectContaining({ formId: 'form-id', totalCards: 2 })]);
    });
  });

  describe('filtro de cards da fase pela resposta', () => {
    const rules = [
      { fieldCode: 'filial', values: ['SP'], roleCodes: ['logistica'], userIds: [] },
      { fieldCode: 'filial', values: ['RJ'], roleCodes: [], userIds: ['user-maria'] },
    ];
    const phasesWith = (othersSeeAll: boolean) => [
      {
        id: 'triagem',
        formId: 'form-id',
        label: 'Triagem',
        color: 'blue',
        order: 0,
        isTerminal: false,
        visibleTo: null,
        cardVisibility: { rules, othersSeeAll },
      },
      { id: 'fim', formId: 'form-id', label: 'Fim', color: 'green', order: 1, isTerminal: false, visibleTo: null },
    ];

    function setup({ seesAll = false, othersSeeAll = true } = {}) {
      const ctx = makeService();
      ctx.kanbanPhasesRepo.find.mockResolvedValue(phasesWith(othersSeeAll));
      ctx.access.seesAll = seesAll;
      // Cards de outra pessoa: o próprio card (aberto ou sob responsabilidade) o filtro não esconde.
      const form = { name: 'Cancelamento' } as never;
      const card = (data: Partial<SolicitationEntity>) =>
        makeSolicitation({ formId: 'form-id', createdBy: 'outra-pessoa', form, ...data });
      const cards = [
        card({ id: 'sol-sp', currentPhaseId: 'triagem', submissionId: 'sub-sp' }),
        card({ id: 'sol-rj', currentPhaseId: 'triagem', submissionId: 'sub-rj' }),
        card({ id: 'sol-mg', currentPhaseId: 'triagem', submissionId: null }),
        card({ id: 'sol-fim', currentPhaseId: 'fim', submissionId: 'sub-sp' }),
      ];
      ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(makeBoardQueryBuilder(cards));
      const submissionItems = {
        find: jest.fn().mockResolvedValue([
          { submissionId: 'sub-sp', fieldCode: 'filial', valueText: 'SP', valueNumber: null, valueBoolean: null, valueJson: null },
          // Resposta com caixa diferente casa do mesmo jeito.
          { submissionId: 'sub-rj', fieldCode: 'filial', valueText: 'rj ', valueNumber: null, valueBoolean: null, valueJson: null },
        ]),
      };
      (ctx.dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn((entity: unknown) => {
        if (entity === SubmissionItemEntity) return submissionItems;
        // Cards dos processos com fase filtrada (lista de Solicitações e de Respostas).
        if (entity === SolicitationEntity) {
          return { createQueryBuilder: () => ({ ...makeBoardQueryBuilder(cards), select: jest.fn().mockReturnThis() }) };
        }
        throw new Error('Unexpected repository');
      });
      // Card sem envio: a resposta veio de um campo de fase.
      ctx.phaseFieldValuesRepo.find.mockResolvedValue([
        { solicitationId: 'sol-mg', fieldCode: 'filial', valueText: 'MG', valueNumber: null, valueBoolean: null, valueJson: null },
      ]);
      return { ...ctx, submissionItems, cards };
    }

    const columns = (board: { columns: Array<{ id: string; cards: Array<{ id: string }> }> }) =>
      board.columns.map((column) => [column.id, column.cards.map((card) => card.id)]);

    it('quem está numa regra pelo perfil só vê os cards com aquela resposta (as outras fases não mudam)', async () => {
      const { service } = setup();
      const board = await service.getKanbanBoard(makeActor({ role: 'logistica' }), 'form-id');
      expect(columns(board)).toEqual([
        ['triagem', ['sol-sp']],
        ['fim', ['sol-fim']],
      ]);
    });

    it('quem está numa regra pelo nome vê os cards da sua resposta', async () => {
      const { service } = setup();
      const board = await service.getKanbanBoard(makeActor({ role: 'vendedor', sub: 'user-maria' }), 'form-id');
      expect(columns(board)).toEqual([
        ['triagem', ['sol-rj']],
        ['fim', ['sol-fim']],
      ]);
    });

    it('quem não está em nenhuma regra vê todos, ou nenhum se a fase disser', async () => {
      const all = await setup().service.getKanbanBoard(makeActor({ role: 'vendedor' }), 'form-id');
      expect(columns(all)[0]).toEqual(['triagem', ['sol-sp', 'sol-rj', 'sol-mg']]);

      const none = await setup({ othersSeeAll: false }).service.getKanbanBoard(makeActor({ role: 'vendedor' }), 'form-id');
      expect(columns(none)).toEqual([
        ['triagem', []],
        ['fim', ['sol-fim']],
      ]);
    });

    it('quem configura as fases vê tudo, com a quantidade de regras na coluna, sem buscar respostas', async () => {
      const { service, submissionItems } = setup({ seesAll: true });
      const board = await service.getKanbanBoard(makeActor({ role: 'editor' }), 'form-id');
      expect(columns(board)[0]).toEqual(['triagem', ['sol-sp', 'sol-rj', 'sol-mg']]);
      expect(board.columns.map((column) => column.cardFilterRules ?? 0)).toEqual([2, 0]);
      expect(submissionItems.find).not.toHaveBeenCalled();
    });

    it('o resumo do Kanban conta só os cards que o filtro deixa ver', async () => {
      const { service } = setup();
      const summary = await service.getKanbanSummary(makeActor({ role: 'logistica' }));
      expect(summary).toEqual([expect.objectContaining({ formId: 'form-id', totalCards: 2 })]);
    });

    it('o card que a pessoa abriu ou do qual é responsável aparece mesmo fora da regra', async () => {
      const ctx = setup();
      const [sp, rj, mg, fim] = ctx.cards;
      ctx.solicitationsRepo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(makeBoardQueryBuilder([sp, { ...rj, assigneeId: 'actor-id' }, { ...mg, createdBy: 'actor-id' }, fim]));
      const board = await ctx.service.getKanbanBoard(makeActor({ role: 'logistica' }), 'form-id');
      expect(columns(board)[0]).toEqual(['triagem', ['sol-sp', 'sol-rj', 'sol-mg']]);
    });

    it('card escondido não abre por link nem gera aviso em tempo real; o da regra e quem configura as fases abrem', async () => {
      const ctx = setup();
      const logistica = makeActor({ role: 'logistica' });
      const [sp, rj] = ctx.cards;

      ctx.solicitationsRepo.findOne.mockResolvedValue(rj);
      await expect(ctx.service.findOne('sol-rj', logistica)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(ctx.service.describeIfVisible('sol-rj', logistica)).resolves.toBeNull();

      ctx.solicitationsRepo.findOne.mockResolvedValue(sp);
      await expect(ctx.service.findOne('sol-sp', logistica)).resolves.toEqual(expect.objectContaining({ id: 'sol-sp' }));

      ctx.access.seesAll = true;
      ctx.solicitationsRepo.findOne.mockResolvedValue(rj);
      await expect(ctx.service.findOne('sol-rj', logistica)).resolves.toEqual(expect.objectContaining({ id: 'sol-rj' }));
    });

    it('a lista de Solicitações deixa de fora os cards que o filtro esconde', async () => {
      const ctx = setup();
      const listQb = {
        ...makeBoardQueryBuilder([]),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(listQb);

      await ctx.service.findAll({ page: 1, limit: 20 } as never, makeActor({ role: 'logistica' }));
      expect(listQb.andWhere).toHaveBeenCalledWith(expect.stringContaining(':hiddenCardIds'), {
        hiddenCardIds: ['sol-rj', 'sol-mg'],
      });

      // Quem não está em regra e a fase diz "vê todos": nada a esconder, nem busca cards.
      listQb.andWhere.mockClear();
      await ctx.service.findAll({ page: 1, limit: 20 } as never, makeActor({ role: 'vendedor' }));
      expect(listQb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining(':hiddenCardIds'), expect.anything());

      ctx.access.seesAll = true;
      await ctx.service.findAll({ page: 1, limit: 20 } as never, makeActor({ role: 'logistica' }));
      expect(listQb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining(':hiddenCardIds'), expect.anything());
    });
  });

  it('formulario sem fases recebe as fases padrao em vez de cair no board por status', async () => {
    const { service, solicitationsRepo, kanbanPhasesRepo, manager } = makeService();
    kanbanPhasesRepo.find.mockResolvedValue([]);
    const formRepo = makeRepository();
    formRepo.findOne.mockResolvedValue({ id: 'form-id' });
    const phaseRepo = makeRepository();
    phaseRepo.find.mockResolvedValue([]);
    phaseRepo.save.mockImplementation((phases: object[]) =>
      Promise.resolve(phases.map((phase, index) => ({ ...phase, id: `phase-${index}` }))),
    );
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === FormEntity) return formRepo;
      if (entity === KanbanPhaseEntity) return phaseRepo;
      throw new Error('Unexpected repository');
    });
    solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(makeBoardQueryBuilder([]));

    const board = await service.getKanbanBoard(makeActor(), 'form-id');

    expect(phaseRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ formId: 'form-id', key: 'novo', label: 'Novo', color: 'blue', order: 0, isTerminal: false }),
      expect.objectContaining({ formId: 'form-id', key: 'pendente', label: 'Pendente', color: 'amber', order: 1, isTerminal: false }),
      expect.objectContaining({ formId: 'form-id', key: 'concluido', label: 'Concluído', color: 'green', order: 2, isTerminal: true }),
    ]);
    expect(board.groupBy).toBe('phase');
    expect(board.columns.map((c) => c.label)).toEqual(['Novo', 'Pendente', 'Concluído']);
  });
});

describe('SolicitationsService.moveStage', () => {
  it('rejeita solicitacao que pertence a um formulario', async () => {
    const { service, manager } = makeService();
    manager.findOne.mockResolvedValue(makeSolicitation({ formId: 'form-id' }));

    await expect(
      service.moveStage('solicitation-id', { stage: 'concluido' }, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coluna igual a atual nao altera o status', async () => {
    const { service, manager, solicitationsRepo, solicitationWriteRepo } = makeService();
    const current = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(current);

    await service.moveStage('solicitation-id', { stage: 'novo' }, makeActor());

    expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
  });

  it('move para a coluna gravando o status equivalente, sem o grafo de transicao', async () => {
    const { service, manager, solicitationsRepo, solicitationWriteRepo, eventEmitter } = makeService();
    // NEW -> IN_PROGRESS nao e uma transicao permitida no grafo de status.
    manager.findOne.mockResolvedValue(makeSolicitation({ status: SolicitationStatus.NEW }));
    solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({ status: SolicitationStatus.IN_PROGRESS }),
    );

    await service.moveStage('solicitation-id', { stage: 'pendente' }, makeActor());

    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.IN_PROGRESS }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.moved',
      expect.objectContaining({
        fromStatus: SolicitationStatus.NEW,
        toStatus: SolicitationStatus.IN_PROGRESS,
      }),
    );
  });
});

describe('SolicitationsService.moveCard', () => {
  it('movimentacao valida atualiza status', async () => {
    const { service, solicitationsRepo, manager, solicitationWriteRepo } = makeService();
    const current = makeSolicitation({ status: SolicitationStatus.NEW });
    const updated = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    const result = await service.moveCard(
      'solicitation-id',
      { status: SolicitationStatus.IN_ANALYSIS },
      makeActor(),
    );

    expect(result.status).toBe(SolicitationStatus.IN_ANALYSIS);
    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.IN_ANALYSIS }),
    );
  });

  it('movimentacao valida registra historico', async () => {
    const { service, solicitationsRepo, manager, historyWriteRepo } = makeService();
    const current = makeSolicitation({ status: SolicitationStatus.NEW });
    const updated = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    await service.moveCard(
      'solicitation-id',
      { status: SolicitationStatus.IN_ANALYSIS },
      makeActor(),
    );

    expect(historyWriteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SolicitationHistoryEventType.STATUS_CHANGED,
        fromValue: SolicitationStatus.NEW,
        toValue: SolicitationStatus.IN_ANALYSIS,
      }),
    );
  });

  it('movimentacao valida emite evento solicitations.moved', async () => {
    const { service, solicitationsRepo, manager, eventEmitter } = makeService();
    const current = makeSolicitation({ status: SolicitationStatus.NEW });
    const updated = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    await service.moveCard(
      'solicitation-id',
      { status: SolicitationStatus.IN_ANALYSIS },
      makeActor(),
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.moved',
      expect.objectContaining({
        fromStatus: SolicitationStatus.NEW,
        toStatus: SolicitationStatus.IN_ANALYSIS,
      }),
    );
  });

  it('movimentacao invalida lanca BadRequestException com mensagem descritiva', async () => {
    const { service, manager } = makeService();
    manager.findOne.mockResolvedValue(makeSolicitation({ status: SolicitationStatus.NEW }));

    await expect(
      service.moveCard(
        'solicitation-id',
        { status: SolicitationStatus.COMPLETED },
        makeActor(),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(SolicitationStatus.NEW),
    });
  });

  it('movimentacao valida atualiza metricas de status e incrementa contador de movimentacoes', async () => {
    const { service, solicitationsRepo, manager, metricsService } = makeService();
    const current = makeSolicitation({ status: SolicitationStatus.NEW });
    const updated = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    await service.moveCard(
      'solicitation-id',
      { status: SolicitationStatus.IN_ANALYSIS },
      makeActor(),
    );

    expect(metricsService.decrementSolicitationsByStatus).toHaveBeenCalledWith(
      SolicitationStatus.NEW,
    );
    expect(metricsService.incrementSolicitationsByStatus).toHaveBeenCalledWith(
      SolicitationStatus.IN_ANALYSIS,
    );
    expect(metricsService.incrementKanbanMoves).toHaveBeenCalledWith(
      SolicitationStatus.NEW,
      SolicitationStatus.IN_ANALYSIS,
    );
  });

  it('atualiza currentStage no metadata ao mover', async () => {
    const { service, solicitationsRepo, manager, solicitationWriteRepo } = makeService();
    const current = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    const updated = makeSolicitation({ status: SolicitationStatus.IN_PROGRESS });

    manager.findOne.mockResolvedValue(current);
    solicitationsRepo.findOne.mockResolvedValue(updated);

    await service.moveCard(
      'solicitation-id',
      { status: SolicitationStatus.IN_PROGRESS, currentStage: 'Triagem' },
      makeActor(),
    );

    expect(solicitationWriteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ currentStage: 'Triagem' }),
      }),
    );
  });

  it('carrega o form ao buscar para mutacao (o acesso e conferido pelo processo do card)', async () => {
    const { service, solicitationsRepo, manager } = makeService();
    manager.findOne.mockResolvedValue(makeSolicitation({ status: SolicitationStatus.NEW }));
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS }));

    await service.moveCard('solicitation-id', { status: SolicitationStatus.IN_ANALYSIS }, makeActor());

    expect(manager.findOne).toHaveBeenCalledWith(
      SolicitationEntity,
      expect.objectContaining({
        relations: expect.objectContaining({ form: true }),
      }),
    );
  });
});

describe('SolicitationsService.movePhase', () => {
  it('bloqueia mover para outra fase quando a fase atual exige aprovacao e nao ha aprovacao aprovada', async () => {
    const { service, kanbanPhasesRepo, manager } = makeService();
    const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-current' });
    const targetPhase = { id: 'phase-target', formId: 'form-id', label: 'Produção' };
    const currentPhase = {
      id: 'phase-current',
      formId: 'form-id',
      label: 'Preenchimento inicial',
      requiresApproval: true,
    };

    kanbanPhasesRepo.findOne.mockResolvedValue(targetPhase);
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === SolicitationEntity) return Promise.resolve(solicitation);
      if (entity === KanbanPhaseEntity) return Promise.resolve(currentPhase);
      if (entity === ApprovalEntity) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    await expect(
      service.movePhase('solicitation-id', { phaseId: 'phase-target' }, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite mover quando ha uma aprovacao aprovada para a fase atual', async () => {
    const { service, kanbanPhasesRepo, manager, solicitationsRepo } = makeService();
    const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-current' });
    const targetPhase = { id: 'phase-target', formId: 'form-id', label: 'Produção' };
    const currentPhase = {
      id: 'phase-current',
      formId: 'form-id',
      label: 'Preenchimento inicial',
      requiresApproval: true,
    };

    kanbanPhasesRepo.findOne.mockResolvedValue(targetPhase);
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === SolicitationEntity) return Promise.resolve(solicitation);
      if (entity === KanbanPhaseEntity) return Promise.resolve(currentPhase);
      if (entity === ApprovalEntity) {
        return Promise.resolve({ id: 'approval-1', status: ApprovalStatus.APPROVED });
      }
      return Promise.resolve(null);
    });
    solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({ currentPhaseId: 'phase-target' }),
    );

    const result = await service.movePhase(
      'solicitation-id',
      { phaseId: 'phase-target' },
      makeActor(),
    );

    expect(result).toBeDefined();
  });

  it('bloqueia mover quando currentPhaseId e nulo mas a primeira fase do formulario exige aprovacao', async () => {
    // Uma solicitacao recem-criada ainda nao teve movePhase chamado — o board
    // a mostra visualmente na primeira fase do formulario (fallback em
    // getKanbanBoardByPhase), e o gate precisa enxergar essa mesma fase.
    const { service, kanbanPhasesRepo, manager, solicitationWriteRepo, historyWriteRepo } =
      makeService();
    const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: null });
    const targetPhase = { id: 'phase-target', formId: 'form-id', label: 'Produção' };
    const firstPhase = {
      id: 'phase-first',
      formId: 'form-id',
      label: 'Preenchimento inicial',
      requiresApproval: true,
    };

    kanbanPhasesRepo.findOne.mockResolvedValue(targetPhase);
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === SolicitationEntity) return Promise.resolve(solicitation);
      if (entity === KanbanPhaseEntity) return Promise.resolve(firstPhase);
      if (entity === ApprovalEntity) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === SolicitationEntity) return solicitationWriteRepo;
      if (entity === SolicitationHistoryEntity) return historyWriteRepo;
      if (entity === KanbanPhaseEntity) {
        return { ...makeRepository(), find: jest.fn().mockResolvedValue([firstPhase]) };
      }
      throw new Error(`Unexpected repository: ${String(entity)}`);
    });

    await expect(
      service.movePhase('solicitation-id', { phaseId: 'phase-target' }, makeActor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite mover livremente quando a fase atual nao exige aprovacao (regressao)', async () => {
    const { service, kanbanPhasesRepo, manager, solicitationsRepo } = makeService();
    const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-current' });
    const targetPhase = { id: 'phase-target', formId: 'form-id', label: 'Produção' };
    const currentPhase = {
      id: 'phase-current',
      formId: 'form-id',
      label: 'Fase livre',
      requiresApproval: false,
    };

    kanbanPhasesRepo.findOne.mockResolvedValue(targetPhase);
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === SolicitationEntity) return Promise.resolve(solicitation);
      if (entity === KanbanPhaseEntity) return Promise.resolve(currentPhase);
      return Promise.resolve(null);
    });
    solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({ currentPhaseId: 'phase-target' }),
    );

    const result = await service.movePhase(
      'solicitation-id',
      { phaseId: 'phase-target' },
      makeActor(),
    );

    expect(result).toBeDefined();
  });

  describe('regras de processo montadas como fluxo', () => {
    // Triagem (0) → Aprovação (1) → Compra (2); o card está na Aprovação.
    const triagem = { id: 'p-triagem', formId: 'form-id', label: 'Triagem', order: 0, requiresApproval: false };
    const aprovacao = { id: 'p-aprov', formId: 'form-id', label: 'Aprovação', order: 1, requiresApproval: false };
    const compra = { id: 'p-compra', formId: 'form-id', label: 'Compra', order: 2, requiresApproval: false };

    function setup(target: object, latestApproval: { id?: string; status: ApprovalStatus } | null) {
      const ctx = makeService();
      const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'p-aprov' });
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue(target);
      ctx.manager.findOne.mockImplementation((entity: unknown) => {
        if (entity === SolicitationEntity) return Promise.resolve(solicitation);
        if (entity === KanbanPhaseEntity) return Promise.resolve(aprovacao);
        if (entity === ApprovalEntity) return Promise.resolve(latestApproval);
        return Promise.resolve(null);
      });
      const approvalWriteRepo = makeRepository();
      const stepWriteRepo = makeRepository();
      const find = jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === ApprovalEntity && latestApproval?.status === ApprovalStatus.PENDING
            ? [{ id: 'ap-1', status: ApprovalStatus.PENDING }]
            : entity === ApprovalStepEntity
              ? [{ id: 'step-1', approvalId: 'ap-1', status: 'pending' }]
              : [],
        ),
      );
      Object.assign(ctx.manager, { find });
      const getRepository = ctx.manager.getRepository.getMockImplementation() as (
        entity: unknown,
      ) => ReturnType<typeof makeRepository>;
      ctx.manager.getRepository.mockImplementation((entity: unknown) => {
        if (entity === ApprovalEntity) return approvalWriteRepo;
        if (entity === ApprovalStepEntity) return stepWriteRepo;
        return getRepository(entity);
      });
      ctx.solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ currentPhaseId: 'p-x' }));
      return { ...ctx, approvalWriteRepo, stepWriteRepo };
    }

    it('aprovação pendente desta passagem pela fase segura o card (aprovação criada por fluxo)', async () => {
      const { service } = setup(compra, { status: ApprovalStatus.PENDING });
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-compra' }, makeActor()),
      ).rejects.toThrow('A fase atual ("Aprovação") tem uma aprovação pendente. Aguarde a decisão para avançar.');
    });

    it('aprovação reprovada só deixa voltar', async () => {
      const { service } = setup(compra, { status: ApprovalStatus.REJECTED });
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-compra' }, makeActor()),
      ).rejects.toThrow('o card só pode voltar para uma fase anterior');
    });

    it('aprovação reprovada deixa o processo (fluxo) levar o card adiante, ex.: Não → Cancelado', async () => {
      const { service, eventEmitter } = setup(compra, { status: ApprovalStatus.REJECTED });
      await service.movePhase('solicitation-id', { phaseId: 'p-compra' }, makeActor(), {
        flowEventDepth: 1,
        byAutomation: true,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ fromPhaseId: 'p-aprov', toPhaseId: 'p-compra' }),
      );
    });

    it('reprovada libera o processo mesmo com "Exige aprovação" na fase', async () => {
      const { service, manager, eventEmitter } = setup(compra, { status: ApprovalStatus.REJECTED });
      const exige = { ...aprovacao, requiresApproval: true };
      manager.findOne.mockImplementation((entity: unknown) => {
        if (entity === SolicitationEntity) {
          return Promise.resolve(makeSolicitation({ formId: 'form-id', currentPhaseId: 'p-aprov' }));
        }
        if (entity === KanbanPhaseEntity) return Promise.resolve(exige);
        if (entity === ApprovalEntity) return Promise.resolve({ status: ApprovalStatus.REJECTED });
        return Promise.resolve(null);
      });
      await service.movePhase('solicitation-id', { phaseId: 'p-compra' }, null, { byAutomation: true });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-compra' }),
      );
    });

    it('aprovação pendente segura também o processo (fluxo)', async () => {
      const { service } = setup(compra, { status: ApprovalStatus.PENDING });
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-compra' }, makeActor(), { byAutomation: true }),
      ).rejects.toThrow('tem uma aprovação pendente');
    });

    it('voltar para fase anterior não depende de aprovação e cancela a pendente', async () => {
      const { service, approvalWriteRepo, stepWriteRepo, eventEmitter } = setup(triagem, {
        status: ApprovalStatus.PENDING,
      });
      await service.movePhase('solicitation-id', { phaseId: 'p-triagem' }, makeActor(), {
        flowEventDepth: 1,
      });
      expect(approvalWriteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ap-1', status: ApprovalStatus.CANCELLED }),
      );
      expect(stepWriteRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'step-1', status: 'skipped' }));
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({
          solicitationId: 'solicitation-id',
          fromPhaseId: 'p-aprov',
          toPhaseId: 'p-triagem',
          flowDepth: 1,
        }),
      );
    });

    it('avançar com a aprovação aprovada emite "entrou na fase"', async () => {
      const { service, eventEmitter } = setup(compra, { status: ApprovalStatus.APPROVED });
      await service.movePhase('solicitation-id', { phaseId: 'p-compra' }, makeActor());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ fromPhaseId: 'p-aprov', toPhaseId: 'p-compra', flowDepth: 0 }),
      );
    });
  });

  describe('quem aprova a fase aprova ao mover o card', () => {
    // Triagem (0) → Aprovação (1, exige aprovação do perfil "financeiro") → Compra (2) → Entrega (3).
    const triagem = { id: 'p-triagem', formId: 'form-id', label: 'Triagem', order: 0, requiresApproval: false };
    const aprovacao = {
      id: 'p-aprov',
      formId: 'form-id',
      label: 'Aprovação',
      order: 1,
      requiresApproval: true,
      approvers: { roleCodes: ['financeiro'], userIds: ['user-diretor'] },
      approvalMode: 'any',
    };
    const compra = { id: 'p-compra', formId: 'form-id', label: 'Compra', order: 2, requiresApproval: false };
    const entrega = { id: 'p-entrega', formId: 'form-id', label: 'Entrega', order: 3, requiresApproval: false };
    const aprovador = () => makeActor({ sub: 'user-fin', role: 'financeiro' });
    const vendedor = () => makeActor({ sub: 'user-vend', role: 'vendedor' });

    /**
     * `latest`: a aprovação desta passagem antes do movimento. Aprovar a etapa (approveStep) muda o
     * status dela para `afterApprove` — "approved" quando basta um.
     */
    function setup(
      options: {
        phase?: object;
        target?: object;
        latest?: { id: string; status: ApprovalStatus } | null;
        afterApprove?: ApprovalStatus;
        myStep?: { id: string } | null;
        solicitation?: Partial<SolicitationEntity>;
      } = {},
    ) {
      const ctx = makeService();
      const phase = options.phase ?? aprovacao;
      let latest = options.latest === undefined ? null : options.latest;
      const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'p-aprov', ...options.solicitation });
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue(options.target ?? compra);
      ctx.manager.findOne.mockImplementation((entity: unknown) => {
        if (entity === SolicitationEntity) return Promise.resolve(solicitation);
        if (entity === KanbanPhaseEntity) return Promise.resolve(phase);
        if (entity === ApprovalEntity) return Promise.resolve(latest);
        if (entity === ApprovalStepEntity) {
          return Promise.resolve(options.myStep === undefined ? { id: 'step-fin' } : options.myStep);
        }
        return Promise.resolve(null);
      });
      ctx.manager.find.mockImplementation((entity: unknown) => {
        if (entity === RoleEntity) return Promise.resolve([{ code: 'financeiro', name: 'Financeiro' }]);
        if (entity === UserEntity) return Promise.resolve([{ id: 'user-diretor', fullName: 'Diretora Ana' }]);
        return Promise.resolve([]);
      });
      const createApproval = jest.fn().mockImplementation(() => {
        latest = { id: 'ap-novo', status: ApprovalStatus.PENDING };
        return Promise.resolve(latest);
      });
      const approveStep = jest.fn().mockImplementation(() => {
        if (latest) latest = { ...latest, status: options.afterApprove ?? ApprovalStatus.APPROVED };
        return Promise.resolve({});
      });
      Object.assign(ctx.approvalsService, { createApproval, approveStep });
      ctx.solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ currentPhaseId: 'p-compra' }));
      return { ...ctx, createApproval, approveStep };
    }

    async function blockOf(promise: Promise<unknown>): Promise<Record<string, unknown>> {
      const error = await promise.then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(BadRequestException);
      return (error as BadRequestException).getResponse() as Record<string, unknown>;
    }

    it('sem aprovação ainda: pede, aprova pelo aprovador e o card vai para onde foi solto', async () => {
      const { service, createApproval, approveStep, eventEmitter } = setup({ target: entrega });
      await service.movePhase('solicitation-id', { phaseId: 'p-entrega' }, aprovador());

      expect(createApproval).toHaveBeenCalledWith(
        'solicitation-id',
        expect.objectContaining({ phaseId: 'p-aprov', assignedRoleCodes: ['financeiro'] }),
        expect.objectContaining({ sub: 'user-fin' }),
        // Basta um: decide na hora, ninguém mais recebe "aguarda sua decisão".
        { notify: false },
      );
      expect(approveStep).toHaveBeenCalledWith(
        'step-fin',
        { decision: 'approved', comment: 'Aprovado ao mover o card para "Entrega".' },
        expect.objectContaining({ sub: 'user-fin' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ fromPhaseId: 'p-aprov', toPhaseId: 'p-entrega' }),
      );
    });

    it('com aprovação pendente: decide a etapa do aprovador, sem pedir outra', async () => {
      const { service, createApproval, approveStep, eventEmitter } = setup({
        latest: { id: 'ap-1', status: ApprovalStatus.PENDING },
      });
      await service.movePhase('solicitation-id', { phaseId: 'p-compra' }, aprovador());

      expect(createApproval).not.toHaveBeenCalled();
      expect(approveStep).toHaveBeenCalledWith('step-fin', expect.objectContaining({ decision: 'approved' }), expect.anything());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-compra' }),
      );
    });

    it('usuário da lista de aprovadores (não só o perfil) também aprova ao mover', async () => {
      const { service, approveStep } = setup();
      await service.movePhase('solicitation-id', { phaseId: 'p-compra' }, makeActor({ sub: 'user-diretor', role: 'vendedor' }));
      expect(approveStep).toHaveBeenCalled();
    });

    it('a regra "aprovada → próxima fase" não move de novo a aprovação decidida pelo movimento', async () => {
      const { service, approveStep, manager } = setup({ target: entrega });
      let outcome: Promise<void> | null = null;
      const approve = approveStep.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
      approveStep.mockImplementation((...args: unknown[]) => {
        // O listener de "aprovação aprovada" roda enquanto o movimento ainda não terminou.
        outcome = service.applyPhaseApprovalOutcome('ap-novo');
        return approve(...args);
      });
      await service.movePhase('solicitation-id', { phaseId: 'p-entrega' }, aprovador());
      await outcome;
      expect(manager.findOne).not.toHaveBeenCalledWith(ApprovalEntity, { where: { id: 'ap-novo' } });
    });

    it('"todos aprovam": registra a dele e o card fica até os demais decidirem', async () => {
      const { service, approveStep, eventEmitter } = setup({
        phase: { ...aprovacao, approvalMode: 'all' },
        afterApprove: ApprovalStatus.PENDING,
      });
      const body = await blockOf(service.movePhase('solicitation-id', { phaseId: 'p-compra' }, aprovador()));

      expect(approveStep).toHaveBeenCalled();
      expect(body).toEqual(
        expect.objectContaining({
          code: 'phase_approval_pending',
          message: 'Sua aprovação da fase "Aprovação" foi registrada. O card avança quando os demais aprovadores decidirem.',
          canRequest: false,
        }),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('solicitations.phase_changed', expect.anything());
    });

    it('em sequência e não é a vez dele: não decide nada e o card fica pendente', async () => {
      const { service, approveStep, createApproval } = setup({
        phase: { ...aprovacao, approvalMode: 'sequential' },
        myStep: null,
      });
      const body = await blockOf(service.movePhase('solicitation-id', { phaseId: 'p-compra' }, aprovador()));
      // Em sequência os demais precisam do aviso.
      expect(createApproval).toHaveBeenCalledWith('solicitation-id', expect.anything(), expect.anything(), {
        notify: true,
      });
      expect(approveStep).not.toHaveBeenCalled();
      expect(body.code).toBe('phase_approval_pending');
    });

    it('quem não aprova: a trava diz quem aprova e que pode pedir a aprovação (pop-up)', async () => {
      const { service, approveStep, createApproval } = setup();
      const body = await blockOf(service.movePhase('solicitation-id', { phaseId: 'p-compra' }, vendedor()));

      expect(approveStep).not.toHaveBeenCalled();
      expect(createApproval).not.toHaveBeenCalled();
      expect(body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'A fase atual ("Aprovação") exige aprovação antes de avançar.',
        code: 'phase_approval_required',
        phaseId: 'p-aprov',
        phaseLabel: 'Aprovação',
        approvers: ['Diretora Ana', 'perfil Financeiro'],
        canRequest: true,
      });
    });

    it('quem não atua na fase vê a trava sem a opção de pedir', async () => {
      const { service } = setup({
        phase: { ...aprovacao, actors: { roleCodes: ['logistica'], userIds: [] } },
      });
      const body = await blockOf(service.movePhase('solicitation-id', { phaseId: 'p-compra' }, vendedor()));
      expect(body).toEqual(expect.objectContaining({ code: 'phase_approval_required', canRequest: false }));
    });

    it('quem não aprova e já há pendente: trava "pendente", sem pedir outra', async () => {
      const { service } = setup({ latest: { id: 'ap-1', status: ApprovalStatus.PENDING } });
      const body = await blockOf(service.movePhase('solicitation-id', { phaseId: 'p-compra' }, vendedor()));
      expect(body).toEqual(
        expect.objectContaining({
          code: 'phase_approval_pending',
          message: 'A fase atual ("Aprovação") tem uma aprovação pendente. Aguarde a decisão para avançar.',
        }),
      );
    });

    it('aprovador devolvendo o card não aprova nada', async () => {
      const { service, approveStep, createApproval } = setup({ target: triagem });
      await service.movePhase('solicitation-id', { phaseId: 'p-triagem' }, aprovador());
      expect(approveStep).not.toHaveBeenCalled();
      expect(createApproval).not.toHaveBeenCalled();
    });

    it('outra trava de saída (responsável) barra antes de aprovar', async () => {
      const { service, approveStep, createApproval } = setup({
        phase: { ...aprovacao, requireAssigneeToExit: true },
      });
      await expect(service.movePhase('solicitation-id', { phaseId: 'p-compra' }, aprovador())).rejects.toThrow(
        BadRequestException,
      );
      expect(createApproval).not.toHaveBeenCalled();
      expect(approveStep).not.toHaveBeenCalled();
    });

    it('movimento do processo (fluxo) não aprova em nome de ninguém', async () => {
      const { service, approveStep } = setup();
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-compra' }, aprovador(), { byAutomation: true }),
      ).rejects.toThrow('exige aprovação');
      expect(approveStep).not.toHaveBeenCalled();
    });
  });

  describe('só sai da fase com os obrigatórios preenchidos (requireFieldsToExit)', () => {
    // Triagem (0) → Conferência (1) → Expedição (2); o card está na Conferência.
    const triagem = { id: 'p-triagem', formId: 'form-id', label: 'Triagem', order: 0, requiresApproval: false };
    const expedicao = { id: 'p-exped', formId: 'form-id', label: 'Expedição', order: 2, requiresApproval: false };
    const conferencia = {
      id: 'p-conf',
      formId: 'form-id',
      label: 'Conferência',
      order: 1,
      requiresApproval: false,
      requireFieldsToExit: true,
      sectionFlow: null as unknown,
    };
    const fields = [
      { id: 'f-nf', code: 'nota', label: 'Nota fiscal', fieldType: 'short_text', required: true, order: 0 },
      { id: 'f-ok', code: 'conferido', label: 'Conferido', fieldType: 'checkbox', required: true, order: 1 },
      { id: 'f-obs', code: 'obs', label: 'Observação', fieldType: 'long_text', required: false, order: 2 },
      { id: 'f-tit', code: 'titulo', label: 'Dados', fieldType: 'title', required: true, order: 3 },
      { id: 'f-calc', code: 'total', label: 'Total', fieldType: 'calculated', required: true, order: 4 },
    ];
    const value = (phaseFieldId: string, patch: object) => ({
      phaseFieldId,
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      valueJson: null,
      ...patch,
    });

    function setup(target: object, saved: object[], phase: object = conferencia, phaseFields: object[] = fields) {
      const ctx = makeService();
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue(target);
      ctx.manager.findOne.mockImplementation((entity: unknown) => {
        if (entity === SolicitationEntity) {
          return Promise.resolve(makeSolicitation({ formId: 'form-id', currentPhaseId: 'p-conf' }));
        }
        if (entity === KanbanPhaseEntity) return Promise.resolve(phase);
        return Promise.resolve(null);
      });
      ctx.manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === KanbanPhaseFieldEntity ? phaseFields : entity === KanbanPhaseFieldValueEntity ? saved : [],
        ),
      );
      ctx.solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ currentPhaseId: 'p-x' }));
      return ctx;
    }

    it('segura o card e diz quais campos faltam (texto só com espaços e checkbox desmarcado contam como vazio)', async () => {
      const { service, solicitationWriteRepo } = setup(expedicao, [
        value('f-nf', { valueText: '   ' }),
        value('f-ok', { valueBoolean: false }),
      ]);
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor()),
      ).rejects.toThrow('Para sair da fase "Conferência", preencha os campos obrigatórios: "Nota fiscal", "Conferido".');
      expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
    });

    it('com um campo só, a mensagem fica no singular', async () => {
      const { service } = setup(expedicao, [value('f-nf', { valueText: 'NF 123' })]);
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor()),
      ).rejects.toThrow('Para sair da fase "Conferência", preencha o campo obrigatório: "Conferido".');
    });

    it('com os obrigatórios preenchidos o card avança (título e cálculo nunca são cobrados)', async () => {
      const { service, eventEmitter } = setup(expedicao, [
        value('f-nf', { valueText: 'NF 123' }),
        value('f-ok', { valueBoolean: true }),
      ]);
      await service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ fromPhaseId: 'p-conf', toPhaseId: 'p-exped' }),
      );
    });

    it('segura também o processo (fluxo, aprovação que avança sozinha)', async () => {
      const { service } = setup(expedicao, []);
      await expect(
        service.movePhase('solicitation-id', { phaseId: 'p-exped' }, null, { byAutomation: true }),
      ).rejects.toThrow('Para sair da fase "Conferência"');
    });

    it('voltar para uma fase anterior é livre', async () => {
      const { service, eventEmitter } = setup(triagem, []);
      await service.movePhase('solicitation-id', { phaseId: 'p-triagem' }, makeActor());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-triagem' }),
      );
    });

    it('com a opção desligada, obrigatório vazio não segura o card (como antes)', async () => {
      const { service, manager, eventEmitter } = setup(expedicao, [], { ...conferencia, requireFieldsToExit: false });
      await service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor());
      expect(manager.find).not.toHaveBeenCalledWith(KanbanPhaseFieldEntity, expect.anything());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-exped' }),
      );
    });

    describe('exige responsável (requireAssigneeToExit), na mesma checagem', () => {
      const exigeResponsavel = { ...conferencia, requireFieldsToExit: false, requireAssigneeToExit: true };
      function withAssignee(ctx: ReturnType<typeof setup> & { phase: object }, assigneeId: string | null): void {
        ctx.manager.findOne.mockImplementation((entity: unknown) => {
          if (entity === SolicitationEntity) {
            return Promise.resolve(makeSolicitation({ formId: 'form-id', currentPhaseId: 'p-conf', assigneeId }));
          }
          if (entity === KanbanPhaseEntity) return Promise.resolve(ctx.phase);
          return Promise.resolve(null);
        });
      }

      it('sem ninguém atribuído o card não avança, nem pelo processo', async () => {
        const ctx = { ...setup(expedicao, [], exigeResponsavel), phase: exigeResponsavel };
        withAssignee(ctx, null);
        await expect(
          ctx.service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor()),
        ).rejects.toThrow('Para sair da fase "Conferência", atribua um responsável ao card.');
        await expect(
          ctx.service.movePhase('solicitation-id', { phaseId: 'p-exped' }, null, { byAutomation: true }),
        ).rejects.toThrow('atribua um responsável ao card');
        // Só a trava de responsável: os campos nem são consultados.
        expect(ctx.manager.find).not.toHaveBeenCalledWith(KanbanPhaseFieldEntity, expect.anything());
      });

      it('com responsável o card avança; voltar é livre mesmo sem responsável', async () => {
        const ctx = { ...setup(expedicao, [], exigeResponsavel), phase: exigeResponsavel };
        withAssignee(ctx, 'user-1');
        await ctx.service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor());
        expect(ctx.eventEmitter.emit).toHaveBeenCalledWith(
          'solicitations.phase_changed',
          expect.objectContaining({ toPhaseId: 'p-exped' }),
        );

        const back = { ...setup(triagem, [], exigeResponsavel), phase: exigeResponsavel };
        withAssignee(back, null);
        await back.service.movePhase('solicitation-id', { phaseId: 'p-triagem' }, makeActor());
        expect(back.eventEmitter.emit).toHaveBeenCalledWith(
          'solicitations.phase_changed',
          expect.objectContaining({ toPhaseId: 'p-triagem' }),
        );
      });

      it('com as duas travas, uma mensagem lista o responsável e os campos', async () => {
        const ambas = { ...conferencia, requireAssigneeToExit: true };
        const ctx = { ...setup(expedicao, [value('f-nf', { valueText: 'NF 1' })], ambas), phase: ambas };
        withAssignee(ctx, null);
        await expect(
          ctx.service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor()),
        ).rejects.toThrow(
          'Para sair da fase "Conferência", atribua um responsável ao card e preencha o campo obrigatório: "Conferido".',
        );
      });
    });

    describe('ramificação no formulário da fase', () => {
      const branchFields = [
        {
          id: 'f-tipo',
          code: 'tipo',
          label: 'Tipo',
          fieldType: 'single_select',
          required: true,
          order: 0,
          optionsJson: [
            { value: 'nacional', label: 'Nacional' },
            { value: 'importacao', label: 'Importação' },
          ],
        },
        { id: 'f-sec-imp', code: 'sec_importacao', label: 'Importação', fieldType: 'title', required: false, order: 1 },
        { id: 'f-incoterm', code: 'incoterm', label: 'Incoterm', fieldType: 'short_text', required: true, order: 2 },
        { id: 'f-sec-fim', code: 'sec_fechamento', label: 'Fechamento', fieldType: 'title', required: false, order: 3 },
        { id: 'f-valor', code: 'valor_final', label: 'Valor final', fieldType: 'short_text', required: true, order: 4 },
      ];
      const branched = {
        ...conferencia,
        sectionFlow: [
          {
            section: '__inicio__',
            next: 'sec_fechamento',
            branches: [{ fieldCode: 'tipo', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' }],
          },
        ],
      };

      it('obrigatório de seção fora do caminho não é cobrado', async () => {
        const saved = [value('f-tipo', { valueText: 'nacional' }), value('f-valor', { valueText: '10' })];
        const { service, eventEmitter } = setup(expedicao, saved, branched, branchFields);
        await service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor());
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'solicitations.phase_changed',
          expect.objectContaining({ toPhaseId: 'p-exped' }),
        );
      });

      it('a seção que entra no caminho passa a ser cobrada', async () => {
        const saved = [value('f-tipo', { valueText: 'importacao' }), value('f-valor', { valueText: '10' })];
        const { service } = setup(expedicao, saved, branched, branchFields);
        await expect(
          service.movePhase('solicitation-id', { phaseId: 'p-exped' }, makeActor()),
        ).rejects.toThrow('preencha o campo obrigatório: "Incoterm".');
      });
    });
  });
  describe('ponto sem volta (blockMoveBack)', () => {
    // Triagem (0) → Aprovado (1, ponto sem volta) → Produção (2).
    const triagem = { id: 'p-tri', formId: 'form-id', label: 'Triagem', order: 0, requiresApproval: false };
    const aprovado = {
      id: 'p-apr',
      formId: 'form-id',
      label: 'Aprovado',
      order: 1,
      requiresApproval: false,
      blockMoveBack: true,
    };
    const producao = { id: 'p-prod', formId: 'form-id', label: 'Produção', order: 2, requiresApproval: false };

    function setup(current: { id: string }, target: object, phases: object[] = [triagem, aprovado, producao]) {
      const ctx = makeService();
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue(target);
      ctx.manager.findOne.mockImplementation((entity: unknown) => {
        if (entity === SolicitationEntity) {
          return Promise.resolve(makeSolicitation({ formId: 'form-id', currentPhaseId: current.id }));
        }
        if (entity === KanbanPhaseEntity) return Promise.resolve(current);
        return Promise.resolve(null);
      });
      ctx.manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(entity === KanbanPhaseEntity ? phases : []),
      );
      ctx.solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ currentPhaseId: 'p-x' }));
      return ctx;
    }
    // Atua no processo, mas não configura as fases.
    const operador = () => makeActor({ role: 'manager' });

    it('quem só atua não devolve o card para antes do ponto sem volta', async () => {
      const { service, solicitationWriteRepo, eventEmitter } = setup(producao, triagem);
      await expect(service.movePhase('solicitation-id', { phaseId: 'p-tri' }, operador())).rejects.toThrow(
        'O card já chegou à fase "Aprovado", que é um ponto sem volta',
      );
      expect(solicitationWriteRepo.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('vale também saindo da própria fase marcada', async () => {
      const { service } = setup(aprovado, triagem);
      await expect(service.movePhase('solicitation-id', { phaseId: 'p-tri' }, operador())).rejects.toThrow(
        'ponto sem volta',
      );
    });

    it('voltar ATÉ a fase marcada pode', async () => {
      const { service, eventEmitter } = setup(producao, aprovado);
      await service.movePhase('solicitation-id', { phaseId: 'p-apr' }, operador());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ fromPhaseId: 'p-prod', toPhaseId: 'p-apr' }),
      );
    });

    it('quem configura as fases do processo devolve (corrigir avanço por engano)', async () => {
      const { service, access, eventEmitter } = setup(producao, triagem);
      access.seesAll = true;
      await service.movePhase('solicitation-id', { phaseId: 'p-tri' }, operador());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-tri' }),
      );
    });

    it('o processo (fluxo, reprovação que devolve sozinha) passa', async () => {
      const { service, eventEmitter } = setup(producao, triagem);
      await service.movePhase('solicitation-id', { phaseId: 'p-tri' }, operador(), { byAutomation: true });
      await service.movePhase('solicitation-id', { phaseId: 'p-tri' }, null, { byAutomation: true });
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('avançar não é afetado', async () => {
      const { service, eventEmitter } = setup(aprovado, producao);
      await service.movePhase('solicitation-id', { phaseId: 'p-prod' }, operador());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-prod' }),
      );
    });

    it('com a opção desligada, voltar é livre (como antes)', async () => {
      const { service, eventEmitter } = setup(producao, triagem, [triagem, { ...aprovado, blockMoveBack: false }, producao]);
      await service.movePhase('solicitation-id', { phaseId: 'p-tri' }, operador());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'solicitations.phase_changed',
        expect.objectContaining({ toPhaseId: 'p-tri' }),
      );
    });
  });
});

describe('SolicitationsService — valor do card e cálculos de fase', () => {
  const phases = [
    {
      id: 'phase-1',
      label: 'Cotação',
      color: 'blue',
      order: 0,
      actorRoleCode: null,
      fields: [
        { id: 'f-frete', code: 'frete', label: 'Frete', fieldType: FormFieldType.CURRENCY, required: false },
        {
          id: 'f-total',
          code: 'total',
          label: 'Total',
          fieldType: FormFieldType.CALCULATED,
          required: true,
          settingsJson: { formula: '{valor} + {frete}' },
        },
      ],
    },
    { id: 'phase-2', label: 'Compra', color: 'green', order: 1, actorRoleCode: null, fields: [] },
  ];

  function withSubmissionItems(ctx: ReturnType<typeof makeService>, items: unknown[]) {
    const submissionItems = { find: jest.fn().mockResolvedValue(items) };
    (ctx.dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn((entity: unknown) => {
      if (entity === SubmissionItemEntity) return submissionItems;
      throw new Error('Unexpected repository');
    });
    return submissionItems;
  }

  it('"Valor (R$)" grava o número junto do texto; o cálculo sai do servidor, nunca do navegador', async () => {
    const ctx = makeService();
    ctx.solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-1', submissionId: 'sub-1' }),
    );
    ctx.kanbanPhasesRepo.findOne.mockResolvedValue(phases[0]);
    ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
    ctx.phaseFieldValuesRepo.findOne.mockResolvedValue(null);
    ctx.phaseFieldValuesRepo.find.mockResolvedValue([
      { id: 'v-frete', phaseFieldId: 'f-frete', fieldCode: 'frete', valueText: 'R$ 50,25', valueNumber: 50.25 },
    ]);
    withSubmissionItems(ctx, [
      { fieldCode: 'valor', valueText: 'R$ 1.000,00', valueNumber: 1000, valueBoolean: null, valueJson: null },
    ]);

    await ctx.service.savePhaseFieldValues(
      'solicitation-id',
      {
        items: [
          { phaseFieldId: 'f-frete', fieldCode: 'frete', valueText: 'R$ 50,25' },
          { phaseFieldId: 'f-total', fieldCode: 'total', valueNumber: 999999 },
        ],
      },
      makeActor(),
    );

    const saved = ctx.phaseFieldValuesRepo.save.mock.calls.map(([value]) => value);
    expect(saved).toEqual([
      expect.objectContaining({ phaseFieldId: 'f-frete', valueText: 'R$ 50,25', valueNumber: 50.25 }),
      expect.objectContaining({ phaseFieldId: 'f-total', fieldCode: 'total', valueNumber: 1050.25, valueText: null }),
    ]);
  });

  it('cálculo que ficou sem origem apaga o valor velho', async () => {
    const ctx = makeService();
    ctx.solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-1' }),
    );
    ctx.kanbanPhasesRepo.findOne.mockResolvedValue(phases[0]);
    ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
    ctx.phaseFieldValuesRepo.findOne.mockResolvedValue(null);
    ctx.phaseFieldValuesRepo.find.mockResolvedValue([
      { id: 'v-total', phaseFieldId: 'f-total', fieldCode: 'total', valueNumber: 10 },
    ]);
    (ctx.phaseFieldValuesRepo as unknown as { delete: jest.Mock }).delete = jest.fn();

    await ctx.service.savePhaseFieldValues(
      'solicitation-id',
      { items: [{ phaseFieldId: 'f-frete', fieldCode: 'frete', valueText: '' }] },
      makeActor(),
    );

    expect((ctx.phaseFieldValuesRepo as unknown as { delete: jest.Mock }).delete).toHaveBeenCalledWith('v-total');
  });

  it('board soma o "Valor do card" por coluna — formulário ganha do campo de fase', async () => {
    const ctx = makeService();
    ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
    const form = { id: 'form-id', name: 'Compras', kanbanSettings: { cardValueField: 'valor' } };
    ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([
        makeSolicitation({ id: 'sol-a', formId: 'form-id', form: form as never, currentPhaseId: 'phase-1', submissionId: 'sub-a' }),
        makeSolicitation({ id: 'sol-b', formId: 'form-id', form: form as never, currentPhaseId: 'phase-1' }),
        makeSolicitation({ id: 'sol-c', formId: 'form-id', form: form as never, currentPhaseId: 'phase-2' }),
      ]),
    );
    ctx.phaseFieldValuesRepo.find.mockResolvedValue([
      { solicitationId: 'sol-a', fieldCode: 'valor', valueNumber: 1, valueText: null },
      { solicitationId: 'sol-b', fieldCode: 'valor', valueNumber: 0.2, valueText: null },
    ]);
    withSubmissionItems(ctx, [{ submissionId: 'sub-a', fieldCode: 'valor', valueNumber: null, valueText: 'R$ 1.500,10' }]);

    const board = await ctx.service.getKanbanBoard(makeActor(), 'form-id');

    expect(board.valueField).toBe('valor');
    expect(board.columns.map((column) => [column.id, column.totalValue, column.cards.map((card) => card.value)])).toEqual([
      ['phase-1', 1500.3, [1500.1, 0.2]],
      ['phase-2', 0, [null]],
    ]);
  });

  it('board traz o "Personalizar card" de cada fase: ajuste da pessoa > padrão da fase > sistema', async () => {
    const ctx = makeService();
    const phaseConfig = { indicators: ['priority'], fields: [{ fieldCode: 'cidade', label: null }] };
    const mine = { indicators: ['requester'], fields: [] };
    ctx.kanbanPhasesRepo.find.mockResolvedValue([{ ...phases[0], cardDisplay: phaseConfig }, phases[1]]);
    ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([
        makeSolicitation({ id: 'sol-a', formId: 'form-id', currentPhaseId: 'phase-1' }),
        makeSolicitation({ id: 'sol-b', formId: 'form-id', currentPhaseId: 'phase-2' }),
      ]),
    );
    const cardDisplay = {
      // A pessoa ajustou só a fase 2.
      personalByPhase: jest.fn().mockResolvedValue(new Map([['phase-2', mine]])),
      loadCardFields: jest.fn().mockImplementation(async (_formId, cards, displayOf) => {
        const map = new Map();
        for (const card of cards) {
          const fields = displayOf(card).fields;
          if (fields.length) map.set(card.id, [{ code: 'cidade', label: 'Cidade', text: 'São Paulo' }]);
        }
        return map;
      }),
    };
    (ctx.service as unknown as { cardDisplay: unknown }).cardDisplay = cardDisplay;

    const board = await ctx.service.getKanbanBoard(makeActor(), 'form-id');

    expect(cardDisplay.personalByPhase).toHaveBeenCalledWith(makeActor().sub, ['phase-1', 'phase-2']);
    expect(board.columns.map((column) => [column.id, column.cardDisplaySource, column.cardDisplay])).toEqual([
      ['phase-1', 'phase', phaseConfig],
      ['phase-2', 'personal', mine],
    ]);
    expect(board.columns[0].cards[0].fields).toEqual([{ code: 'cidade', label: 'Cidade', text: 'São Paulo' }]);
    expect(board.columns[1].cards[0].fields).toBeUndefined();
  });

  it('"Solicitante" no card: quem respondeu pelo link público aparece pelo nome do envio', async () => {
    const ctx = makeService();
    ctx.kanbanPhasesRepo.find.mockResolvedValue([
      { ...phases[0], cardDisplay: { indicators: ['requester'], fields: [] } },
      phases[1],
    ]);
    ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([
        makeSolicitation({ id: 'sol-pub', formId: 'form-id', currentPhaseId: 'phase-1', submissionId: 'sub-pub', createdByUser: null } as never),
      ]),
    );
    const submissions = { find: jest.fn().mockResolvedValue([{ id: 'sub-pub', responderName: ' Cliente Externo ' }]) };
    (ctx.dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn((entity: unknown) => {
      if (entity === SubmissionEntity) return submissions;
      throw new Error('Unexpected repository');
    });

    const board = await ctx.service.getKanbanBoard(makeActor(), 'form-id');

    expect(board.columns[0].cards[0].requesterName).toBe('Cliente Externo');
  });

  it('board sem "Personalizar card" configurado: card padrão do sistema', async () => {
    const ctx = makeService();
    ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
    ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([makeSolicitation({ id: 'sol-a', formId: 'form-id', currentPhaseId: 'phase-1' })]),
    );

    const board = await ctx.service.getKanbanBoard(makeActor(), 'form-id');

    expect(board.columns[0].cardDisplaySource).toBe('default');
    expect(board.columns[0].cardDisplay?.indicators).toContain('priority');
    expect(board.columns[0].cardDisplay?.fields).toEqual([]);
  });

  it('card em fase com prazo traz o prazo da fase (prorrogação vale no lugar do configurado)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T15:30:00.000Z'));
    try {
      const ctx = makeService();
      ctx.kanbanPhasesRepo.find.mockResolvedValue([
        { ...phases[0], slaHours: 4, slaBusinessHours: false, slaWarningPercent: null, isTerminal: false },
        phases[1],
      ]);
      ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
        makeBoardQueryBuilder([
          makeSolicitation({
            id: 'sol-a',
            formId: 'form-id',
            currentPhaseId: 'phase-1',
            phaseEnteredAt: new Date('2026-10-14T12:00:00.000Z'),
          } as never),
          makeSolicitation({
            id: 'sol-b',
            formId: 'form-id',
            currentPhaseId: 'phase-1',
            phaseEnteredAt: new Date('2026-10-14T12:00:00.000Z'),
            phaseDueAt: new Date('2026-10-15T12:00:00.000Z'),
          } as never),
          makeSolicitation({ id: 'sol-c', formId: 'form-id', currentPhaseId: 'phase-2' }),
        ]),
      );

      const board = await ctx.service.getKanbanBoard(makeActor(), 'form-id');
      const [a, b] = board.columns[0].cards;
      expect(a.phaseSla).toEqual({
        enteredAt: '2026-10-14T12:00:00.000Z',
        dueAt: '2026-10-14T16:00:00.000Z',
        businessHours: false,
        extended: false,
        state: 'warning',
        percentUsed: 87.5,
        minutesRemaining: 30,
      });
      expect(b.phaseSla).toMatchObject({ dueAt: '2026-10-15T12:00:00.000Z', extended: true, state: 'on_track' });
      expect(board.columns[1].cards[0].phaseSla).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('sem "Valor do card" o board não traz valor nem total', async () => {
    const ctx = makeService();
    ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
    ctx.solicitationsRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeBoardQueryBuilder([makeSolicitation({ id: 'sol-a', formId: 'form-id', currentPhaseId: 'phase-1' })]),
    );
    const board = await ctx.service.getKanbanBoard(makeActor(), 'form-id');
    expect(board.valueField).toBeUndefined();
    expect(board.columns[0]).not.toHaveProperty('totalValue');
    expect(board.columns[0].cards[0]).not.toHaveProperty('value');
  });
});

describe('SolicitationsService.savePhaseFieldValues', () => {
  describe('"Pedido de itens" em campo de fase', () => {
    const orderField = {
      id: 'field-pedido',
      code: 'pedido',
      label: 'Pedido',
      fieldType: 'item_order',
      required: true,
      settingsJson: { itemListId: '7d0c1a52-8a1e-4c3b-9f0e-2b6f1f6f8a10' },
    };

    function setup() {
      const ctx = makeService();
      ctx.solicitationsRepo.findOne.mockResolvedValue(
        makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-pedido' }),
      );
      const phase = { id: 'phase-pedido', actorRoleCode: null, fields: [orderField] };
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue(phase);
      ctx.kanbanPhasesRepo.find.mockResolvedValue([phase]);
      ctx.phaseFieldValuesRepo.findOne.mockResolvedValue(null);
      ctx.phaseFieldValuesRepo.find.mockResolvedValue([]);
      return ctx;
    }

    it('grava o retrato montado pelo serviço, não o que o navegador mandou', async () => {
      const { service, itemOrderFields, phaseFieldValuesRepo } = setup();
      const answer = { schemaVersion: 1, rows: [{ key: 'item-1' }], total: null };
      itemOrderFields.resolvePhaseValue.mockResolvedValue({ valueText: 'Caixa — 2', valueJson: answer });
      const sent = { rows: [{ key: 'item-1', answers: { quantidade: 2 } }] };

      await service.savePhaseFieldValues(
        'solicitation-id',
        { items: [{ phaseFieldId: 'field-pedido', fieldCode: 'pedido', valueJson: sent }] },
        makeActor(),
      );

      expect(itemOrderFields.resolvePhaseValue).toHaveBeenCalledWith(orderField, sent);
      expect(phaseFieldValuesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ valueText: 'Caixa — 2', valueJson: answer, valueNumber: null }),
      );
    });

    it('obrigatório sem nenhum item é recusado', async () => {
      const { service, itemOrderFields } = setup();
      await expect(
        service.savePhaseFieldValues(
          'solicitation-id',
          { items: [{ phaseFieldId: 'field-pedido', fieldCode: 'pedido', valueJson: { rows: [] } }] },
          makeActor(),
        ),
      ).rejects.toThrow('Preencha os campos obrigatórios desta fase: Pedido.');
      expect(itemOrderFields.resolvePhaseValue).not.toHaveBeenCalled();
    });

    it('app móvel (texto ou nada no pedido) não apaga o pedido salvo', async () => {
      const { service, itemOrderFields, phaseFieldValuesRepo } = setup();
      phaseFieldValuesRepo.find.mockResolvedValue([
        { phaseFieldId: 'field-pedido', valueText: 'Caixa — 2', valueJson: { rows: [{ key: 'item-1' }] } },
      ]);

      await service.savePhaseFieldValues(
        'solicitation-id',
        { items: [{ phaseFieldId: 'field-pedido', fieldCode: 'pedido', valueText: '[object Object]' }] },
        makeActor(),
      );

      expect(itemOrderFields.resolvePhaseValue).not.toHaveBeenCalled();
      expect(phaseFieldValuesRepo.save).not.toHaveBeenCalled();
    });
  });

  it('emite solicitations.phase_fields_saved com a fase efetiva após salvar', async () => {
    const { service, solicitationsRepo, kanbanPhasesRepo, phaseFieldValuesRepo, eventEmitter } =
      makeService();
    const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-3' });
    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-3', actorRoleCode: null });
    phaseFieldValuesRepo.findOne.mockResolvedValue(null);
    phaseFieldValuesRepo.find.mockResolvedValue([]);

    await service.savePhaseFieldValues(
      'solicitation-id',
      { items: [{ phaseFieldId: 'field-1', fieldCode: 'quantidade', valueNumber: 120 }] },
      makeActor(),
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'solicitations.phase_fields_saved',
      expect.objectContaining({
        name: 'solicitations.phase_fields_saved',
        solicitationId: 'solicitation-id',
        phaseId: 'phase-3',
      }),
    );
  });

  describe('quem atua na fase (perfis e usuários)', () => {
    function setup(phase: Record<string, unknown>) {
      const ctx = makeService();
      ctx.solicitationsRepo.findOne.mockResolvedValue(
        makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-log' }),
      );
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-log', fields: [], ...phase });
      ctx.phaseFieldValuesRepo.findOne.mockResolvedValue(null);
      ctx.phaseFieldValuesRepo.find.mockResolvedValue([]);
      return ctx;
    }
    const save = (service: { savePhaseFieldValues: (...args: never[]) => Promise<unknown> }, actor: JwtPayload) =>
      service.savePhaseFieldValues(
        'solicitation-id' as never,
        { items: [{ phaseFieldId: 'f', fieldCode: 'obs', valueText: 'x' }] } as never,
        actor as never,
      );

    it('usuário escolhido atua mesmo sem ter o perfil', async () => {
      const { service, phaseFieldValuesRepo } = setup({
        actors: { roleCodes: ['logistica'], userIds: ['user-ana'] },
      });
      await save(service, makeActor({ role: 'consulta', sub: 'user-ana' }));
      expect(phaseFieldValuesRepo.save).toHaveBeenCalled();
    });

    it('qualquer um dos perfis da lista atua; fora dela é recusado', async () => {
      const { service } = setup({ actors: { roleCodes: ['logistica', 'financeiro'], userIds: [] } });
      await expect(save(service, makeActor({ role: 'financeiro' }))).resolves.toBeDefined();
      await expect(save(service, makeActor({ role: 'consulta' }))).rejects.toThrow(
        'Apenas quem foi escolhido para atuar nesta fase (perfis "logistica", "financeiro") pode preencher os campos desta fase.',
      );
    });

    it('fase antiga (só actorRoleCode) segue valendo', async () => {
      const { service } = setup({ actors: null, actorRoleCode: 'logistica' });
      await expect(save(service, makeActor({ role: 'consulta' }))).rejects.toThrow('Apenas o perfil "logistica" pode preencher os campos desta fase.');
    });

    it('pedir aprovação manda os perfis e os usuários aprovadores juntos', async () => {
      const { service, approvalsService } = setup({
        label: 'Financeiro',
        requiresApproval: true,
        actors: null,
        approvers: { roleCodes: ['financeiro'], userIds: ['user-diretor'] },
      });
      await service.requestCurrentPhaseApproval('solicitation-id', makeActor());
      expect(approvalsService.createApproval).toHaveBeenCalledWith(
        'solicitation-id',
        expect.objectContaining({
          phaseId: 'phase-log',
          assignedRoleCodes: ['financeiro'],
          assignedUserIds: ['user-diretor'],
          mode: 'parallel',
        }),
        expect.anything(),
      );
    });
  });

  it('pedir aprovação segue a regra da fase: em ordem, todos aprovam, na ordem escolhida', async () => {
    const ctx = makeService();
    ctx.solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-fin' }));
    ctx.kanbanPhasesRepo.findOne.mockResolvedValue({
      id: 'phase-fin',
      label: 'Financeiro',
      fields: [],
      actors: null,
      requiresApproval: true,
      approvalMode: 'sequential',
      approvers: { roleCodes: ['gerente'], userIds: ['user-diretor'], order: ['role:gerente', 'user:user-diretor'] },
    });
    await ctx.service.requestCurrentPhaseApproval('solicitation-id', makeActor());
    expect(ctx.approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({
        mode: 'sequential',
        requireAll: true,
        assigneeOrder: ['role:gerente', 'user:user-diretor'],
      }),
      expect.anything(),
    );
  });

  describe('campos obrigatórios da fase', () => {
    const requiredFields = [
      { id: 'f-retirado', code: 'retirado_de_rota', label: 'Retirado de rota', fieldType: 'checkbox', required: true },
      { id: 'f-romaneio', code: 'romaneio', label: 'Romaneio', fieldType: 'short_text', required: true },
      { id: 'f-obs', code: 'obs', label: 'Observação', fieldType: 'long_text', required: false },
      { id: 'f-titulo', code: 'titulo', label: 'Instruções', fieldType: 'title', required: true },
    ];

    function setup(saved: unknown[] = []) {
      const ctx = makeService();
      ctx.solicitationsRepo.findOne.mockResolvedValue(
        makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-log' }),
      );
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue({
        id: 'phase-log',
        actorRoleCode: null,
        fields: requiredFields,
      });
      ctx.phaseFieldValuesRepo.findOne.mockResolvedValue(null);
      ctx.phaseFieldValuesRepo.find.mockResolvedValue(saved);
      return ctx;
    }

    it('recusa salvar sem os obrigatórios (checkbox desmarcado e texto só com espaços) e não grava nada', async () => {
      const { service, phaseFieldValuesRepo, eventEmitter } = setup();

      await expect(
        service.savePhaseFieldValues(
          'solicitation-id',
          {
            items: [
              { phaseFieldId: 'f-retirado', fieldCode: 'retirado_de_rota', valueBoolean: false },
              { phaseFieldId: 'f-romaneio', fieldCode: 'romaneio', valueText: '   ' },
            ],
          },
          makeActor(),
        ),
      ).rejects.toThrow('Preencha os campos obrigatórios desta fase: Retirado de rota, Romaneio.');
      expect(phaseFieldValuesRepo.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('solicitations.phase_fields_saved', expect.anything());
    });

    it('aceita quando os obrigatórios vêm preenchidos (layout nunca é cobrado)', async () => {
      const { service, phaseFieldValuesRepo } = setup();

      await service.savePhaseFieldValues(
        'solicitation-id',
        {
          items: [
            { phaseFieldId: 'f-retirado', fieldCode: 'retirado_de_rota', valueBoolean: true },
            { phaseFieldId: 'f-romaneio', fieldCode: 'romaneio', valueText: 'R-77' },
          ],
        },
        makeActor(),
      );

      expect(phaseFieldValuesRepo.save).toHaveBeenCalledTimes(2);
    });

    it('obrigatório que não veio agora vale pelo que já estava salvo', async () => {
      const { service, phaseFieldValuesRepo } = setup([
        { phaseFieldId: 'f-romaneio', fieldCode: 'romaneio', valueText: 'R-77', valueNumber: null, valueBoolean: null, valueJson: null },
      ]);

      await service.savePhaseFieldValues(
        'solicitation-id',
        { items: [{ phaseFieldId: 'f-retirado', fieldCode: 'retirado_de_rota', valueBoolean: true }] },
        makeActor(),
      );

      expect(phaseFieldValuesRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('ramificação no formulário da fase', () => {
    // Tipo decide: Importação mostra a seção de importação; Nacional pula direto para o fechamento.
    const fields = [
      {
        id: 'f-tipo',
        code: 'tipo',
        label: 'Tipo',
        fieldType: 'single_select',
        required: true,
        order: 0,
        optionsJson: [
          { value: 'nacional', label: 'Nacional' },
          { value: 'importacao', label: 'Importação' },
        ],
      },
      { id: 'f-sec-imp', code: 'sec_importacao', label: 'Importação', fieldType: 'title', required: false, order: 1 },
      { id: 'f-incoterm', code: 'incoterm', label: 'Incoterm', fieldType: 'short_text', required: true, order: 2 },
      { id: 'f-sec-fim', code: 'sec_fechamento', label: 'Fechamento', fieldType: 'title', required: false, order: 3 },
      { id: 'f-valor', code: 'valor_final', label: 'Valor final', fieldType: 'short_text', required: true, order: 4 },
    ];
    const sectionFlow = [
      {
        section: '__inicio__',
        next: 'sec_fechamento',
        branches: [
          { fieldCode: 'tipo', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' },
        ],
      },
    ];

    function setup(saved: unknown[] = []) {
      const ctx = makeService();
      ctx.solicitationsRepo.findOne.mockResolvedValue(
        makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-cot' }),
      );
      ctx.kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-cot', actors: null, fields, sectionFlow });
      ctx.phaseFieldValuesRepo.findOne.mockResolvedValue(null);
      ctx.phaseFieldValuesRepo.find.mockResolvedValue(saved);
      Object.assign(ctx.phaseFieldValuesRepo, { delete: jest.fn() });
      return ctx;
    }

    it('obrigatório de seção fora do caminho não é cobrado, e o valor dele é apagado', async () => {
      const { service, phaseFieldValuesRepo } = setup([
        { phaseFieldId: 'f-incoterm', fieldCode: 'incoterm', valueText: 'FOB', valueNumber: null, valueBoolean: null, valueJson: null },
      ]);

      await service.savePhaseFieldValues(
        'solicitation-id',
        {
          items: [
            { phaseFieldId: 'f-tipo', fieldCode: 'tipo', valueText: 'nacional' },
            { phaseFieldId: 'f-incoterm', fieldCode: 'incoterm', valueText: 'CIF' },
            { phaseFieldId: 'f-valor', fieldCode: 'valor_final', valueText: '100' },
          ],
        },
        makeActor(),
      );

      const savedCodes = phaseFieldValuesRepo.save.mock.calls.map(([value]) => (value as { fieldCode: string }).fieldCode);
      expect(savedCodes).toEqual(['tipo', 'valor_final']);
      expect((phaseFieldValuesRepo as unknown as { delete: jest.Mock }).delete).toHaveBeenCalledWith({
        solicitationId: 'solicitation-id',
        phaseFieldId: expect.objectContaining({ _value: ['f-sec-imp', 'f-incoterm'] }),
      });
    });

    it('obrigatório de seção no caminho continua cobrado', async () => {
      const { service } = setup();
      await expect(
        service.savePhaseFieldValues(
          'solicitation-id',
          {
            items: [
              { phaseFieldId: 'f-tipo', fieldCode: 'tipo', valueText: 'importacao' },
              { phaseFieldId: 'f-valor', fieldCode: 'valor_final', valueText: '100' },
            ],
          },
          makeActor(),
        ),
      ).rejects.toThrow('Preencha os campos obrigatórios desta fase: Incoterm.');
    });
  });

  it('não emite evento quando a solicitação não está em nenhuma fase', async () => {
    const { service, solicitationsRepo, phaseFieldValuesRepo, eventEmitter } = makeService();
    const solicitation = makeSolicitation({ formId: null, currentPhaseId: null });
    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    phaseFieldValuesRepo.findOne.mockResolvedValue(null);
    phaseFieldValuesRepo.find.mockResolvedValue([]);

    await service.savePhaseFieldValues(
      'solicitation-id',
      { items: [{ phaseFieldId: 'field-1', fieldCode: 'quantidade', valueNumber: 120 }] },
      makeActor(),
    );

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'solicitations.phase_fields_saved',
      expect.anything(),
    );
  });
});

describe('SolicitationsService — aprovação de fase sem fluxo', () => {
  const PHASES = [
    { id: 'phase-1', formId: 'form-id', label: 'Preenchimento', order: 0 },
    { id: 'phase-2', formId: 'form-id', label: 'Quantidade', order: 1 },
    { id: 'phase-3', formId: 'form-id', label: 'Concluído', order: 2, isTerminal: true },
  ];

  function setup(phaseOverrides: Record<string, unknown>, approval: Partial<ApprovalEntity> | null) {
    const ctx = makeService();
    const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-2' });
    const phases = PHASES.map((phase) =>
      phase.id === 'phase-2'
        ? {
            ...phase,
            requiresApproval: true,
            approvers: { roleCodes: ['supervisor'], userIds: [] },
            approvalMode: 'any',
            approvalRequest: 'manual',
            approvalOnApproved: 'stay',
            approvalOnRejected: 'stay',
            ...phaseOverrides,
          }
        : phase,
    );
    ctx.solicitationsRepo.findOne.mockResolvedValue(solicitation);
    ctx.kanbanPhasesRepo.findOne.mockResolvedValue(phases[1]);
    ctx.kanbanPhasesRepo.find.mockResolvedValue(phases);
    ctx.manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === SolicitationEntity) return Promise.resolve(solicitation);
      if (entity === ApprovalEntity) return Promise.resolve(approval);
      return Promise.resolve(null);
    });
    const movePhase = jest.spyOn(ctx.service, 'movePhase').mockResolvedValue(solicitation);
    const moveCard = jest.spyOn(ctx.service, 'moveCard').mockResolvedValue(solicitation);
    return { ...ctx, movePhase, moveCard };
  }

  const decided = (status: ApprovalStatus) => ({ id: 'approval-1', phaseId: 'phase-2', solicitationId: 'solicitation-id', status });

  it('aprovada com "vai para a próxima fase": move o card sem pessoa', async () => {
    const { service, movePhase } = setup({ approvalOnApproved: 'next' }, decided(ApprovalStatus.APPROVED));
    await service.applyPhaseApprovalOutcome('approval-1');
    expect(movePhase).toHaveBeenCalledWith('solicitation-id', { phaseId: 'phase-3' }, null, { flowEventDepth: 0, byAutomation: true });
  });

  it('aprovada com "espera": o card fica', async () => {
    const { service, movePhase, moveCard } = setup({}, decided(ApprovalStatus.APPROVED));
    await service.applyPhaseApprovalOutcome('approval-1');
    expect(movePhase).not.toHaveBeenCalled();
    expect(moveCard).not.toHaveBeenCalled();
  });

  it('reprovada com "volta": vai para a fase anterior', async () => {
    const { service, movePhase } = setup({ approvalOnRejected: 'previous' }, decided(ApprovalStatus.REJECTED));
    await service.applyPhaseApprovalOutcome('approval-1');
    expect(movePhase).toHaveBeenCalledWith('solicitation-id', { phaseId: 'phase-1' }, null, { flowEventDepth: 0, byAutomation: true });
  });

  it('reprovada com "encerra": a solicitação vira reprovada, de qualquer status', async () => {
    const { service, moveCard } = setup({ approvalOnRejected: 'close' }, decided(ApprovalStatus.REJECTED));
    await service.applyPhaseApprovalOutcome('approval-1', 2);
    expect(moveCard).toHaveBeenCalledWith(
      'solicitation-id',
      { status: SolicitationStatus.REJECTED },
      null,
      { flowEventDepth: 2, skipTransitionCheck: true },
    );
  });

  describe('aprovada para seguir, mas a saída da fase está travada', () => {
    const LOCKED = {
      approvalOnApproved: 'next',
      requireAssigneeToExit: true,
      actors: { roleCodes: ['operador'], userIds: ['u-escolhido'] },
    };

    function lockedSetup(approvalStatus = ApprovalStatus.APPROVED, assigneeId: string | null = null) {
      const ctx = setup(LOCKED, decided(approvalStatus));
      const solicitation = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-2', assigneeId });
      ctx.solicitationsRepo.findOne.mockResolvedValue(solicitation);
      ctx.manager.findOne.mockImplementation((entity: unknown) => {
        if (entity === SolicitationEntity) return Promise.resolve(solicitation);
        if (entity === ApprovalEntity) return Promise.resolve(decided(approvalStatus));
        return Promise.resolve(null);
      });
      ctx.manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(entity === UserEntity ? [{ id: 'u-operador' }] : []),
      );
      ctx.historyRepo.create.mockImplementation((entry: unknown) => entry);
      const notify = jest.fn().mockResolvedValue(undefined);
      (ctx.service as unknown as { userNotice: unknown }).userNotice = { notify };
      return { ...ctx, notify };
    }

    it('não move: registra no histórico o que falta e avisa quem atua na fase', async () => {
      const { service, movePhase, historyRepo, notify } = lockedSetup();
      await service.applyPhaseApprovalOutcome('approval-1');

      expect(movePhase).not.toHaveBeenCalled();
      expect(historyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SolicitationHistoryEventType.PHASE_ADVANCE_BLOCKED,
          message: expect.stringContaining('atribua um responsável'),
        }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'phase_advance_blocked',
          userIds: expect.arrayContaining(['u-operador', 'u-escolhido']),
          dedupeKey: 'phase-advance-blocked:approval-1',
        }),
      );
    });

    it('resolvida a trava (responsável definido), o card segue sozinho', async () => {
      const { service, movePhase } = lockedSetup(ApprovalStatus.APPROVED, 'u-resp');
      await service.resumeApprovedAdvance('solicitation-id');
      expect(movePhase).toHaveBeenCalledWith('solicitation-id', { phaseId: 'phase-3' }, null, {
        flowEventDepth: 0,
        byAutomation: true,
      });
    });

    it('ainda travada, ou sem aprovação concedida nesta passagem, não mexe', async () => {
      const stillLocked = lockedSetup(ApprovalStatus.APPROVED, null);
      await stillLocked.service.resumeApprovedAdvance('solicitation-id');
      expect(stillLocked.movePhase).not.toHaveBeenCalled();

      const pending = lockedSetup(ApprovalStatus.PENDING, 'u-resp');
      await pending.service.resumeApprovedAdvance('solicitation-id');
      expect(pending.movePhase).not.toHaveBeenCalled();
    });
  });

  it('card que já saiu da fase da aprovação não é mexido', async () => {
    const { service, solicitationsRepo, manager, movePhase } = setup(
      { approvalOnApproved: 'next' },
      decided(ApprovalStatus.APPROVED),
    );
    const moved = makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-3' });
    solicitationsRepo.findOne.mockResolvedValue(moved);
    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === SolicitationEntity ? moved : entity === ApprovalEntity ? decided(ApprovalStatus.APPROVED) : null),
    );
    await service.applyPhaseApprovalOutcome('approval-1');
    expect(movePhase).not.toHaveBeenCalled();
  });

  it('aprovação sem fase (de fluxo comum) não é com a fase', async () => {
    const { service, movePhase } = setup({ approvalOnApproved: 'next' }, { ...decided(ApprovalStatus.APPROVED), phaseId: null });
    await service.applyPhaseApprovalOutcome('approval-1');
    expect(movePhase).not.toHaveBeenCalled();
  });

  it('pede a aprovação sozinha para os aprovadores da fase, sem pessoa', async () => {
    const { service, approvalsService } = setup({ approvalRequest: 'on_complete' }, null);
    await service.requestPhaseApprovalAutomatically('solicitation-id', 'phase-2');
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({ phaseId: 'phase-2', assignedRoleCodes: ['supervisor'] }),
      null,
    );
  });

  it('não pede de novo com uma pendente ou aprovada nesta passagem; depois de reprovada, pede', async () => {
    for (const [status, asks] of [
      [ApprovalStatus.PENDING, false],
      [ApprovalStatus.APPROVED, false],
      [ApprovalStatus.REJECTED, true],
    ] as const) {
      const { service, approvalsService } = setup({ approvalRequest: 'on_complete' }, decided(status));
      await service.requestPhaseApprovalAutomatically('solicitation-id', 'phase-2');
      expect(approvalsService.createApproval).toHaveBeenCalledTimes(asks ? 1 : 0);
    }
  });

  it('não pede para card em outra fase nem para solicitação encerrada', async () => {
    const other = setup({ approvalRequest: 'on_enter' }, null);
    await other.service.requestPhaseApprovalAutomatically('solicitation-id', 'phase-1');
    expect(other.approvalsService.createApproval).not.toHaveBeenCalled();

    const closed = setup({ approvalRequest: 'on_enter' }, null);
    closed.solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({ formId: 'form-id', currentPhaseId: 'phase-2', status: SolicitationStatus.REJECTED }),
    );
    await closed.service.requestPhaseApprovalAutomatically('solicitation-id', 'phase-2');
    expect(closed.approvalsService.createApproval).not.toHaveBeenCalled();
  });
});

describe('SolicitationsService standard answers', () => {
  it('getStandardAnswers busca por solicitationId apos checar acesso', async () => {
    const { service, solicitationsRepo, standardAnswersRepo } = makeService();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    standardAnswersRepo.find.mockResolvedValue([{ id: 'answer-1', solicitationId: 'solicitation-id' }]);

    const result = await service.getStandardAnswers('solicitation-id', makeActor());

    expect(standardAnswersRepo.find).toHaveBeenCalledWith({
      where: { solicitationId: 'solicitation-id' },
    });
    expect(result).toEqual([{ id: 'answer-1', solicitationId: 'solicitation-id' }]);
  });

  it('saveStandardAnswers cria uma resposta nova quando nao existe ainda', async () => {
    const { service, solicitationsRepo, standardAnswersRepo } = makeService();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    standardAnswersRepo.findOne.mockResolvedValue(null);
    standardAnswersRepo.find.mockResolvedValue([]);

    await service.saveStandardAnswers(
      'solicitation-id',
      { items: [{ questionId: 'question-1', fieldCode: 'nome', valueText: 'Nailton' }] } as never,
      makeActor(),
    );

    expect(standardAnswersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitationId: 'solicitation-id',
        questionId: 'question-1',
        valueText: 'Nailton',
      }),
    );
  });

  it('saveStandardAnswers atualiza a resposta existente (upsert) em vez de duplicar', async () => {
    const { service, solicitationsRepo, standardAnswersRepo } = makeService();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    standardAnswersRepo.findOne.mockResolvedValue({ id: 'answer-1', questionId: 'question-1' });
    standardAnswersRepo.find.mockResolvedValue([]);

    await service.saveStandardAnswers(
      'solicitation-id',
      { items: [{ questionId: 'question-1', fieldCode: 'nome', valueText: 'Nailton atualizado' }] } as never,
      makeActor(),
    );

    expect(standardAnswersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'answer-1', valueText: 'Nailton atualizado' }),
    );
  });
});
