import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { WebhookReceivedEvent } from '../../common/events/webhook-events';
import { resolvePath } from '../../common/utils/dot-path';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowContextJob } from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import {
  MAX_WEBHOOK_BATCH_ITEMS,
  type FlowExecutionContext,
  type FlowTriggerNodeType,
  type TriggerWebhookReceivedData,
} from './types/flow.types';

/** Uma execução a despachar: o metadata dela e o sufixo que a distingue no messageId. */
type WebhookRun = { metadata: Record<string, unknown>; messageSuffix: string };

@Injectable()
export class FlowsWebhookListener {
  private readonly logger = new Logger(FlowsWebhookListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
  ) {}

  @OnEvent('webhooks.received')
  async handleWebhookReceived(event: WebhookReceivedEvent): Promise<void> {
    try {
      const triggerType: FlowTriggerNodeType = 'trigger_webhook_received';
      const entries = await this.flowsService.findActiveFlowEntries(triggerType, {
        formId: null,
        endpointId: event.endpointId,
      });

      await this.dispatchFlows(entries, triggerType, event);
    } catch (err) {
      this.logger.error(
        `Flow webhook listener failed for event ${event.eventId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    triggerType: FlowTriggerNodeType,
    event: WebhookReceivedEvent,
  ): Promise<void> {
    const queue = this.getQueueName();

    for (const { flow, entryNode } of entries) {
      for (const run of this.buildRuns(entryNode.data as TriggerWebhookReceivedData, event, flow.id)) {
        const context: FlowExecutionContext = {
          eventName: event.name,
          entryNodeId: entryNode.id,
          metadata: run.metadata,
        };
        const job: FlowContextJob = {
          kind: 'flow_context',
          flowId: flow.id,
          triggerType,
          entryNodeId: entryNode.id,
          eventName: event.name,
          metadata: run.metadata,
          emittedAt: new Date().toISOString(),
        };

        const queued = await this.rabbitMqService.publishJson(queue, job, {
          messageId: `${event.name}:${event.eventId}:${flow.id}${run.messageSuffix}`,
          headers: { event: event.name, flowId: flow.id },
          expiration: String(24 * 60 * 60 * 1000),
        });
        if (queued) continue;

        this.logger.warn(
          `RabbitMQ unavailable. Executing flow ${flow.id} inline for webhook event ${event.eventId}.`,
        );
        await this.flowsService.executeFlowWithContext(flow, context);
      }
    }
  }

  /**
   * Sem lote, o payload inteiro é uma execução. Com `splitItemsPath`, cada item da lista é uma
   * execução: o item vira `metadata.payload` (os caminhos do resto do fluxo — título, chave de
   * idempotência — leem dele, como na reconciliação do ERP) e `metadata.item` (`{{item}}`, para
   * um item que é só um número). O lote inteiro fica em `metadata.batchPayload`.
   */
  private buildRuns(
    data: TriggerWebhookReceivedData,
    event: WebhookReceivedEvent,
    flowId: string,
  ): WebhookRun[] {
    const base = { endpointId: event.endpointId, webhookEventId: event.eventId };
    const splitPath = data.splitItemsPath?.trim();
    if (!splitPath) {
      return [{ metadata: { ...base, payload: event.payload }, messageSuffix: '' }];
    }

    const items = resolvePath(event.payload ?? {}, splitPath);
    if (!Array.isArray(items)) {
      this.logger.warn(
        `Webhook ${event.eventId}: "${splitPath}" não é uma lista no payload — fluxo ${flowId} não executado.`,
      );
      return [];
    }
    if (items.length > MAX_WEBHOOK_BATCH_ITEMS) {
      this.logger.warn(
        `Webhook ${event.eventId}: lote com ${items.length} itens; só os primeiros ${MAX_WEBHOOK_BATCH_ITEMS} executam o fluxo ${flowId}.`,
      );
    }

    const batch = items.slice(0, MAX_WEBHOOK_BATCH_ITEMS);
    return batch.map((item, index) => ({
      metadata: {
        ...base,
        payload: item,
        item,
        itemIndex: index,
        itemCount: batch.length,
        batchPayload: event.payload,
      },
      messageSuffix: `:${index}`,
    }));
  }

  private getQueueName(): string {
    return this.configService.get<string>(
      'RABBITMQ_FLOW_SUBMISSION_QUEUE',
      DEFAULT_FLOW_SUBMISSION_QUEUE,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
