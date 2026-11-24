import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMqService } from '../../queue/rabbitmq.service';
import { ErpConnectorService } from './erp-connector.service';
import { ERP_RETRY_QUEUE, type ErpRetryJob } from './erp.queue';

@Injectable()
export class ErpRetryConsumer implements OnModuleInit {
  private readonly logger = new Logger(ErpRetryConsumer.name);

  constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly erpConnectorService: ErpConnectorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMqService.consumeJson<ErpRetryJob>(
      ERP_RETRY_QUEUE,
      async (job) => {
        if (!job?.logId) throw new Error('ERP retry job sem logId.');
        await this.erpConnectorService.retryOperation(job.logId);
      },
      { prefetch: 2 },
    );
    this.logger.log(`ERP retry consumer registrado em ${ERP_RETRY_QUEUE}.`);
  }
}
