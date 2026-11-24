import type { FlowEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsScheduledTriggerService } from './flows-scheduled-trigger.service';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: null,
    isActive: true,
    consecutiveFailureCount: 0,
    nextRunAt: new Date('2026-01-01T10:00:00.000Z'),
    lastRunAt: null,
    nodes: [
      {
        id: 'trigger-id',
        type: 'trigger_scheduled',
        position: { x: 0, y: 0 },
        data: { mode: 'interval', intervalValue: 15, intervalUnit: 'minutes' },
      },
    ],
    edges: [],
    ...overrides,
  } as FlowEntity;
}

function makeQb(flows: FlowEntity[]) {
  const qb: Record<string, jest.Mock> = {};
  const chain = (name: string) => {
    qb[name] = jest.fn().mockReturnValue(qb);
    return qb;
  };
  ['where', 'andWhere', 'orderBy', 'take'].forEach(chain);
  qb['getMany'] = jest.fn().mockResolvedValue(flows);
  return qb;
}

function makeService(dueFlows: FlowEntity[] = []) {
  const qb = makeQb(dueFlows);
  const flowsRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const configService = { get: jest.fn((_key: string, fallback: string) => fallback) };
  const rabbitMqService = { publishJson: jest.fn() };
  const flowsService = { executeFlowWithContext: jest.fn() };

  const service = new FlowsScheduledTriggerService(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    flowsRepo as never,
  );

  return { service, qb, flowsRepo, rabbitMqService, flowsService };
}

describe('FlowsScheduledTriggerService.pollDueFlows', () => {
  it('despacha um fluxo devido via RabbitMQ e atualiza next_run_at/last_run_at antes do despacho', async () => {
    const flow = makeFlow();
    const { service, flowsRepo, rabbitMqService } = makeService([flow]);
    rabbitMqService.publishJson.mockResolvedValue(true);

    await service.pollDueFlows();

    expect(flowsRepo.update).toHaveBeenCalledWith(
      'flow-id',
      expect.objectContaining({ lastRunAt: expect.any(Date), nextRunAt: expect.any(Date) }),
    );
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: 'flow-id',
        triggerType: 'trigger_scheduled',
        eventName: 'flows.scheduled.tick',
      }),
      expect.any(Object),
    );
  });

  it('executa inline quando publishJson retorna false', async () => {
    const flow = makeFlow();
    const { service, rabbitMqService, flowsService } = makeService([flow]);
    rabbitMqService.publishJson.mockResolvedValue(false);

    await service.pollDueFlows();

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({ eventName: 'flows.scheduled.tick' }),
    );
  });

  it('não despacha um fluxo sem nó trigger_scheduled (next_run_at desatualizado)', async () => {
    const flow = makeFlow({ nodes: [] });
    const { service, rabbitMqService, flowsRepo } = makeService([flow]);

    await service.pollDueFlows();

    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsRepo.update).not.toHaveBeenCalled();
  });

  it('limpa next_run_at quando a configuração do agendamento é inválida', async () => {
    const flow = makeFlow({
      nodes: [
        {
          id: 'trigger-id',
          type: 'trigger_scheduled',
          position: { x: 0, y: 0 },
          data: { mode: 'cron', cronExpression: 'not a cron' },
        },
      ],
    });
    const { service, flowsRepo, rabbitMqService } = makeService([flow]);

    await service.pollDueFlows();

    expect(flowsRepo.update).toHaveBeenCalledWith('flow-id', { nextRunAt: null });
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
  });

  it('não roda um segundo ciclo em paralelo enquanto o primeiro está em andamento', async () => {
    const flow = makeFlow();
    const { service, qb, rabbitMqService } = makeService([flow]);
    let resolvePublish!: (value: boolean) => void;
    rabbitMqService.publishJson.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolvePublish = resolve;
      }),
    );

    const firstCall = service.pollDueFlows();
    const secondCall = service.pollDueFlows();

    resolvePublish(true);
    await Promise.all([firstCall, secondCall]);

    // getMany só deveria ter sido chamado uma vez — o segundo ciclo pulou por causa da guarda.
    expect(qb.getMany).toHaveBeenCalledTimes(1);
  });
});
