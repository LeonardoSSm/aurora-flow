import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, EntityManager } from 'typeorm';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  ApprovalDecisionEntity,
  ApprovalEntity,
  ApprovalStepEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ApprovalsService } from './approvals.service';
import { MAX_EXTERNAL_APPROVERS_PER_APPROVAL } from './external/external-approval-link.service';

const EXTERNAL_EMAIL = 'gestor@tijucaalimentos.com';

function actor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return { sub: 'user-id', email: 'u@x.com', fullName: 'U', role: 'admin', tokenVersion: 0, ...overrides };
}

function writeRepo() {
  let counter = 0;
  return {
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockImplementation((entity: object) => {
      counter += 1;
      return Promise.resolve({ id: `generated-${counter}`, ...entity });
    }),
  };
}

function makeManager(overrides: { findOne?: jest.Mock; findOneOrFail?: jest.Mock; find?: jest.Mock; count?: jest.Mock } = {}) {
  const repos = {
    approval: writeRepo(),
    step: writeRepo(),
    decision: writeRepo(),
    solicitation: writeRepo(),
    history: writeRepo(),
  };
  const manager = {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    findOneOrFail: overrides.findOneOrFail ?? jest.fn().mockRejectedValue(new Error('not mocked')),
    find: overrides.find ?? jest.fn().mockResolvedValue([]),
    count: overrides.count ?? jest.fn().mockResolvedValue(0),
    getRepository: jest.fn().mockImplementation((entity: unknown) => {
      if (entity === ApprovalEntity) return repos.approval;
      if (entity === ApprovalStepEntity) return repos.step;
      if (entity === ApprovalDecisionEntity) return repos.decision;
      if (entity === SolicitationEntity) return repos.solicitation;
      if (entity === SolicitationHistoryEntity) return repos.history;
      throw new Error(`Unexpected entity: ${String(entity)}`);
    }),
  };
  return { manager, repos };
}

function makeService() {
  const eventEmitter = { emit: jest.fn() };
  const approvalsRepo = {
    findOneOrFail: jest.fn(),
    count: jest.fn().mockResolvedValue(1),
  };
  const stepsRepo = { findOne: jest.fn(), findOneOrFail: jest.fn() };
  const usersRepo = { find: jest.fn().mockResolvedValue([]) };
  const metricsService = { setApprovalsPendingTotal: jest.fn(), incrementApprovalsDecided: jest.fn() };
  const permissionsService = {
    getScope: jest.fn().mockResolvedValue('all'),
    hasAny: jest.fn().mockImplementation((role: string) => Promise.resolve(role === 'admin' || role === 'manager')),
  };
  const externalLinks = {
    assertDeliverable: jest.fn(),
    issueAndSend: jest.fn().mockResolvedValue({ sent: true }),
  };
  const dataSource = { transaction: jest.fn() };
  const service = new ApprovalsService(
    dataSource as unknown as DataSource,
    eventEmitter as unknown as EventEmitter2,
    approvalsRepo as never,
    stepsRepo as never,
    usersRepo as never,
    metricsService as never,
    permissionsService as never,
    undefined,
    externalLinks as never,
  );
  return { service, eventEmitter, approvalsRepo, stepsRepo, usersRepo, permissionsService, externalLinks, dataSource };
}

/** Prepara `createApproval` com a solicitação existente e devolve os repositórios de escrita. */
function setupCreate(ctx: ReturnType<typeof makeService>, solicitationStatus = SolicitationStatus.IN_ANALYSIS) {
  const solicitation = { id: 'sol-1', title: 'S', status: solicitationStatus } as SolicitationEntity;
  const { manager, repos } = makeManager({ findOne: jest.fn().mockResolvedValue(solicitation) });
  repos.approval.save.mockResolvedValue({ id: 'approval-1', title: 'Aprovação' });
  ctx.dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
    cb(manager as unknown as EntityManager),
  );
  ctx.approvalsRepo.findOneOrFail.mockResolvedValue({ id: 'approval-1', title: 'Aprovação', steps: [] });
  return { manager, repos };
}

