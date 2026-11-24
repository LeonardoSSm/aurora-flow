import { BadRequestException } from '@nestjs/common';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationPhasePeriodEntity } from '../../database/entities';
import { recordPhaseChange } from './phase-periods';
import { PhaseSlaService } from './phase-sla.service';

const at = (iso: string) => new Date(`${iso}-03:00`);

function phase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ph-cot',
    formId: 'form-1',
    label: 'Cotação',
    order: 1,
    isTerminal: false,
    slaHours: 4,
    slaBusinessHours: false,
    slaWarningPercent: null,
    actors: { roleCodes: ['compras'], userIds: ['u-ana'] },
    actorRoleCode: 'compras',
    ...overrides,
  };
}

function solicitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sol-1',
    title: 'Compra de caixas',
    formId: 'form-1',
    currentPhaseId: 'ph-cot',
    createdAt: at('2026-10-14T08:00:00'),
    phaseEnteredAt: at('2026-10-14T09:00:00'),
    phaseDueAt: null,
    phaseSlaStatus: null,
    assigneeId: null,
    ...overrides,
  };
}

function makeService() {
  const solicitationsService = { findOne: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const solicitationsRepository = {
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const phasesRepository = { find: jest.fn().mockResolvedValue([]) };
  const periodsRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const historyRepository = { create: jest.fn((value: object) => value), save: jest.fn() };
  const usersRepository = { find: jest.fn().mockResolvedValue([{ id: 'u-joao' }]) };
  const notificationsService = {
    enqueue: jest.fn().mockResolvedValue({ created: true, message: { id: 'msg-1' } }),
    dispatch: jest.fn(),
  };
  const expoPushService = { sendToUsers: jest.fn() };
  const service = new PhaseSlaService(
    solicitationsService as never,
    eventEmitter as never,
    solicitationsRepository as never,
    phasesRepository as never,
    periodsRepository as never,
    historyRepository as never,
    usersRepository as never,
    notificationsService as never,
    expoPushService as never,
  );
  return {
    service,
    solicitationsService,
    eventEmitter,
    solicitationsRepository,
    queryBuilder,
    phasesRepository,
    periodsRepository,
    historyRepository,
    usersRepository,
    notificationsService,
    expoPushService,
  };
}

describe('PhaseSlaService.getTimeline', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(at('2026-10-14T12:30:00')));
  afterEach(() => jest.useRealTimers());

  it('passagens encerradas dizem se cumpriram o prazo; a atual mostra o estado agora', async () => {
    const ctx = makeService();
    ctx.solicitationsService.findOne.mockResolvedValue(solicitation());
    ctx.phasesRepository.find.mockResolvedValue([phase({ id: 'ph-novo', order: 0, label: 'Novo' }), phase()]);
    ctx.periodsRepository.find.mockResolvedValue([
      {
        phaseId: 'ph-novo',
        phaseLabel: 'Novo',
        enteredAt: at('2026-10-14T08:00:00'),
        leftAt: at('2026-10-14T09:00:00'),
        dueAt: at('2026-10-14T08:30:00'),
        slaBusinessHours: false,
        extended: false,
      },
      {
        phaseId: 'ph-cot',
        phaseLabel: 'Cotação',
        enteredAt: at('2026-10-14T09:00:00'),
        leftAt: null,
        dueAt: null,
        slaBusinessHours: false,
        extended: false,
      },
    ]);

    const timeline = await ctx.service.getTimeline('sol-1', { sub: 'u', role: 'admin' } as never);

    expect(timeline).toEqual([
      expect.objectContaining({ phaseLabel: 'Novo', status: 'late', durationMinutes: 60, current: false }),
      expect.objectContaining({
        phaseLabel: 'Cotação',
        current: true,
        // 3h30 de 4h = 87,5% → alerta
        status: 'warning',
        dueAt: at('2026-10-14T13:00:00').toISOString(),
        durationMinutes: 210,
      }),
    ]);
  });

  it('card nunca movido: a fase atual entra desde a criação', async () => {
    const ctx = makeService();
    ctx.solicitationsService.findOne.mockResolvedValue(
      solicitation({ currentPhaseId: null, phaseEnteredAt: null }),
    );
    ctx.phasesRepository.find.mockResolvedValue([phase({ slaHours: null })]);

    const timeline = await ctx.service.getTimeline('sol-1', { sub: 'u', role: 'admin' } as never);

    expect(timeline).toEqual([
      expect.objectContaining({
        phaseLabel: 'Cotação',
        enteredAt: at('2026-10-14T08:00:00').toISOString(),
        status: 'no_sla',
        current: true,
      }),
    ]);
  });
});

