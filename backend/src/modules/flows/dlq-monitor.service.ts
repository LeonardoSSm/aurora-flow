import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricsService } from '../observability/metrics.service';

export interface DlqQueueInfo {
  name: string;
  messages: number;
}

@Injectable()
export class DlqMonitorService {
  private readonly logger = new Logger(DlqMonitorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollDlqMetrics(): Promise<void> {
    try {
      const queues = await this.fetchDlqQueues();
      for (const q of queues) {
        this.metricsService.setDlqMessages(q.name, q.messages);
      }
    } catch (error) {
      this.logger.warn(
        `DLQ poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getDlqStatus(): Promise<DlqQueueInfo[]> {
    return this.fetchDlqQueues();
  }

  private async fetchDlqQueues(): Promise<DlqQueueInfo[]> {
    const managementUrl = this.configService.get<string>(
      'RABBITMQ_MANAGEMENT_URL',
      'http://localhost:15672',
    );
    const user = this.configService.get<string>('RABBITMQ_USER', 'formhub');
    const password = this.configService.get<string>('RABBITMQ_PASSWORD', 'formhub');

    const credentials = Buffer.from(`${user}:${password}`).toString('base64');
    const response = await fetch(`${managementUrl}/api/queues`, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`RabbitMQ management API returned ${response.status}`);
    }

    const allQueues = (await response.json()) as Array<{ name: string; messages?: number }>;
    return allQueues
      .filter((q) => q.name.endsWith('.dead'))
      .map((q) => ({ name: q.name, messages: q.messages ?? 0 }));
  }
}
