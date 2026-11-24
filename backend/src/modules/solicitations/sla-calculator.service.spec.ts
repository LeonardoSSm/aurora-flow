import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type { SolicitationEntity } from '../../database/entities';
import { SlaCalculatorService } from './sla-calculator.service';

const NOW = new Date('2026-05-16T12:00:00.000Z');

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    status: SolicitationStatus.IN_PROGRESS,
    createdAt: new Date('2026-05-16T08:00:00.000Z'),
    slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
    slaPausedAt: null,
    slaDueAt: new Date('2026-05-16T18:00:00.000Z'),
    slaBreachedAt: null,
    slaStatus: SolicitationSlaStatus.ON_TRACK,
    slaWarningThresholdPercent: 80,
    slaDurationHours: 10,
    ...overrides,
  } as SolicitationEntity;
}

function makeQueryBuilder(solicitations: SolicitationEntity[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(solicitations),
  };
}

function makeService(solicitations: SolicitationEntity[] = []) {
  const queryBuilder = makeQueryBuilder(solicitations);
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const eventEmitter = {
    emit: jest.fn(),
  };
  const metricsService = {
    setSolicitationsSlaBreachedTotal: jest.fn(),
    setSolicitationsBySlaStatus: jest.fn(),
    setSolicitationsByArea: jest.fn(),
  };
  const service = new SlaCalculatorService(
    repository as never,
    eventEmitter as unknown as EventEmitter2,
    metricsService as never,
  );

  return { service, repository, eventEmitter, queryBuilder, metricsService };
}