describe('PhaseSlaService.extend', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(at('2026-10-14T12:30:00')));
  afterEach(() => jest.useRealTimers());

  it('grava o novo prazo, marca a passagem como prorrogada e registra no histórico', async () => {
    const ctx = makeService();
    ctx.solicitationsService.findOne.mockResolvedValue(solicitation());
    ctx.phasesRepository.find.mockResolvedValue([phase()]);
    ctx.periodsRepository.findOne.mockResolvedValue({ id: 'per-1', leftAt: null, extended: false });

    await ctx.service.extend(
      'sol-1',
      { dueAt: at('2026-10-15T18:00:00').toISOString(), reason: 'Fornecedor pediu mais um dia' },
      { sub: 'u-gestor', role: 'admin' } as never,
    );

    expect(ctx.solicitationsRepository.update).toHaveBeenCalledWith('sol-1', {
      phaseDueAt: at('2026-10-15T18:00:00'),
      phaseSlaStatus: null,
    });
    expect(ctx.periodsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'per-1', dueAt: at('2026-10-15T18:00:00'), extended: true }),
    );
    expect(ctx.historyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SolicitationHistoryEventType.PHASE_SLA_EXTENDED,
        actorId: 'u-gestor',
        fromValue: at('2026-10-14T13:00:00').toISOString(),
        message: 'Prazo da fase "Cotação" alterado para 15/10/2026, 18:00 — Fornecedor pediu mais um dia.',
      }),
    );
  });

  it('recusa fase sem prazo e data no passado', async () => {
    const ctx = makeService();
    ctx.solicitationsService.findOne.mockResolvedValue(solicitation());
    ctx.phasesRepository.find.mockResolvedValue([phase({ slaHours: null })]);
    await expect(
      ctx.service.extend('sol-1', { dueAt: at('2026-10-20T10:00:00').toISOString() }, { sub: 'u' } as never),
    ).rejects.toThrow('A fase atual deste card não tem prazo.');

    ctx.phasesRepository.find.mockResolvedValue([phase()]);
    await expect(
      ctx.service.extend('sol-1', { dueAt: at('2026-10-14T10:00:00').toISOString() }, { sub: 'u' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PhaseSlaService.checkPhaseDeadlines', () => {
  afterEach(() => jest.useRealTimers());

  function setup(now: string, card: Record<string, unknown>) {
    jest.useFakeTimers().setSystemTime(at(now));
    const ctx = makeService();
    ctx.phasesRepository.find.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve('slaHours' in where ? [phase()] : [phase({ id: 'ph-novo', order: 0, slaHours: null }), phase()]),
    );
    ctx.queryBuilder.getMany.mockResolvedValue([solicitation(card)]);
    return ctx;
  }

  it('entra em alerta: grava, dispara o evento dos fluxos e avisa quem atua na fase', async () => {
    const ctx = setup('2026-10-14T12:30:00', {});
    await expect(ctx.service.checkPhaseDeadlines()).resolves.toEqual({ processed: 1, warned: 1, breached: 0 });

    expect(ctx.solicitationsRepository.update).toHaveBeenCalledWith('sol-1', { phaseSlaStatus: 'warning' });
    expect(ctx.eventEmitter.emit).toHaveBeenCalledWith('solicitations.phase_sla.warning', {
      solicitationId: 'sol-1',
      phaseId: 'ph-cot',
      phaseLabel: 'Cotação',
      enteredAt: at('2026-10-14T09:00:00').toISOString(),
    });
    expect(ctx.notificationsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'in_app',
        title: 'Prazo perto de vencer na fase "Cotação"',
        recipients: [
          { source: 'user', userId: 'u-joao' },
          { source: 'user', userId: 'u-ana' },
        ],
      }),
    );
    expect(ctx.notificationsService.dispatch).toHaveBeenCalledWith('msg-1');
    // A coluna da chave de idempotência tem 100 caracteres.
    expect(ctx.notificationsService.enqueue.mock.calls[0][0].idempotencyKey.length).toBeLessThanOrEqual(100);
    expect(ctx.expoPushService.sendToUsers).toHaveBeenCalledWith(['u-joao', 'u-ana'], expect.anything());
  });

  it('vence depois do alerta; o mesmo estado não avisa de novo', async () => {
    const late = setup('2026-10-14T13:30:00', { phaseSlaStatus: 'warning' });
    await expect(late.service.checkPhaseDeadlines()).resolves.toMatchObject({ breached: 1 });
    expect(late.eventEmitter.emit).toHaveBeenCalledWith('solicitations.phase_sla.breached', expect.anything());

    const again = setup('2026-10-14T14:30:00', { phaseSlaStatus: 'breached' });
    await expect(again.service.checkPhaseDeadlines()).resolves.toMatchObject({ warned: 0, breached: 0 });
    expect(again.eventEmitter.emit).not.toHaveBeenCalled();
    expect(again.notificationsService.enqueue).not.toHaveBeenCalled();
  });

  it('prazo prorrogado volta ao normal e zera o aviso', async () => {
    const ctx = setup('2026-10-14T13:30:00', {
      phaseSlaStatus: 'breached',
      phaseDueAt: at('2026-10-16T18:00:00'),
    });
    await ctx.service.checkPhaseDeadlines();
    expect(ctx.solicitationsRepository.update).toHaveBeenCalledWith('sol-1', { phaseSlaStatus: null });
    expect(ctx.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('sem fase com prazo não consulta cards', async () => {
    jest.useFakeTimers().setSystemTime(at('2026-10-14T12:30:00'));
    const ctx = makeService();
    await expect(ctx.service.checkPhaseDeadlines()).resolves.toEqual({ processed: 0, warned: 0, breached: 0 });
    expect(ctx.solicitationsRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe('recordPhaseChange', () => {
  function manager(open: unknown) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(open),
      create: jest.fn((value: object) => value),
      save: jest.fn(),
    };
    return {
      repo,
      manager: { getRepository: jest.fn((entity: unknown) => (entity === SolicitationPhasePeriodEntity ? repo : null)) },
    };
  }

  it('fecha a passagem aberta com o prazo que valia e abre a da fase nova; zera o prazo do card', async () => {
    const { repo, manager: m } = manager({ id: 'per-1', leftAt: null, extended: false });
    const sol = solicitation({ phaseSlaStatus: 'warning' });
    const now = at('2026-10-14T15:00:00');

    await recordPhaseChange(m as never, {
      solicitation: sol as never,
      from: phase() as never,
      to: phase({ id: 'ph-compra', label: 'Compra', slaHours: 2, slaBusinessHours: true }) as never,
      now,
    });

    expect(repo.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'per-1',
      leftAt: now,
      dueAt: at('2026-10-14T13:00:00'),
    }));
    expect(repo.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phaseId: 'ph-compra',
      enteredAt: now,
      leftAt: null,
      // 15h + 2h úteis = 17h
      dueAt: at('2026-10-14T17:00:00'),
      slaBusinessHours: true,
    }));
    expect(sol).toMatchObject({ phaseEnteredAt: now, phaseDueAt: null, phaseSlaStatus: null });
  });

  it('card sem passagem gravada ganha a anterior desde a entrada conhecida', async () => {
    const { repo, manager: m } = manager(null);
    await recordPhaseChange(m as never, {
      solicitation: solicitation({ phaseEnteredAt: null }) as never,
      from: phase({ slaHours: null }) as never,
      to: phase({ id: 'ph-compra', label: 'Compra', slaHours: null }) as never,
      now: at('2026-10-14T15:00:00'),
    });
    expect(repo.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
      phaseId: 'ph-cot',
      enteredAt: at('2026-10-14T08:00:00'),
      leftAt: at('2026-10-14T15:00:00'),
      dueAt: null,
    }));
  });
});
