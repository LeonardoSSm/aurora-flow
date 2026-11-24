import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { PhaseChangedEvent, SolicitationCreatedEvent } from '../../common/events/solicitation-events';
import type { FlowEntity, SolicitationEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsPhaseEnteredListener } from './flows-phase-entered.listener';
import { MAX_FLOW_EVENT_DEPTH } from './types/flow.types';

function makeFlow(data: Record<string, unknown> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes: [{ id: 'trigger-id', type: 'trigger_phase_entered', position: { x: 0, y: 0 }, data }],
    edges: [],
  } as unknown as FlowEntity;
}

function entriesOf(...flows: FlowEntity[]) {
  return flows.map((flow) => ({ flow, entryNode: flow.nodes[0] }));
}

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'sol-1',
    formId: 'form-id',
    submissionId: 'sub-1',
    currentPhaseId: null,
    submission: { id: 'sub-1', formId: 'form-id', items: [] },
    form: { id: 'form-id', name: 'Prestação de contas' },
    ...overrides,
  } as SolicitationEntity;
}

const novo = { id: 'fase-novo', formId: 'form-id', label: 'Novo', order: 0 };

function makeListener() {
  const configService = { get: jest.fn((_key: string, fallback: string) => fallback) };
  const rabbitMqService = { publishJson: jest.fn().mockResolvedValue(true) };
  const flowsService = { findActiveFlowEntries: jest.fn(), executeFlowWithContext: jest.fn() };
  const solicitationsRepo = { findOne: jest.fn() };
  const kanbanPhasesRepo = { findOne: jest.fn() };

  const listener = new FlowsPhaseEnteredListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    solicitationsRepo as never,
    kanbanPhasesRepo as never,
  );
  return { listener, rabbitMqService, flowsService, solicitationsRepo, kanbanPhasesRepo };
}

function created(originType = SolicitationOriginType.FORM_SUBMISSION, formId: string | null = 'form-id') {
  return new SolicitationCreatedEvent(null, 'sol-1', originType, formId, 'sub-1');
}

describe('FlowsPhaseEnteredListener — card que nasce na 1ª fase', () => {
  it('formulário enviado: dispara o "Entrou na fase" da 1ª fase (a fase ligada no mapa)', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } = makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue(novo);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(makeFlow({ phaseId: 'fase-novo' })));

    await listener.handleSolicitationCreated(created());

    expect(kanbanPhasesRepo.findOne).toHaveBeenCalledWith({
      where: { formId: 'form-id' },
      order: { order: 'ASC' },
    });
    // Sem fase de origem: o gatilho com "Vindo da fase" não casa com quem acabou de nascer.
    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith('trigger_phase_entered', {
      formId: 'form-id',
      phaseId: 'fase-novo',
    });
    expect(rabbitMqService.publishJson).toHaveBeenCalledTimes(1);
    const [queue, job] = rabbitMqService.publishJson.mock.calls[0];
    expect(queue).toBe(DEFAULT_FLOW_SUBMISSION_QUEUE);
    expect(job).toMatchObject({
      kind: 'flow_context',
      flowId: 'flow-id',
      triggerType: 'trigger_phase_entered',
      entryNodeId: 'trigger-id',
      eventName: 'solicitations.created',
      solicitationId: 'sol-1',
      submissionId: 'sub-1',
      flowEventDepth: 0,
      metadata: { phaseId: 'fase-novo', fromPhaseId: null, phaseLabel: 'Novo', flowEventDepth: 0 },
    });
  });

  it('criação manual também entra na 1ª fase', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } = makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ submissionId: null, submission: null }));
    kanbanPhasesRepo.findOne.mockResolvedValue(novo);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(makeFlow()));

    await listener.handleSolicitationCreated(created(SolicitationOriginType.MANUAL));

    expect(rabbitMqService.publishJson).toHaveBeenCalledTimes(1);
  });

  it('card que já nasce noutra fase (faixa de pontuação) não dispara aqui: vem por phase_changed', async () => {
    const { listener, solicitationsRepo, flowsService } = makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ currentPhaseId: 'fase-analise' }));

    await listener.handleSolicitationCreated(created());

    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
  });

  it('entrada externa (webhook / "Criar solicitação") fica de fora, sem nem consultar o banco', async () => {
    const { listener, solicitationsRepo, flowsService } = makeListener();

    await listener.handleSolicitationCreated(created(SolicitationOriginType.WEBHOOK));

    expect(solicitationsRepo.findOne).not.toHaveBeenCalled();
    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
  });

  it('sem formulário ou sem fases não dispara nada', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService } = makeListener();

    await listener.handleSolicitationCreated(created(SolicitationOriginType.MANUAL, null));
    expect(solicitationsRepo.findOne).not.toHaveBeenCalled();

    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.findOne.mockResolvedValue(null);
    await listener.handleSolicitationCreated(created());
    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
  });

  it('sem RabbitMQ executa o fluxo na hora, com os campos do formulário', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } = makeListener();
    rabbitMqService.publishJson.mockResolvedValue(false);
    solicitationsRepo.findOne.mockResolvedValue(
      makeSolicitation({
        submission: {
          id: 'sub-1',
          formId: 'form-id',
          items: [{ fieldCode: 'e_mail_gestor_imediato', valueText: 'gestor@empresa.com' }],
        } as never,
      }),
    );
    kanbanPhasesRepo.findOne.mockResolvedValue(novo);
    const flow = makeFlow({ phaseId: 'fase-novo' });
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));

    await listener.handleSolicitationCreated(created());

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        entryNodeId: 'trigger-id',
        fields: expect.objectContaining({ e_mail_gestor_imediato: 'gestor@empresa.com' }),
        metadata: expect.objectContaining({ phaseId: 'fase-novo' }),
      }),
    );
  });

  it('falha ao buscar não sobe para quem criou a solicitação', async () => {
    const { listener, solicitationsRepo } = makeListener();
    solicitationsRepo.findOne.mockRejectedValue(new Error('banco fora'));

    await expect(listener.handleSolicitationCreated(created())).resolves.toBeUndefined();
  });
});

describe('FlowsPhaseEnteredListener — mudança de fase', () => {
  it('filtra pela fase de destino e de origem e passa o encadeamento adiante', async () => {
    const { listener, solicitationsRepo, kanbanPhasesRepo, flowsService, rabbitMqService } = makeListener();
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation({ currentPhaseId: 'fase-analise' }));
    kanbanPhasesRepo.findOne.mockResolvedValue({ id: 'fase-analise', label: 'Analise' });
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(makeFlow()));

    await listener.handlePhaseChanged(new PhaseChangedEvent('user-1', 'sol-1', 'fase-novo', 'fase-analise', 2));

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith('trigger_phase_entered', {
      formId: 'form-id',
      phaseId: 'fase-analise',
      fromPhaseId: 'fase-novo',
    });
    expect(rabbitMqService.publishJson.mock.calls[0][1]).toMatchObject({
      eventName: 'solicitations.phase_changed',
      actorId: 'user-1',
      flowEventDepth: 2,
      metadata: { phaseId: 'fase-analise', fromPhaseId: 'fase-novo', phaseLabel: 'Analise' },
    });
  });

  it('para no limite de encadeamento', async () => {
    const { listener, solicitationsRepo } = makeListener();

    await listener.handlePhaseChanged(
      new PhaseChangedEvent(null, 'sol-1', 'a', 'b', MAX_FLOW_EVENT_DEPTH),
    );

    expect(solicitationsRepo.findOne).not.toHaveBeenCalled();
  });
});