describe('ApprovalsService.createApproval — aprovadores por e-mail', () => {
  it('o link é emitido DEPOIS do commit da transação', async () => {
    const ctx = makeService();
    const { manager } = setupCreate(ctx);
    const order: string[] = [];
    ctx.dataSource.transaction.mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => {
      const result = await cb(manager as unknown as EntityManager);
      order.push('commit');
      return result;
    });
    ctx.externalLinks.issueAndSend.mockImplementation(() => {
      order.push('send');
      return Promise.resolve({ sent: true });
    });

    await ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [EXTERNAL_EMAIL] }, actor());

    expect(order).toEqual(['commit', 'send']);
    expect(ctx.externalLinks.assertDeliverable).toHaveBeenCalledTimes(1);
    expect(ctx.externalLinks.issueAndSend).toHaveBeenCalledWith('generated-1');
  });

  it('cria a etapa com assignedEmail normalizado e sem usuário/perfil', async () => {
    const ctx = makeService();
    const { repos } = setupCreate(ctx);

    await ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [` ${EXTERNAL_EMAIL.toUpperCase()} `] }, actor());

    expect(repos.step.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedEmail: EXTERNAL_EMAIL,
        status: ApprovalStepStatus.PENDING,
        order: 1,
      }),
    );
    const created = repos.step.create.mock.calls[0][0] as Record<string, unknown>;
    expect(created.assignedUserId).toBeUndefined();
    expect(created.assignedRoleCode).toBeUndefined();
  });

  it('e-mail de usuário ATIVO é roteado para o usuário (decide logado, sem link)', async () => {
    const ctx = makeService();
    const { repos } = setupCreate(ctx);
    ctx.usersRepo.find.mockResolvedValue([{ id: 'user-77', email: EXTERNAL_EMAIL }]);

    await ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [EXTERNAL_EMAIL] }, actor());

    expect(repos.step.create).toHaveBeenCalledTimes(1);
    expect(repos.step.create).toHaveBeenCalledWith(expect.objectContaining({ assignedUserId: 'user-77' }));
    expect((repos.step.create.mock.calls[0][0] as Record<string, unknown>).assignedEmail).toBeUndefined();
    expect(ctx.externalLinks.issueAndSend).not.toHaveBeenCalled();
    expect(ctx.externalLinks.assertDeliverable).not.toHaveBeenCalled();
  });

  it('mistura usuário ativo, usuário por id e externo, sem duplicar o mesmo usuário', async () => {
    const ctx = makeService();
    const { repos } = setupCreate(ctx);
    ctx.usersRepo.find.mockResolvedValue([{ id: 'user-1', email: 'interno@x.com' }]);

    await ctx.service.createApproval(
      'sol-1',
      { title: 'Aprovação', assignedUserIds: ['user-1'], assignedEmails: ['interno@x.com', EXTERNAL_EMAIL, EXTERNAL_EMAIL] },
      actor(),
    );

    const created = repos.step.create.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ assignedUserId: 'user-1', order: 1 });
    expect(created[1]).toMatchObject({ assignedEmail: EXTERNAL_EMAIL, order: 2 });
  });

  it('só e-mails também é uma aprovação válida (não exige usuário nem perfil)', async () => {
    const ctx = makeService();
    setupCreate(ctx);

    await expect(
      ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [EXTERNAL_EMAIL] }, actor()),
    ).resolves.toBeDefined();
  });

  it('sequencial: só a 1ª etapa externa recebe link; as seguintes ficam WAITING sem link', async () => {
    const ctx = makeService();
    const { repos } = setupCreate(ctx);

    await ctx.service.createApproval(
      'sol-1',
      { title: 'Aprovação', mode: 'sequential', assignedEmails: ['a@x.com', 'b@x.com'] },
      actor(),
    );

    const created = repos.step.create.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(created[0]).toMatchObject({ assignedEmail: 'a@x.com', status: ApprovalStepStatus.PENDING });
    expect(created[1]).toMatchObject({ assignedEmail: 'b@x.com', status: ApprovalStepStatus.WAITING });
    expect(ctx.externalLinks.issueAndSend).toHaveBeenCalledTimes(1);
  });

  it('paralelo: todas as etapas externas recebem link', async () => {
    const ctx = makeService();
    setupCreate(ctx);

    await ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: ['a@x.com', 'b@x.com'] }, actor());

    expect(ctx.externalLinks.issueAndSend).toHaveBeenCalledTimes(2);
  });

  it('SMTP indisponível: falha ANTES de abrir transação (nada fica preso)', async () => {
    const ctx = makeService();
    ctx.externalLinks.assertDeliverable.mockImplementation(() => {
      throw new BadRequestException('SMTP não configurado');
    });

    await expect(
      ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [EXTERNAL_EMAIL] }, actor()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('falha ao enviar o link NÃO desfaz a aprovação (devolve a aprovação e registra aviso)', async () => {
    const ctx = makeService();
    setupCreate(ctx);
    ctx.externalLinks.issueAndSend.mockResolvedValue({ sent: false, error: 'SMTP fora do ar' });
    const warn = jest.spyOn(ctx.service['logger'], 'warn').mockImplementation(() => undefined);

    const result = await ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [EXTERNAL_EMAIL] }, actor());

    expect(result).toBeDefined();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(EXTERNAL_EMAIL);
  });

  it('exceção ao emitir o link também não derruba a criação', async () => {
    const ctx = makeService();
    setupCreate(ctx);
    ctx.externalLinks.issueAndSend.mockRejectedValue(new Error('boom'));
    jest.spyOn(ctx.service['logger'], 'warn').mockImplementation(() => undefined);

    await expect(
      ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [EXTERNAL_EMAIL] }, actor()),
    ).resolves.toBeDefined();
  });

  it(`mais de ${MAX_EXTERNAL_APPROVERS_PER_APPROVAL} externos é recusado`, async () => {
    const ctx = makeService();
    const emails = Array.from({ length: MAX_EXTERNAL_APPROVERS_PER_APPROVAL + 1 }, (_, i) => `ext${i}@x.com`);

    await expect(
      ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: emails }, actor()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['sem arroba', 'sem-arroba'],
    ['vazio', ''],
    ['sem domínio completo', 'a@b'],
    ['maior que a coluna (180)', `${'x'.repeat(200)}@dominio.com`],
  ])('e-mail inválido (%s) é recusado', async (_label, email) => {
    const ctx = makeService();

    await expect(
      ctx.service.createApproval('sol-1', { title: 'Aprovação', assignedEmails: [email] }, actor()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sem usuário, perfil nem e-mail: continua recusando', async () => {
    const ctx = makeService();

    await expect(ctx.service.createApproval('sol-1', { title: 'Aprovação' } as never, actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// ── decideExternalStep ────────────────────────────────────────────────────────

function externalStep(overrides: Partial<ApprovalStepEntity> = {}) {
  return {
    id: 'step-1',
    approvalId: 'approval-1',
    assignedUserId: null,
    assignedRoleCode: null,
    assignedEmail: EXTERNAL_EMAIL,
    status: ApprovalStepStatus.PENDING,
    order: 1,
    ...overrides,
  } as ApprovalStepEntity;
}

function setupDecide(
  ctx: ReturnType<typeof makeService>,
  options: { step?: ApprovalStepEntity; approval?: Partial<ApprovalEntity>; count?: number; waiting?: ApprovalStepEntity[] } = {},
) {
  const step = options.step ?? externalStep();
  const approval = {
    id: 'approval-1',
    solicitationId: 'sol-1',
    status: ApprovalStatus.PENDING,
    mode: 'parallel',
    title: 'Aprovação',
    requiredDecisions: 1,
    phaseId: null,
    ...options.approval,
  } as ApprovalEntity;
  const solicitation = { id: 'sol-1', status: SolicitationStatus.WAITING_APPROVAL } as SolicitationEntity;
  const findOne = jest.fn().mockImplementation((entity: unknown) => {
    if (entity === ApprovalStepEntity) return Promise.resolve(step);
    return Promise.resolve(null); // sem decisão prévia
  });
  const find = jest.fn().mockImplementation((_entity: unknown, query: { where: { status?: string } | unknown[] }) => {
    const where = query.where as { status?: string };
    if (!Array.isArray(query.where) && where.status === ApprovalStepStatus.WAITING) {
      return Promise.resolve(options.waiting ?? []);
    }
    return Promise.resolve([]);
  });
  const findOneOrFail = jest.fn().mockImplementation((entity: unknown) =>
    Promise.resolve(entity === ApprovalEntity ? approval : solicitation),
  );
  const { manager, repos } = makeManager({ findOne, find, findOneOrFail, count: jest.fn().mockResolvedValue(options.count ?? 1) });
  ctx.dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
    cb(manager as unknown as EntityManager),
  );
  ctx.stepsRepo.findOneOrFail.mockResolvedValue({ ...step, status: ApprovalStepStatus.APPROVED });
  return { step, approval, repos };
}

describe('ApprovalsService.decideExternalStep', () => {
  const external = { email: EXTERNAL_EMAIL, ip: '203.0.113.9' };

  it('aprova: grava decisão via e-mail (sem usuário), conclui e emite evento com actorId nulo', async () => {
    const ctx = makeService();
    const { repos } = setupDecide(ctx);

    await ctx.service.decideExternalStep('step-1', { decision: 'approved', comment: ' ok ' }, external);

    expect(repos.decision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        decidedByUserId: null,
        decidedByEmail: EXTERNAL_EMAIL,
        decidedVia: 'email_link',
        decidedIp: '203.0.113.9',
        decision: 'approved',
        comment: 'ok',
      }),
    );
    expect(ctx.eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.approved',
      expect.objectContaining({
        actorId: null,
        approvalId: 'approval-1',
        solicitationId: 'sol-1',
        decidedVia: 'email_link',
        decidedByEmail: EXTERNAL_EMAIL,
      }),
    );
  });

  it('histórico da solicitação registra que foi um aprovador externo, sem ator interno', async () => {
    const ctx = makeService();
    const { repos } = setupDecide(ctx);

    await ctx.service.decideExternalStep('step-1', { decision: 'approved' }, external);

    expect(repos.history.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        message: expect.stringContaining(`aprovador externo (${EXTERNAL_EMAIL})`),
      }),
    );
  });

  it('reprova: exige comentário e emite approvals.rejected com actorId nulo', async () => {
    const ctx = makeService();
    setupDecide(ctx);

    await expect(
      ctx.service.decideExternalStep('step-1', { decision: 'rejected', comment: '  ' }, external),
    ).rejects.toBeInstanceOf(BadRequestException);

    await ctx.service.decideExternalStep('step-1', { decision: 'rejected', comment: 'Fora da política' }, external);
    expect(ctx.eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.rejected',
      expect.objectContaining({ actorId: null, stepId: 'step-1' }),
    );
  });

  it('e-mail diferente do da etapa: 403 e nada é gravado', async () => {
    const ctx = makeService();
    const { repos } = setupDecide(ctx);

    await expect(
      ctx.service.decideExternalStep('step-1', { decision: 'approved' }, { email: 'outro@x.com', ip: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repos.decision.save).not.toHaveBeenCalled();
    expect(ctx.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('etapa de usuário/perfil nunca é decidida por e-mail', async () => {
    const ctx = makeService();
    setupDecide(ctx, { step: externalStep({ assignedEmail: null, assignedUserId: 'user-9' }) });

    await expect(
      ctx.service.decideExternalStep('step-1', { decision: 'approved' }, external),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('etapa inexistente: 404', async () => {
    const ctx = makeService();
    const { manager } = makeManager({ findOne: jest.fn().mockResolvedValue(null) });
    ctx.dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager as unknown as EntityManager),
    );

    await expect(
      ctx.service.decideExternalStep('step-1', { decision: 'approved' }, external),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('etapa já decidida: recusa (não decide duas vezes)', async () => {
    const ctx = makeService();
    setupDecide(ctx, { step: externalStep({ status: ApprovalStepStatus.APPROVED }) });

    await expect(
      ctx.service.decideExternalStep('step-1', { decision: 'approved' }, external),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sequencial: ao aprovar, a próxima etapa externa é ativada e recebe o link', async () => {
    const ctx = makeService();
    const next = externalStep({ id: 'step-2', assignedEmail: 'segundo@x.com', status: ApprovalStepStatus.WAITING, order: 2 });
    setupDecide(ctx, { approval: { mode: 'sequential' }, waiting: [next] });

    await ctx.service.decideExternalStep('step-1', { decision: 'approved' }, external);

    expect(next.status).toBe(ApprovalStepStatus.PENDING);
    expect(ctx.externalLinks.issueAndSend).toHaveBeenCalledWith('step-2');
    expect(ctx.eventEmitter.emit).not.toHaveBeenCalledWith('approvals.approved', expect.anything());
  });

  it('decisão por usuário logado continua igual: grava via "system", sem e-mail nem IP', async () => {
    const ctx = makeService();
    const { repos } = setupDecide(ctx, { step: externalStep({ assignedEmail: null, assignedUserId: 'user-id' }) });

    await ctx.service.approveStep('step-1', { decision: 'approved' }, actor());

    expect(repos.decision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        decidedByUserId: 'user-id',
        decidedByEmail: null,
        decidedVia: 'system',
        decidedIp: null,
      }),
    );
    expect(ctx.eventEmitter.emit).toHaveBeenCalledWith(
      'approvals.approved',
      expect.objectContaining({ actorId: 'user-id' }),
    );
  });

  it('usuário logado não decide etapa externa (mesmo sendo admin)', async () => {
    const ctx = makeService();
    setupDecide(ctx);

    await expect(
      ctx.service.approveStep('step-1', { decision: 'approved' }, actor({ role: 'admin' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── resendExternalLink ────────────────────────────────────────────────────────

describe('ApprovalsService.resendExternalLink', () => {
  it('gerente reenvia e recebe o resultado do envio', async () => {
    const ctx = makeService();
    ctx.stepsRepo.findOne.mockResolvedValue(externalStep());

    const result = await ctx.service.resendExternalLink('step-1', actor({ role: 'manager' }));

    expect(ctx.externalLinks.issueAndSend).toHaveBeenCalledWith('step-1');
    expect(result).toEqual({ sent: true, sentTo: EXTERNAL_EMAIL });
  });

  it('propaga a falha de envio sem lançar', async () => {
    const ctx = makeService();
    ctx.stepsRepo.findOne.mockResolvedValue(externalStep());
    ctx.externalLinks.issueAndSend.mockResolvedValue({ sent: false, error: 'SMTP fora do ar' });

    const result = await ctx.service.resendExternalLink('step-1', actor());

    expect(result).toEqual({ sent: false, sentTo: EXTERNAL_EMAIL, error: 'SMTP fora do ar' });
  });

  // Quem pode reenviar o link é conferido na rota ("pedir e cancelar aprovações" no processo do card).

  it('etapa inexistente: 404', async () => {
    const ctx = makeService();
    ctx.stepsRepo.findOne.mockResolvedValue(null);

    await expect(ctx.service.resendExternalLink('step-1', actor())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('etapa que não é externa: 400', async () => {
    const ctx = makeService();
    ctx.stepsRepo.findOne.mockResolvedValue(externalStep({ assignedEmail: null, assignedUserId: 'u' }));

    await expect(ctx.service.resendExternalLink('step-1', actor())).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.externalLinks.issueAndSend).not.toHaveBeenCalled();
  });
});
