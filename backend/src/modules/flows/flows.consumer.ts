import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMqService } from '../queue/rabbitmq.service';
import {
  DEFAULT_FLOW_SUBMISSION_QUEUE,
  isFlowContextJob,
  isFlowResumeJob,
  isFlowResumePhaseFieldsJob,
  type FlowQueueJob,
} from './flows.queue';
import { FlowsService } from './flows.service';

@Injectable()
export class FlowsConsumer implements OnModuleInit {
  private readonly logger = new Logger(FlowsConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const queue = this.getQueueName();
    await this.rabbitMqService.consumeJson<FlowQueueJob>(
      queue,
      async (job) => {
        if (isFlowContextJob(job)) {
          await this.flowsService.executeContextJob(job);
          return;
        }

        if (isFlowResumeJob(job)) {
          await this.flowsService.resumePausedExecution(job.executionId, job.approvalId);
          return;
        }

        if (isFlowResumePhaseFieldsJob(job)) {
          await this.flowsService.resumePausedPhaseFieldsExecution(job.executionId, job.metadata);
          return;
        }

        if (!job?.submissionId) {
          throw new Error('Mensagem de fluxo sem submissionId.');
        }
        await this.flowsService.executeForSubmission(job.submissionId);
      },
      { prefetch: this.getPrefetch() },
    );
    this.logger.log(`Flow submission consumer registered on ${queue}.`);
  }

  private getQueueName(): string {
    return this.configService.get<string>(
      'RABBITMQ_FLOW_SUBMISSION_QUEUE',
      DEFAULT_FLOW_SUBMISSION_QUEUE,
    );
  }

  private getPrefetch(): number {
    const value = Number(this.configService.get<string>('RABBITMQ_PREFETCH', '5'));
    return Number.isFinite(value) && value > 0 ? value : 5;
  }
}
