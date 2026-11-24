import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  SolicitationCreatedEvent,
  SolicitationMovedEvent,
} from '../../common/events/solicitation-events';
import type { FlowEntity, SolicitationEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsSolicitationListener } from './flows-solicitation.listener';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes: [
      {
        id: 'trigger-id',
        type: 'trigger_solicitation_created',
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

  const listener = new FlowsSolicitationListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    solicitationsRepo as never,
  );

  return { listener, rabbitMqService, flowsService, solicitationsRepo };
}

describe('FlowsSolicitationListener', () => {
  it('dispara fluxo com trigger_solicitation_created', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();
    const flow = makeFlow();

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleSolicitationCreated(
      new SolicitationCreatedEvent(
        'actor-id',
        solicitation.id,
        SolicitationOriginType.MANUAL,
        solicitation.formId,
        null,
      ),
    );

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_solicitation_created',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_solicitation_created',
        eventName: 'solicitations.created',
        solicitationId: solicitation.id,
        actorId: 'actor-id',
      }),
      expect.objectContaining({
        messageId: `solicitations.created:${solicitation.id}:${flow.id}`,
      }),
    );
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('nao dispara quando nao ha fluxo para o trigger correto', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handleSolicitationCreated(
      new SolicitationCreatedEvent(
        'actor-id',
        solicitation.id,
        SolicitationOriginType.MANUAL,
        solicitation.formId,
        null,
      ),
    );

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_solicitation_created',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('executa inline quando publishJson retorna false', async () => {
    const { listener, rabbitMqService, flowsService, solicitationsRepo } = makeListener();
    const solicitation = makeSolicitation();
    const flow = makeFlow({
      nodes: [
        {
          id: 'trigger-id',
          type: 'trigger_solicitation_moved',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
    });

    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handleSolicitationMoved(
      new SolicitationMovedEvent(
        'actor-id',
        solicitation.id,
        SolicitationStatus.NEW,
        SolicitationStatus.IN_ANALYSIS,
      ),
    );

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_solicitation_moved',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        eventName: 'solicitations.moved',
        solicitation,
        metadata: expect.objectContaining({
          fromStatus: SolicitationStatus.NEW,
          toStatus: SolicitationStatus.IN_ANALYSIS,
        }),
      }),
    );
  });
});
