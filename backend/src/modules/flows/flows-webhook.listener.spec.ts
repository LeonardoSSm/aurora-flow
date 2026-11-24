import { WebhookReceivedEvent } from '../../common/events/webhook-events';
import type { FlowEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsWebhookListener } from './flows-webhook.listener';
import { MAX_WEBHOOK_BATCH_ITEMS } from './types/flow.types';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: null,
    nodes: [
      {
        id: 'trigger-id',
        type: 'trigger_webhook_received',
        position: { x: 0, y: 0 },
        data: { endpointId: 'endpoint-id' },
      },
    ],
    edges: [],
    ...overrides,
  } as FlowEntity;
}

/** O que findActiveFlowEntries devolve: o fluxo e o gatilho (por padrão o primeiro) de entrada. */
function entryOf(flow: FlowEntity, entryNodeId = flow.nodes[0].id) {
  return { flow, entryNode: flow.nodes.find((node) => node.id === entryNodeId) };
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

  const listener = new FlowsWebhookListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
  );

  return { listener, rabbitMqService, flowsService };
}

describe('FlowsWebhookListener', () => {
  it('dispara fluxo com trigger_webhook_received correto', async () => {
    const { listener, rabbitMqService, flowsService } = makeListener();
    const flow = makeFlow();

    flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(flow)]);
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleWebhookReceived(
      new WebhookReceivedEvent('event-id', 'endpoint-id', { ok: true }),
    );

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith('trigger_webhook_received', {
      formId: null,
      endpointId: 'endpoint-id',
    });
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_webhook_received',
        entryNodeId: 'trigger-id',
        eventName: 'webhooks.received',
        metadata: {
          endpointId: 'endpoint-id',
          webhookEventId: 'event-id',
          payload: { ok: true },
        },
      }),
      expect.objectContaining({
        messageId: `webhooks.received:event-id:${flow.id}`,
      }),
    );
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('não dispara fluxo configurado para outro endpoint', async () => {
    const { listener, rabbitMqService, flowsService } = makeListener();
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handleWebhookReceived(
      new WebhookReceivedEvent('event-id', 'endpoint-id', { ok: true }),
    );

    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('executa inline quando publishJson retorna false', async () => {
    const { listener, rabbitMqService, flowsService } = makeListener();
    const flow = makeFlow({ nodes: [{ ...makeFlow().nodes[0], data: {} }] });

    flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(flow)]);
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handleWebhookReceived(
      new WebhookReceivedEvent('event-id', 'endpoint-id', { ok: true }),
    );

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        eventName: 'webhooks.received',
        entryNodeId: 'trigger-id',
        metadata: {
          endpointId: 'endpoint-id',
          webhookEventId: 'event-id',
          payload: { ok: true },
        },
      }),
    );
  });

  it('entra pelo gatilho escolhido pelo serviço, não pelo primeiro do fluxo', async () => {
    const { listener, rabbitMqService, flowsService } = makeListener();
    const flow = makeFlow({
      nodes: [
        { id: 'form-entry', type: 'trigger_form_submit', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'webhook-entry',
          type: 'trigger_webhook_received',
          position: { x: 0, y: 0 },
          data: { endpointId: 'endpoint-id' },
        },
      ],
    } as never);
    flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(flow, 'webhook-entry')]);
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleWebhookReceived(
      new WebhookReceivedEvent('event-id', 'endpoint-id', { ok: true }),
    );

    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({ entryNodeId: 'webhook-entry' }),
      expect.anything(),
    );
  });

  describe('lote (splitItemsPath)', () => {
    function batchFlow(splitItemsPath: string) {
      return makeFlow({
        nodes: [
          {
            id: 'trigger-id',
            type: 'trigger_webhook_received',
            position: { x: 0, y: 0 },
            data: { endpointId: 'endpoint-id', splitItemsPath },
          },
        ],
      } as never);
    }

    it('publica uma execução por item, com o item como payload e em {{item}}', async () => {
      const { listener, rabbitMqService, flowsService } = makeListener();
      const flow = batchFlow('pedidos');
      const payload = { pedidos: ['123', '456'] };
      flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(flow)]);
      rabbitMqService.publishJson.mockResolvedValue(true);

      await listener.handleWebhookReceived(new WebhookReceivedEvent('event-id', 'endpoint-id', payload));

      expect(rabbitMqService.publishJson).toHaveBeenCalledTimes(2);
      expect(rabbitMqService.publishJson).toHaveBeenNthCalledWith(
        1,
        DEFAULT_FLOW_SUBMISSION_QUEUE,
        expect.objectContaining({
          entryNodeId: 'trigger-id',
          metadata: {
            endpointId: 'endpoint-id',
            webhookEventId: 'event-id',
            payload: '123',
            item: '123',
            itemIndex: 0,
            itemCount: 2,
            batchPayload: payload,
          },
        }),
        // Cada item tem a própria mensagem: a deduplicação do RabbitMQ não junta itens do lote.
        expect.objectContaining({ messageId: `webhooks.received:event-id:${flow.id}:0` }),
      );
      expect(rabbitMqService.publishJson).toHaveBeenNthCalledWith(
        2,
        DEFAULT_FLOW_SUBMISSION_QUEUE,
        expect.objectContaining({
          metadata: expect.objectContaining({ payload: '456', item: '456', itemIndex: 1 }),
        }),
        expect.objectContaining({ messageId: `webhooks.received:event-id:${flow.id}:1` }),
      );
    });

    it('aceita lista enviada como corpo cru (o recebedor a guarda em "value")', async () => {
      const { listener, rabbitMqService, flowsService } = makeListener();
      flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(batchFlow('value'))]);
      rabbitMqService.publishJson.mockResolvedValue(false);

      await listener.handleWebhookReceived(
        new WebhookReceivedEvent('event-id', 'endpoint-id', { value: [{ numero: '9' }] }),
      );

      expect(flowsService.executeFlowWithContext).toHaveBeenCalledTimes(1);
      expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          entryNodeId: 'trigger-id',
          metadata: expect.objectContaining({ payload: { numero: '9' }, itemCount: 1 }),
        }),
      );
    });

    it('não executa quando o caminho do lote não é uma lista', async () => {
      const { listener, rabbitMqService, flowsService } = makeListener();
      flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(batchFlow('pedidos'))]);

      await listener.handleWebhookReceived(
        new WebhookReceivedEvent('event-id', 'endpoint-id', { pedidos: '123' }),
      );

      expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
      expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
    });

    it(`limita o lote a ${MAX_WEBHOOK_BATCH_ITEMS} itens`, async () => {
      const { listener, rabbitMqService, flowsService } = makeListener();
      flowsService.findActiveFlowEntries.mockResolvedValue([entryOf(batchFlow('pedidos'))]);
      rabbitMqService.publishJson.mockResolvedValue(true);
      const pedidos = Array.from({ length: MAX_WEBHOOK_BATCH_ITEMS + 3 }, (_, i) => String(i));

      await listener.handleWebhookReceived(
        new WebhookReceivedEvent('event-id', 'endpoint-id', { pedidos }),
      );

      expect(rabbitMqService.publishJson).toHaveBeenCalledTimes(MAX_WEBHOOK_BATCH_ITEMS);
    });
  });
});
