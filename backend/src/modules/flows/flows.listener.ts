import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { ResponseSubmittedEvent } from '../../common/events/response-events';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowSubmissionJob } from './flows.queue';
import { FlowsService } from './flows.service';

@Injectable()
export class FlowsListener {
  private readonly logger = new Logger(FlowsListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
  ) {}

  @OnEvent('responses.submitted')
  async handleResponseSubmitted(event: ResponseSubmittedEvent): Promise<void> {
    const queue = this.getQueueName();
    const job: FlowSubmissionJob = {
      submissionId: event.submissionId,
      formId: event.formId,
      formVersionId: event.formVersionId,
      emittedAt: new Date().toISOString(),
    };

    try {
      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: event.submissionId,
        headers: {
          event: event.name,
        },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) return;

      this.logger.warn(
        { submissionId: event.submissionId, eventName: event.name },
        'RabbitMQ unavailable — executing flows inline',
      );
      await this.flowsService.executeForSubmission(event.submissionId);
    } catch (err) {
      this.logger.error(
        {
          submissionId: event.submissionId,
          eventName: event.name,
          error: err instanceof Error ? err.message : String(err),
        },
        'Flow execution failed for submission',
      );
    }
  }

  private getQueueName(): string {
    return this.configService.get<string>(
      'RABBITMQ_FLOW_SUBMISSION_QUEUE',
      DEFAULT_FLOW_SUBMISSION_QUEUE,
    );
  }
}
