import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { FlowEntity } from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { computeNextRunAt } from './lib/compute-next-run';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowContextJob } from './flows.queue';
import { FlowsService } from './flows.service';
import type { FlowExecutionContext, TriggerScheduledData } from './types/flow.types';

/** Máximo de fluxos devidos processados por ciclo do poller — evita starvation e picos de carga. */
const MAX_SCHEDULED_FLOWS_PER_TICK = 50;

@Injectable()
export class FlowsScheduledTriggerService {
  private readonly logger = new Logger(FlowsScheduledTriggerService.name);
  // Guarda de sobreposição: o poller roda a cada minuto; se o ciclo anterior ainda estiver
  // rodando (lote grande / RabbitMQ lento), pula em vez de empilhar execuções.
  private isProcessing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(FlowEntity)
    private readonly flowsRepo: Repository<FlowEntity>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollDueFlows(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const now = new Date();
      const dueFlows = await this.flowsRepo
        .createQueryBuilder('flow')
        .where('flow.is_active = true')
        .andWhere('flow.next_run_at IS NOT NULL')
        .andWhere('flow.next_run_at <= :now', { now })
        .orderBy('flow.next_run_at', 'ASC')
        .take(MAX_SCHEDULED_FLOWS_PER_TICK)
        .getMany();

      for (const flow of dueFlows) {
        await this.processFlow(flow, now);
      }
    } catch (err) {
      this.logger.error(`Scheduled-trigger poll failed: ${this.errorMessage(err)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processFlow(flow: FlowEntity, now: Date): Promise<void> {
    const trigger = flow.nodes.find((n) => n.type === 'trigger_scheduled');
    if (!trigger) return; // next_run_at desatualizado (gatilho removido/trocado desde o último cálculo)

    let nextRunAt: Date | null;
    try {
      nextRunAt = computeNextRunAt(trigger.data as TriggerScheduledData, now);
    } catch (err) {
      this.logger.error(
        `Fluxo ${flow.id}: configuração de agendamento inválida, parando de reagendar. ${this.errorMessage(err)}`,
      );
      await this.flowsRepo.update(flow.id, { nextRunAt: null });
      return;
    }

    // Grava next_run_at/last_run_at ANTES de despachar — assim uma execução lenta não é pega de
    // novo no mesmo ciclo (ou por um ciclo concorrente).
    await this.flowsRepo.update(flow.id, { lastRunAt: now, nextRunAt });

    const eventName = 'flows.scheduled.tick';
    const metadata = { scheduledAt: now.toISOString() };
    const job: FlowContextJob = {
      kind: 'flow_context',
      flowId: flow.id,
      triggerType: 'trigger_scheduled',
      entryNodeId: trigger.id,
      eventName,
      metadata,
      emittedAt: now.toISOString(),
    };

    const queued = await this.rabbitMqService.publishJson(this.getQueueName(), job, {
      messageId: `${eventName}:${flow.id}:${now.toISOString()}`,
      headers: { event: eventName, flowId: flow.id },
      expiration: String(24 * 60 * 60 * 1000),
    });
    if (queued) return;

    this.logger.warn(`RabbitMQ unavailable. Executing flow ${flow.id} inline for scheduled tick.`);
    const context: FlowExecutionContext = { eventName, metadata, entryNodeId: trigger.id };
    await this.flowsService.executeFlowWithContext(flow, context);
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