describe('SlaCalculatorService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calculateSlaDueAt retorna data correta', () => {
    const { service } = makeService();
    const startedAt = new Date('2026-05-16T10:00:00.000Z');

    expect(service.calculateSlaDueAt(startedAt, 6)).toEqual(
      new Date('2026-05-16T16:00:00.000Z'),
    );
  });

  it('getSlaStatus retorna on_track quando abaixo do threshold', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(makeSolicitation());

    expect(result).toEqual(
      expect.objectContaining({
        status: SolicitationSlaStatus.ON_TRACK,
        percentUsed: 40,
        minutesRemaining: 360,
        isBreached: false,
        isWarning: false,
      }),
    );
  });

  it('getSlaStatus retorna warning quando atinge o threshold e não venceu', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({
        slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
        slaDueAt: new Date('2026-05-16T13:00:00.000Z'),
        slaWarningThresholdPercent: 80,
      }),
    );

    expect(result.status).toBe(SolicitationSlaStatus.WARNING);
    expect(result.percentUsed).toBe(80);
    expect(result.isWarning).toBe(true);
    expect(result.isBreached).toBe(false);
  });

  it('getSlaStatus respeita threshold customizado', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({
        slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
        slaDueAt: new Date('2026-05-16T18:00:00.000Z'),
        slaWarningThresholdPercent: 40,
      }),
    );

    expect(result.status).toBe(SolicitationSlaStatus.WARNING);
    expect(result.isWarning).toBe(true);
  });

  it('getSlaStatus usa threshold padrão 80 quando campo está nulo', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({
        slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
        slaDueAt: new Date('2026-05-16T13:00:00.000Z'),
        slaWarningThresholdPercent: null,
      }),
    );

    expect(result.status).toBe(SolicitationSlaStatus.WARNING);
  });

  it('getSlaStatus retorna breached quando now é maior que slaDueAt', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({
        slaDueAt: new Date('2026-05-16T11:30:00.000Z'),
      }),
    );

    expect(result.status).toBe(SolicitationSlaStatus.BREACHED);
    expect(result.isBreached).toBe(true);
    expect(result.minutesRemaining).toBe(-30);
  });

  it('getSlaStatus retorna completed para status terminal', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({ status: SolicitationStatus.COMPLETED }),
    );

    expect(result.status).toBe(SolicitationSlaStatus.COMPLETED);
    expect(result.isBreached).toBe(false);
    expect(result.isWarning).toBe(false);
  });

  it('getSlaStatus retorna null quando sem slaDueAt', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(makeSolicitation({ slaDueAt: null }));

    expect(result).toEqual({
      status: null,
      percentUsed: 0,
      minutesRemaining: 0,
      isBreached: false,
      isWarning: false,
    });
  });

  it('getSlaStatus retorna paused quando há pausa registrada', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({ slaPausedAt: new Date('2026-05-16T11:00:00.000Z') }),
    );

    expect(result.status).toBe(SolicitationSlaStatus.PAUSED);
    expect(result.isWarning).toBe(false);
  });

  it('getSlaStatus usa createdAt quando slaStartedAt está nulo', () => {
    const { service } = makeService();
    const result = service.getSlaStatus(
      makeSolicitation({
        createdAt: new Date('2026-05-16T10:00:00.000Z'),
        slaStartedAt: null,
        slaDueAt: new Date('2026-05-16T14:00:00.000Z'),
      }),
    );

    expect(result.percentUsed).toBe(50);
    expect(result.minutesRemaining).toBe(120);
  });

  it('initializeSlaForSolicitation preenche campos corretos', () => {
    const { service } = makeService();
    const result = service.initializeSlaForSolicitation(makeSolicitation(), 12);

    expect(result).toEqual(
      expect.objectContaining({
        slaStartedAt: NOW,
        slaDurationHours: 12,
        slaDueAt: new Date('2026-05-17T00:00:00.000Z'),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaWarningThresholdPercent: 80,
      }),
    );
  });

  it('initializeSlaForSolicitation sem duração deixa vencimento nulo', () => {
    const { service } = makeService();
    const result = service.initializeSlaForSolicitation(makeSolicitation(), undefined);

    expect(result).toEqual(
      expect.objectContaining({
        slaDurationHours: null,
        slaDueAt: null,
        slaStatus: SolicitationSlaStatus.ON_TRACK,
      }),
    );
  });

  it('initializeSlaForSolicitation ignora duração inválida', () => {
    const { service } = makeService();
    const result = service.initializeSlaForSolicitation(makeSolicitation(), 0);

    expect(result.slaDurationHours).toBeNull();
    expect(result.slaDueAt).toBeNull();
  });

  it('initializeSlaWithDeadline usa a data recebida e deriva a duração', () => {
    const { service } = makeService();
    // NOW + 12h, para conferir a duração derivada sem depender do calendário.
    const dueAt = new Date(NOW.getTime() + 12 * 60 * 60 * 1000);

    const result = service.initializeSlaWithDeadline(dueAt);

    expect(result).toEqual(
      expect.objectContaining({
        slaStartedAt: NOW,
        slaDueAt: dueAt,
        slaDurationHours: 12,
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaWarningThresholdPercent: 80,
      }),
    );
  });

  it('initializeSlaWithDeadline respeita o percentual de alerta informado', () => {
    const { service } = makeService();
    const dueAt = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);

    const result = service.initializeSlaWithDeadline(dueAt, 92);

    expect(result.slaWarningThresholdPercent).toBe(92);
    expect(result.slaDurationHours).toBe(365 * 24);
  });

  it('checkSlaDeadlines emite solicitations.sla.breached uma vez', async () => {
    const breached = makeSolicitation({
      slaDueAt: new Date('2026-05-16T11:00:00.000Z'),
      slaBreachedAt: null,
    });
    const { service, repository, eventEmitter } = makeService([breached]);

    await service.checkSlaDeadlines();

    expect(repository.update).toHaveBeenCalledWith('solicitation-id', {
      slaBreachedAt: NOW,
      slaStatus: SolicitationSlaStatus.BREACHED,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('solicitations.sla.breached', {
      solicitationId: 'solicitation-id',
    });
  });

  it('checkSlaDeadlines não reemite breached se slaBreachedAt já está preenchido', async () => {
    const breached = makeSolicitation({
      slaDueAt: new Date('2026-05-16T11:00:00.000Z'),
      slaBreachedAt: new Date('2026-05-16T11:30:00.000Z'),
      slaStatus: SolicitationSlaStatus.BREACHED,
    });
    const { service, repository, eventEmitter } = makeService([breached]);

    await service.checkSlaDeadlines();

    expect(repository.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('checkSlaDeadlines emite solicitations.sla.warning na transição', async () => {
    const warning = makeSolicitation({
      slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
      slaDueAt: new Date('2026-05-16T13:00:00.000Z'),
      slaStatus: SolicitationSlaStatus.ON_TRACK,
    });
    const { service, repository, eventEmitter } = makeService([warning]);

    await service.checkSlaDeadlines();

    expect(repository.update).toHaveBeenCalledWith('solicitation-id', {
      slaStatus: SolicitationSlaStatus.WARNING,
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('solicitations.sla.warning', {
      solicitationId: 'solicitation-id',
    });
  });

  it('checkSlaDeadlines retorna resumo do processamento manual', async () => {
    const warning = makeSolicitation({
      id: 'warning-id',
      slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
      slaDueAt: new Date('2026-05-16T13:00:00.000Z'),
      slaStatus: SolicitationSlaStatus.ON_TRACK,
    });
    const breached = makeSolicitation({
      id: 'breached-id',
      slaDueAt: new Date('2026-05-16T11:00:00.000Z'),
      slaBreachedAt: null,
    });
    const { service } = makeService([warning, breached]);

    await expect(service.checkSlaDeadlines()).resolves.toEqual({
      processed: 2,
      warned: 1,
      breached: 1,
    });
  });

  it('checkSlaDeadlines não reemite warning se status já é warning', async () => {
    const warning = makeSolicitation({
      slaStartedAt: new Date('2026-05-16T08:00:00.000Z'),
      slaDueAt: new Date('2026-05-16T13:00:00.000Z'),
      slaStatus: SolicitationSlaStatus.WARNING,
    });
    const { service, repository, eventEmitter } = makeService([warning]);

    await service.checkSlaDeadlines();

    expect(repository.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('checkSlaDeadlines corrige status para on_track quando voltou ao normal', async () => {
    const onTrack = makeSolicitation({
      slaDueAt: new Date('2026-05-16T18:00:00.000Z'),
      slaStatus: SolicitationSlaStatus.WARNING,
    });
    const { service, repository, eventEmitter } = makeService([onTrack]);

    await service.checkSlaDeadlines();

    expect(repository.update).toHaveBeenCalledWith('solicitation-id', {
      slaStatus: SolicitationSlaStatus.ON_TRACK,
    });
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('checkSlaDeadlines limita processamento a 100 solicitações por ciclo', async () => {
    const { service, queryBuilder } = makeService([]);

    await service.checkSlaDeadlines();

    expect(queryBuilder.take).toHaveBeenCalledWith(100);
  });

  it('checkSlaDeadlines atualiza métricas de SLA', async () => {
    const { service, repository, metricsService } = makeService([]);
    repository.count.mockImplementation(({ where }: { where: { slaStatus: SolicitationSlaStatus } }) => {
      const counts: Record<SolicitationSlaStatus, number> = {
        [SolicitationSlaStatus.ON_TRACK]: 5,
        [SolicitationSlaStatus.WARNING]: 2,
        [SolicitationSlaStatus.BREACHED]: 1,
        [SolicitationSlaStatus.PAUSED]: 0,
        [SolicitationSlaStatus.COMPLETED]: 3,
      };
      return Promise.resolve(counts[where.slaStatus]);
    });

    await service.checkSlaDeadlines();

    expect(metricsService.setSolicitationsSlaBreachedTotal).toHaveBeenCalledWith(1);
    expect(metricsService.setSolicitationsBySlaStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        [SolicitationSlaStatus.ON_TRACK]: 5,
        [SolicitationSlaStatus.WARNING]: 2,
        [SolicitationSlaStatus.BREACHED]: 1,
        [SolicitationSlaStatus.COMPLETED]: 3,
      }),
    );
  });
});
