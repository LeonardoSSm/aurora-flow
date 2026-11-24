import { BadRequestException } from '@nestjs/common';
import type { FlowEntity } from '../../database/entities';
import { FlowsService } from './flows.service';

/**
 * Um fluxo com vários gatilhos: cada um é uma entrada ligada a um ponto do grafo (ex.: o lote de
 * pedidos recebido por webhook entra direto no Financeiro, pulando a Logística).
 */

type Partes = {
  flowsRepo?: object;
  executionsRepo?: object;
  formsRepo?: object;
  engine?: object;
  metricsService?: object;
  permissionsService?: object;
};

function novoServico(partes: Partes = {}) {
  return new FlowsService(
    (partes.flowsRepo ?? {}) as never,
    (partes.executionsRepo ?? {}) as never,
    {} as never,
    (partes.formsRepo ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    (partes.engine ?? {}) as never,
    (partes.metricsService ?? {}) as never,
    (partes.permissionsService ?? {
      getScope: jest.fn().mockResolvedValue('all'),
    }) as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
  );
}

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

function fluxo(nodes: ReturnType<typeof no>[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'flow-id',
    formId: null,
    isActive: true,
    nodes,
    edges: [],
    consecutiveFailureCount: 0,
    ...overrides,
  } as unknown as FlowEntity;
}

describe('FlowsService.findActiveFlowEntries', () => {
  function buscar(flows: FlowEntity[]) {
    return novoServico({ flowsRepo: { find: jest.fn().mockResolvedValue(flows) } });
  }

  it('entra pelo gatilho do tipo do evento, não pelo primeiro do fluxo', async () => {
    const flow = fluxo([
      no('lote', 'trigger_webhook_received', { endpointId: 'ep-1' }),
      no('envio', 'trigger_form_submit', { formId: 'form-1' }),
    ]);

    const entries = await buscar([flow]).findActiveFlowEntries('trigger_form_submit', {
      formId: 'form-1',
    });

    expect(entries).toEqual([{ flow, entryNode: expect.objectContaining({ id: 'envio' }) }]);
  });

  it('cada gatilho confere o próprio formulário', async () => {
    const flow = fluxo([
      no('a', 'trigger_form_submit', { formId: 'form-a' }),
      no('b', 'trigger_form_submit', { formId: 'form-b' }),
    ]);
    const service = buscar([flow]);

    const [doB] = await service.findActiveFlowEntries('trigger_form_submit', { formId: 'form-b' });
    const deOutro = await service.findActiveFlowEntries('trigger_form_submit', { formId: 'form-c' });

    expect(doB.entryNode.id).toBe('b');
    expect(deOutro).toEqual([]);
  });

  it('mais de um gatilho aceita o evento: o fluxo roda uma vez, pelo mais específico', async () => {
    const flow = fluxo([
      no('qualquer', 'trigger_solicitation_created', {}),
      no('do-form', 'trigger_solicitation_created', { formId: 'form-1' }),
    ]);

    const entries = await buscar([flow]).findActiveFlowEntries('trigger_solicitation_created', {
      formId: 'form-1',
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].entryNode.id).toBe('do-form');
  });

  it('SLA: o gatilho do prazo geral não recebe o prazo da fase, e vice-versa; fase filtrada confere', async () => {
    const flow = fluxo([
      no('geral', 'trigger_sla_breached'),
      no('qualquer-fase', 'trigger_sla_breached', { slaScope: 'phase' }),
      no('cotacao', 'trigger_sla_breached', { slaScope: 'phase', phaseId: 'ph-cot' }),
    ]);
    const service = buscar([flow]);

    const [geral] = await service.findActiveFlowEntries('trigger_sla_breached', { formId: 'form-1' });
    const [daCotacao] = await service.findActiveFlowEntries('trigger_sla_breached', {
      formId: 'form-1',
      slaScope: 'phase',
      phaseId: 'ph-cot',
    });
    const [deOutraFase] = await service.findActiveFlowEntries('trigger_sla_breached', {
      formId: 'form-1',
      slaScope: 'phase',
      phaseId: 'ph-compra',
    });

    expect(geral.entryNode.id).toBe('geral');
    expect(daCotacao.entryNode.id).toBe('cotacao');
    expect(deOutraFase.entryNode.id).toBe('qualquer-fase');
  });

  it('empate fica com o gatilho que vem primeiro', async () => {
    const flow = fluxo([no('primeiro', 'trigger_sla_breached'), no('segundo', 'trigger_sla_breached')]);

    const [entry] = await buscar([flow]).findActiveFlowEntries('trigger_sla_breached', {
      formId: 'form-1',
    });

    expect(entry.entryNode.id).toBe('primeiro');
  });

  it('evento sem formulário só entra por gatilho sem formulário', async () => {
    const flow = fluxo([
      no('do-form', 'trigger_approval_completed', { formId: 'form-1' }),
      no('global', 'trigger_approval_completed'),
    ]);

    const [entry] = await buscar([flow]).findActiveFlowEntries('trigger_approval_completed', {
      formId: null,
    });

    expect(entry.entryNode.id).toBe('global');
  });

  it('filtra a origem da solicitação criada: a criada por fluxo não reentra pelo começo', async () => {
    const flow = fluxo([
      no('envio', 'trigger_solicitation_created', {
        formId: 'form-1',
        originTypes: ['form_submission'],
      }),
    ]);
    const service = buscar([flow]);

    const doFormulario = await service.findActiveFlowEntries('trigger_solicitation_created', {
      formId: 'form-1',
      originType: 'form_submission',
    });
    const doFluxo = await service.findActiveFlowEntries('trigger_solicitation_created', {
      formId: 'form-1',
      originType: 'webhook',
    });

    expect(doFormulario).toHaveLength(1);
    expect(doFluxo).toEqual([]);
  });

  it('filtra a fase salva em cada gatilho', async () => {
    const flow = fluxo([
      no('logistica', 'trigger_phase_field_saved', { formId: 'form-1', phaseId: 'fase-log' }),
      no('financeiro', 'trigger_phase_field_saved', { formId: 'form-1', phaseId: 'fase-fin' }),
    ]);
    const service = buscar([flow]);

    const [fin] = await service.findActiveFlowEntries('trigger_phase_field_saved', {
      formId: 'form-1',
      phaseId: 'fase-fin',
    });
    const outra = await service.findActiveFlowEntries('trigger_phase_field_saved', {
      formId: 'form-1',
      phaseId: 'fase-x',
    });

    expect(fin.entryNode.id).toBe('financeiro');
    expect(outra).toEqual([]);
  });

  it('webhook: cada gatilho confere o próprio endpoint; sem endpoint, vale a regra antiga', async () => {
    const comForm = fluxo(
      [no('a', 'trigger_webhook_received', { endpointId: 'ep-a' }), no('livre', 'trigger_webhook_received')],
      { id: 'com-form', formId: 'form-1' },
    );
    const semForm = fluxo([no('livre', 'trigger_webhook_received')], { id: 'sem-form' });
    const service = buscar([comForm, semForm]);

    const doA = await service.findActiveFlowEntries('trigger_webhook_received', {
      formId: null,
      endpointId: 'ep-a',
    });
    const deOutro = await service.findActiveFlowEntries('trigger_webhook_received', {
      formId: null,
      endpointId: 'ep-z',
    });

    expect(doA.map((e) => [e.flow.id, e.entryNode.id])).toEqual([
      ['com-form', 'a'],
      ['sem-form', 'livre'],
    ]);
    // Sem endpoint escolhido, um fluxo com formulário não aceita qualquer endpoint.
    expect(deOutro.map((e) => e.flow.id)).toEqual(['sem-form']);
  });

  it('"Entrou na fase" filtra pela fase de destino e, se pedir, pela de origem', async () => {
    const qualquer = fluxo([no('t', 'trigger_phase_entered', {})], { id: 'qualquer', formId: 'form-1' });
    const naAprovacao = fluxo([no('t', 'trigger_phase_entered', { phaseId: 'aprov' })], {
      id: 'na-aprovacao',
      formId: 'form-1',
    });
    const daTriagem = fluxo(
      [no('t', 'trigger_phase_entered', { phaseId: 'aprov', fromPhaseId: 'triagem' })],
      { id: 'da-triagem', formId: 'form-1' },
    );
    const service = buscar([qualquer, naAprovacao, daTriagem]);

    const vindoDaTriagem = await service.findActiveFlowEntries('trigger_phase_entered', {
      formId: 'form-1',
      phaseId: 'aprov',
      fromPhaseId: 'triagem',
    });
    const devolvido = await service.findActiveFlowEntries('trigger_phase_entered', {
      formId: 'form-1',
      phaseId: 'aprov',
      fromPhaseId: 'compra',
    });
    const outraFase = await service.findActiveFlowEntries('trigger_phase_entered', {
      formId: 'form-1',
      phaseId: 'compra',
    });

    expect(vindoDaTriagem.map((e) => e.flow.id)).toEqual(['qualquer', 'na-aprovacao', 'da-triagem']);
    expect(devolvido.map((e) => e.flow.id)).toEqual(['qualquer', 'na-aprovacao']);
    expect(outraFase.map((e) => e.flow.id)).toEqual(['qualquer']);
  });

  it('"Aprovação concluída" com fase só aceita aprovação daquela fase', async () => {
    const daFase = fluxo([no('t', 'trigger_approval_completed', { phaseId: 'aprov' })], {
      id: 'da-fase',
      formId: 'form-1',
    });
    const service = buscar([daFase]);

    await expect(
      service.findActiveFlowEntries('trigger_approval_completed', { formId: 'form-1', phaseId: 'aprov' }),
    ).resolves.toHaveLength(1);
    await expect(
      service.findActiveFlowEntries('trigger_approval_completed', { formId: 'form-1', phaseId: 'outra' }),
    ).resolves.toHaveLength(0);
    await expect(
      service.findActiveFlowEntries('trigger_approval_completed', { formId: 'form-1' }),
    ).resolves.toHaveLength(0);
  });
});

describe('FlowsService — execução pela entrada certa', () => {
  function montar(flow: FlowEntity, engineResults: unknown[] = []) {
    const flowsRepo = {
      findOne: jest.fn().mockResolvedValue(flow),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const executionsRepo = {
      findOne: jest.fn(),
      create: jest.fn((data: object) => data),
      save: jest.fn().mockResolvedValue({ id: 'execution-id' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const engine = { execute: jest.fn().mockResolvedValue(engineResults) };
    const metricsService = { recordFlowExecution: jest.fn() };
    const service = novoServico({ flowsRepo, executionsRepo, engine, metricsService });
    return { service, flowsRepo, engine };
  }

  const job = (overrides: Record<string, unknown> = {}) =>
    ({
      kind: 'flow_context',
      flowId: 'flow-id',
      triggerType: 'trigger_webhook_received',
      eventName: 'webhooks.received',
      metadata: { payload: '123', item: '123' },
      emittedAt: new Date().toISOString(),
      ...overrides,
    }) as never;

  it('o job leva o gatilho de entrada até o motor', async () => {
    const flow = fluxo([
      no('envio', 'trigger_solicitation_created'),
      no('lote', 'trigger_webhook_received', { endpointId: 'ep-1' }),
    ]);
    const { service, engine } = montar(flow);

    await service.executeContextJob(job({ entryNodeId: 'lote' }));

    expect(engine.execute).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({ entryNodeId: 'lote', metadata: { payload: '123', item: '123' } }),
    );
  });

  it('gatilho removido depois de o evento chegar: não executa por outro', async () => {
    const flow = fluxo([no('outro', 'trigger_webhook_received', { endpointId: 'ep-1' })]);
    const { service, engine } = montar(flow);

    await service.executeContextJob(job({ entryNodeId: 'lote' }));

    expect(engine.execute).not.toHaveBeenCalled();
  });

  it('job antigo, sem entryNodeId, entra pelo primeiro gatilho do tipo', async () => {
    const flow = fluxo([
      no('envio', 'trigger_solicitation_created'),
      no('lote', 'trigger_webhook_received', { endpointId: 'ep-1' }),
    ]);
    const { service, engine } = montar(flow);

    await service.executeContextJob(job());

    expect(engine.execute).toHaveBeenCalledWith(flow, expect.objectContaining({ entryNodeId: 'lote' }));
  });

  it('falha de outra entrada não conta para a saúde do gatilho agendado', async () => {
    const flow = fluxo([
      no('agenda', 'trigger_scheduled', { mode: 'interval', intervalValue: 1, intervalUnit: 'hours' }),
      no('lote', 'trigger_webhook_received', { endpointId: 'ep-1' }),
    ]);
    const { service, flowsRepo } = montar(flow, [
      { nodeId: 'x', status: 'failed', error: 'erro', durationMs: 1 },
    ]);

    await service.executeFlowWithContext(flow, { eventName: 'webhooks.received', entryNodeId: 'lote' });
    expect(flowsRepo.update).not.toHaveBeenCalled();

    await service.executeFlowWithContext(flow, {
      eventName: 'flows.scheduled.tick',
      entryNodeId: 'agenda',
    });
    expect(flowsRepo.update).toHaveBeenCalledWith('flow-id', { consecutiveFailureCount: 1 });
  });

  it('respostas dadas pelo fluxo ao criar a solicitação chegam a ctx.fields; a do formulário ganha', async () => {
    const flow = fluxo([no('lote', 'trigger_webhook_received', { endpointId: 'ep-1' })]);
    const { service, engine } = montar(flow);

    await service.executeFlowWithContext(flow, {
      eventName: 'approvals.resume',
      solicitation: {
        id: 'sol-1',
        metadata: { formFieldValues: { pedido: '123', motivo: 'do_fluxo' }, outro: 'x' },
      } as never,
      fields: { motivo: 'cliente_desistiu' },
    });

    expect(engine.execute).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({ fields: { pedido: '123', motivo: 'cliente_desistiu' } }),
    );
  });
});

describe('FlowsService.runTest — escolha da entrada', () => {
  function servicoCom(nodes: ReturnType<typeof no>[], formsRepo: object = {}) {
    const flowsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flow-id',
        createdBy: 'user-1',
        formId: null,
        form: null,
        nodes,
        edges: [],
      }),
    };
    const engine = { execute: jest.fn().mockResolvedValue([]) };
    return { service: novoServico({ flowsRepo, formsRepo, engine }), engine };
  }

  it('entra pelo gatilho escolhido e usa o formulário dele', async () => {
    const formsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'form-2', name: 'Cancelamento' }) };
    const { service, engine } = servicoCom(
      [
        no('envio', 'trigger_form_submit', { formId: 'form-1' }),
        no('fase', 'trigger_phase_field_saved', { formId: 'form-2' }),
      ],
      formsRepo,
    );

    await service.runTest('flow-id', 'user-1', { entryNodeId: 'fase' }, 'admin');

    expect(formsRepo.findOne).toHaveBeenCalledWith({ where: { id: 'form-2' } });
    expect(engine.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entryNodeId: 'fase' }),
    );
  });

  it('rejeita entrada que não é gatilho do fluxo', async () => {
    const { service } = servicoCom([no('envio', 'trigger_form_submit'), no('acao', 'condition_always_true')]);

    await expect(
      service.runTest('flow-id', 'user-1', { entryNodeId: 'acao' }, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
