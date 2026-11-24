import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import type { FlowEntity, SolicitationEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsSlaListener } from './flows-sla.listener';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes: [
      {
        id: 'trigger-id',
        type: 'trigger_sla_warning',
        position: { x: 0, y: 0 },
        data: {},
      },
    ],
    edges: [],
    ...overrides,
  } as FlowEntity;
}

/** O que findActiveFlowEntries devolve: cada fluxo com o primeiro gatilho como entrada. */
function entriesOf(...flows: FlowEntity[]) {
  return flows.map((flow) => ({
    flow,
    entryNode: flow.nodes.find((node) => node.type.startsWith('trigger_')),
  }));
}

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    title: 'Solicitacao',
    formId: 'form-id',
    form: { id: 'form-id', name: 'Formulario' },
    submissionId: null,
    submission: null,
    assignee: null,
    createdByUser: null,
    slaStatus: SolicitationSlaStatus.WARNING,
    ...overrides,
  } as SolicitationEntity;
}

function makeListener() {
  const configService = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  };
  const rabbitMqService = {
    publishJson: jest.fn(),
  };
  const flowsService = {
    findActiveFlowEntries: jest.fn(),
    executeFlowWithContext: jest.fn(),
  };
  const solicitationsRepo = {
    findOne: jest.fn(),
  };

  const listener = new FlowsSlaListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    solicitationsRepo as never,
  );

  return { listener, rabbitMqService, flowsService, solicitationsRepo };
}

describe('FlowsSlaListener', () => {
  it('dispara fluxo com trigger_sla_warning', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();
    const flow = makeFlow();

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleSlaWarning({ solicitationId: solicitation.id });

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_sla_warning',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_sla_warning',
        eventName: 'solicitations.sla.warning',
        solicitationId: solicitation.id,
      }),
      expect.objectContaining({
        messageId: `solicitations.sla.warning:${solicitation.id}:${flow.id}`,
      }),
    );
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('dispara fluxo com trigger_sla_breached', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation({ slaStatus: SolicitationSlaStatus.BREACHED });
    const flow = makeFlow({
      nodes: [
        {
          id: 'trigger-id',
          type: 'trigger_sla_breached',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
    });

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleSlaBreached({ solicitationId: solicitation.id });

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_sla_breached',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        triggerType: 'trigger_sla_breached',
        eventName: 'solicitations.sla.breached',
        solicitationId: solicitation.id,
      }),
      expect.objectContaining({
        messageId: `solicitations.sla.breached:${solicitation.id}:${flow.id}`,
      }),
    );
  });

  it('não dispara quando não há fluxo para o trigger correto', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handleSlaWarning({ solicitationId: solicitation.id });

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_sla_warning',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('não busca fluxos quando a solicitação não existe', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();

    solicitationsRepo.findOne.mockResolvedValue(null);

    await listener.handleSlaWarning({ solicitationId: 'missing-id' });

    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('executa inline quando publishJson retorna false', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();
    const flow = makeFlow();

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handleSlaWarning({ solicitationId: solicitation.id });

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        eventName: 'solicitations.sla.warning',
        solicitation,
        form: solicitation.form,
        metadata: { solicitationId: solicitation.id },
      }),
    );
  });

  it('usa formId null para buscar fluxos globais quando a solicitação não tem formulário', async () => {
    const { listener, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation({ formId: null, form: null });

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handleSlaBreached({ solicitationId: solicitation.id });

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_sla_breached',
      expect.objectContaining({ formId: null }),
    );
  });

  it('prazo da fase: busca gatilhos com "prazo da fase" e leva a fase na metadata', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();
    const flow = makeFlow();
    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handlePhaseSlaBreached({
      solicitationId: solicitation.id,
      phaseId: 'ph-cot',
      phaseLabel: 'Cotação',
      enteredAt: '2026-10-14T12:00:00.000Z',
    });

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith('trigger_sla_breached', {
      formId: 'form-id',
      slaScope: 'phase',
      phaseId: 'ph-cot',
    });
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        triggerType: 'trigger_sla_breached',
        eventName: 'solicitations.phase_sla.breached',
        metadata: {
          solicitationId: solicitation.id,
          slaScope: 'phase',
          phaseId: 'ph-cot',
          phaseLabel: 'Cotação',
          phaseEnteredAt: '2026-10-14T12:00:00.000Z',
        },
      }),
      expect.objectContaining({
        messageId: `solicitations.phase_sla.breached:${solicitation.id}:${flow.id}:ph-cot:2026-10-14T12:00:00.000Z`,
      }),
    );
  });
});
