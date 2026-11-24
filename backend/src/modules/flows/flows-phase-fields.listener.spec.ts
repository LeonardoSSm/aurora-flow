import { PhaseFieldsSavedEvent } from '../../common/events/solicitation-events';
import type { FlowEntity, SolicitationEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsPhaseFieldsListener } from './flows-phase-fields.listener';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes: [
      { id: 'trigger-id', type: 'trigger_phase_field_saved', position: { x: 0, y: 0 }, data: {} },
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
    id: 'sol-1',
    formId: 'form-id',
    currentPhaseId: 'phase-3',
    submission: { id: 'sub-1', formId: 'form-id', form: { id: 'form-id', name: 'Formulario' }, items: [] },
    form: { id: 'form-id', name: 'Formulario' },
    ...overrides,
  } as SolicitationEntity;
}

function makeListener() {
  const configService = { get: jest.fn((_key: string, fallback: string) => fallback) };
  const rabbitMqService = { publishJson: jest.fn() };
  const flowsService = {
    findActiveFlowEntries: jest.fn(),
    executeFlowWithContext: jest.fn(),
    resumePausedPhaseFieldsExecution: jest.fn(),
  };
  const solicitationsRepo = { findOne: jest.fn() };
  const kanbanPhasesRepo = { findOne: jest.fn() };
  const executionsRepo = { find: jest.fn().mockResolvedValue([]) };

  const listener = new FlowsPhaseFieldsListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    solicitationsRepo as never,
    kanbanPhasesRepo as never,
    executionsRepo as never,
  );

  return { listener, rabbitMqService, flowsService, solicitationsRepo, kanbanPhasesRepo, executionsRepo };
}

describe('FlowsPhaseFieldsListener', () => {
  it('ignora quando a solicitação não existe ou não tem formulário', async () => {
    const { listener, solicitationsRepo, flowsService } = makeListener();
    solicitationsRepo.findOne.mockResolvedValue(null);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
  });

  it('não dispara quando não há fluxo ativo para o formulário', async () => {
    const { listener, solicitationsRepo, flowsService, rabbitMqService } = makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_phase_field_saved',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
  });

  it('dispara o fluxo quando o gatilho não filtra por fase (phaseId ausente)', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue({
      id: 'phase-3',
      label: 'Quantidade produzida',
      approverRoleCode: 'supervisor',
    });
    const flow = makeFlow();
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_phase_field_saved',
        eventName: 'solicitations.phase_fields_saved',
        solicitationId: 'sol-1',
        metadata: expect.objectContaining({
          phaseId: 'phase-3',
          phaseLabel: 'Quantidade produzida',
          approverRoleCode: 'supervisor',
        }),
      }),
      expect.anything(),
    );
  });

  it('pede ao serviço só os gatilhos da fase que foi salva (o filtro por fase é dele)', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-3', approverRoleCode: 'supervisor' });
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_phase_field_saved',
      expect.objectContaining({ phaseId: 'phase-3' }),
    );
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('dispara quando o gatilho filtra exatamente para a fase que foi salva', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-3', approverRoleCode: 'supervisor' });
    const flow = makeFlow({
      nodes: [
        {
          id: 'trigger-id',
          type: 'trigger_phase_field_saved',
          position: { x: 0, y: 0 },
          data: { phaseId: 'phase-3' },
        },
      ],
    } as never);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(rabbitMqService.publishJson).toHaveBeenCalled();
  });

  it('executa inline quando o RabbitMQ está indisponível', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } =
      makeListener();
    const solicitation = makeSolicitation();
    solicitationsRepo.findOne.mockResolvedValue(solicitation);
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-3', approverRoleCode: 'supervisor' });
    const flow = makeFlow();
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        eventName: 'solicitations.phase_fields_saved',
        solicitation,
        metadata: expect.objectContaining({ phaseId: 'phase-3', approverRoleCode: 'supervisor' }),
      }),
    );
  });

  it('não quebra quando a fase não é encontrada (segue com metadata mínimo)', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue(null);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(makeFlow()));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await expect(
      listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3')),
    ).resolves.not.toThrow();

    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({ metadata: { phaseId: 'phase-3' } }),
      expect.anything(),
    );
  });

  it('retoma uma execução pausada esperando esta fase mesmo sem nenhum fluxo com esse gatilho como início', async () => {
    // Um fluxo unificado (gatilho "Anexo enviado" + action_wait_for_phase_fields no meio) nunca
    // aparece em findActiveFlowsByTrigger('trigger_phase_field_saved', ...), porque seu próprio
    // gatilho é outro — a retomada não pode depender de ter encontrado algum fluxo ali.
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, executionsRepo, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue({
      id: 'phase-3',
      label: 'Quantidade produzida',
      approverRoleCode: 'supervisor',
    });
    flowsService.findActiveFlowEntries.mockResolvedValue([]);
    executionsRepo.find.mockResolvedValue([{ id: 'execution-1' }]);
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(executionsRepo.find).toHaveBeenCalledWith({
      where: { solicitationId: 'sol-1', status: 'waiting_phase_fields', waitingPhaseId: 'phase-3' },
    });
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_resume_phase_fields',
        executionId: 'execution-1',
        metadata: expect.objectContaining({ phaseId: 'phase-3', approverRoleCode: 'supervisor' }),
      }),
      expect.anything(),
    );
  });

  it('retoma inline quando o RabbitMQ está indisponível', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, executionsRepo, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-3', approverRoleCode: 'supervisor' });
    flowsService.findActiveFlowEntries.mockResolvedValue([]);
    executionsRepo.find.mockResolvedValue([{ id: 'execution-1' }]);
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(flowsService.resumePausedPhaseFieldsExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({ phaseId: 'phase-3', approverRoleCode: 'supervisor' }),
    );
  });

  it('não retoma nada quando não há execução pausada esperando esta fase', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, executionsRepo, rabbitMqService } =
      makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'phase-3', approverRoleCode: 'supervisor' });
    flowsService.findActiveFlowEntries.mockResolvedValue([]);
    executionsRepo.find.mockResolvedValue([]);

    await listener.handlePhaseFieldsSaved(new PhaseFieldsSavedEvent(null, 'sol-1', 'phase-3'));

    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.resumePausedPhaseFieldsExecution).not.toHaveBeenCalled();
  });
});
