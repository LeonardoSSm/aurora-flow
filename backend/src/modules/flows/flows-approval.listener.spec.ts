import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import {
  ApprovalApprovedEvent,
  ApprovalRejectedEvent,
} from '../../common/events/approval-events';
import type { ApprovalEntity, FlowEntity, SolicitationEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsApprovalListener } from './flows-approval.listener';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes: [
      {
        id: 'trigger-id',
        type: 'trigger_approval_completed',
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

function makeApproval(overrides: Partial<ApprovalEntity> = {}): ApprovalEntity {
  return {
    id: 'approval-id',
    solicitationId: 'solicitation-id',
    solicitation: makeSolicitation(),
    status: ApprovalStatus.APPROVED,
    title: 'Aprovacao',
    description: null,
    steps: [],
    ...overrides,
  } as ApprovalEntity;
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
    resumePausedExecution: jest.fn(),
  };
  const approvalsRepo = {
    findOne: jest.fn(),
  };
  const executionsRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const listener = new FlowsApprovalListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    approvalsRepo as never,
    executionsRepo as never,
  );

  return { listener, rabbitMqService, flowsService, approvalsRepo, executionsRepo };
}

describe('FlowsApprovalListener', () => {
  it('dispara fluxo com trigger_approval_completed', async () => {
    const { listener, rabbitMqService, flowsService, approvalsRepo } = makeListener();
    const approval = makeApproval();
    const flow = makeFlow();

    approvalsRepo.findOne.mockResolvedValue(approval);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleApprovalCompleted(
      new ApprovalApprovedEvent('actor-id', approval.id, approval.solicitationId),
    );

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_approval_completed',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_approval_completed',
        eventName: 'approvals.approved',
        approvalId: approval.id,
        solicitationId: approval.solicitationId,
        actorId: 'actor-id',
      }),
      expect.objectContaining({
        messageId: `approvals.approved:${approval.id}:${flow.id}`,
      }),
    );
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('nao dispara quando nao ha fluxo para o trigger correto', async () => {
    const { listener, rabbitMqService, flowsService, approvalsRepo } = makeListener();
    const approval = makeApproval();

    approvalsRepo.findOne.mockResolvedValue(approval);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handleApprovalCompleted(
      new ApprovalApprovedEvent('actor-id', approval.id, approval.solicitationId),
    );

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_approval_completed',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('executa inline quando publishJson retorna false', async () => {
    const { listener, rabbitMqService, flowsService, approvalsRepo } = makeListener();
    const approval = makeApproval({ status: ApprovalStatus.REJECTED });
    const flow = makeFlow();

    approvalsRepo.findOne.mockResolvedValue(approval);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handleApprovalCompleted(
      new ApprovalRejectedEvent('actor-id', approval.id, approval.solicitationId, 'step-id'),
    );

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        eventName: 'approvals.rejected',
        approval,
        solicitation: approval.solicitation,
        metadata: expect.objectContaining({
          decision: 'rejected',
          stepId: 'step-id',
        }),
      }),
    );
  });

  it('retoma execução parada nesta aprovação, publicando um flow_resume job', async () => {
    const { listener, rabbitMqService, flowsService, approvalsRepo, executionsRepo } =
      makeListener();
    const approval = makeApproval();

    approvalsRepo.findOne.mockResolvedValue(approval);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);
    executionsRepo.find.mockResolvedValue([{ id: 'execution-id', flowId: 'flow-id' }]);
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleApprovalCompleted(
      new ApprovalApprovedEvent('actor-id', approval.id, approval.solicitationId),
    );

    expect(executionsRepo.find).toHaveBeenCalledWith({
      where: { approvalId: approval.id, status: 'waiting_approval' },
    });
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_resume',
        executionId: 'execution-id',
        approvalId: approval.id,
      }),
      expect.objectContaining({ messageId: `flow_resume:execution-id:${approval.id}` }),
    );
    expect(flowsService.resumePausedExecution).not.toHaveBeenCalled();
  });

  it('retoma inline quando publishJson retorna false', async () => {
    const { listener, rabbitMqService, flowsService, approvalsRepo, executionsRepo } =
      makeListener();
    const approval = makeApproval();

    approvalsRepo.findOne.mockResolvedValue(approval);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);
    executionsRepo.find.mockResolvedValue([{ id: 'execution-id', flowId: 'flow-id' }]);
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handleApprovalCompleted(
      new ApprovalApprovedEvent('actor-id', approval.id, approval.solicitationId),
    );

    expect(flowsService.resumePausedExecution).toHaveBeenCalledWith(
      'execution-id',
      approval.id,
    );
  });

  it('não tenta retomar nada quando não há execução parada nesta aprovação', async () => {
    const { listener, rabbitMqService, flowsService, approvalsRepo, executionsRepo } =
      makeListener();
    const approval = makeApproval();

    approvalsRepo.findOne.mockResolvedValue(approval);
    flowsService.findActiveFlowEntries.mockResolvedValue([]);
    executionsRepo.find.mockResolvedValue([]);

    await listener.handleApprovalCompleted(
      new ApprovalApprovedEvent('actor-id', approval.id, approval.solicitationId),
    );

    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.resumePausedExecution).not.toHaveBeenCalled();
  });
});
