import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage, Options } from 'amqplib';
import { MetricsService } from '../observability/metrics.service';

type JsonHandler<T> = (payload: T, message: ConsumeMessage) => Promise<void> | void;

type ConsumerRegistration<T = unknown> = {
  queue: string;
  handler: JsonHandler<T>;
  prefetch: number;
  channel?: Channel;
  consumerTag?: string;
};

type PublishJsonOptions = {
  messageId?: string;
  headers?: Record<string, unknown>;
  expiration?: string;
};

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: ChannelModel | null = null;
  private publishChannel: Channel | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isShuttingDown = false;
  private readonly consumers: ConsumerRegistration[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async publishJson<T>(
    queue: string,
    payload: T,
    options: PublishJsonOptions = {},
  ): Promise<boolean> {
    const startedAt = process.hrtime.bigint();
    if (!this.isEnabled()) {
      this.metricsService.observeRabbitMqPublish(
        { queue, result: 'disabled' },
        this.durationSecondsSince(startedAt),
      );
      return false;
    }

    try {
      await this.ensureConnection();
      if (!this.publishChannel) {
        this.metricsService.observeRabbitMqPublish(
          { queue, result: 'failed' },
          this.durationSecondsSince(startedAt),
        );
        return false;
      }

      await this.assertDurableQueue(this.publishChannel, queue);
      const published = this.publishChannel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: 'application/json',
          deliveryMode: 2,
          persistent: true,
          messageId: options.messageId,
          timestamp: Math.floor(Date.now() / 1000),
          headers: options.headers,
          expiration: options.expiration,
        } satisfies Options.Publish,
      );
      this.metricsService.observeRabbitMqPublish(
        { queue, result: published ? 'success' : 'backpressure' },
        this.durationSecondsSince(startedAt),
      );
      return published;
    } catch (error) {
      this.metricsService.observeRabbitMqPublish(
        { queue, result: 'failed' },
        this.durationSecondsSince(startedAt),
      );
      this.logger.warn(`RabbitMQ publish failed on queue ${queue}: ${this.errorMessage(error)}`);
      return false;
    }
  }

  async consumeJson<T>(
    queue: string,
    handler: JsonHandler<T>,
    options: { prefetch?: number } = {},
  ): Promise<void> {
    const registration: ConsumerRegistration<T> = {
      queue,
      handler,
      prefetch: options.prefetch ?? this.getDefaultPrefetch(),
    };
    this.consumers.push(registration as ConsumerRegistration);

    if (!this.isEnabled()) {
      this.logger.warn(`RabbitMQ disabled. Consumer for ${queue} was not started.`);
      return;
    }

    try {
      await this.ensureConnection();
    } catch (error) {
      this.logger.warn(
        `RabbitMQ consumer for ${queue} was not started: ${this.errorMessage(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.connection?.close();
    } catch (error) {
      this.logger.warn(`RabbitMQ close failed: ${this.errorMessage(error)}`);
    } finally {
      this.clearConnectionState();
    }
  }

  private async ensureConnection(): Promise<void> {
    if (this.connection && this.publishChannel) {
      await this.setupConsumers();
      return;
    }
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const connection = await amqp.connect(this.getUrl());
      connection.on('error', (error) => {
        this.logger.warn(`RabbitMQ connection error: ${this.errorMessage(error)}`);
      });
      connection.on('close', () => {
        this.clearConnectionState();
        if (!this.isShuttingDown) {
          this.logger.warn('RabbitMQ connection closed. Reconnecting...');
          this.scheduleReconnect();
        }
      });

      this.connection = connection;
      this.publishChannel = await connection.createChannel();
      await this.setupConsumers();
      this.reconnectAttempts = 0;
      this.metricsService.setRabbitMqConnectionUp(true);
      this.logger.log('RabbitMQ connected.');
    } catch (error) {
      this.clearConnectionState();
      this.scheduleReconnect();
      throw error;
    }
  }

  private async setupConsumers(): Promise<void> {
    if (!this.connection) return;

    for (const registration of this.consumers) {
      if (registration.consumerTag) continue;

      const channel = await this.connection.createChannel();
      await channel.prefetch(registration.prefetch);
      await this.assertDurableQueue(channel, registration.queue);
      const reply = await channel.consume(
        registration.queue,
        (message) => {
          if (!message) return;
          void this.handleMessage(channel, registration, message);
        },
        { noAck: false },
      );
      registration.channel = channel;
      registration.consumerTag = reply.consumerTag;
      this.logger.log(`RabbitMQ consumer started on ${registration.queue}.`);
    }
  }

  private async handleMessage(
    channel: Channel,
    registration: ConsumerRegistration,
    message: ConsumeMessage,
  ): Promise<void> {
    const startedAt = process.hrtime.bigint();
    try {
      const payload = JSON.parse(message.content.toString('utf8')) as unknown;
      await registration.handler(payload, message);
      this.metricsService.observeRabbitMqMessage(
        { queue: registration.queue, result: 'success' },
        this.durationSecondsSince(startedAt),
      );
      channel.ack(message);
    } catch (error) {
      this.metricsService.observeRabbitMqMessage(
        { queue: registration.queue, result: 'failed' },
        this.durationSecondsSince(startedAt),
      );
      this.logger.error(
        `RabbitMQ message failed on queue ${registration.queue}: ${this.errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      const headers = message.properties.headers as Record<string, unknown> | null | undefined;
      const retryCount = Number(headers?.['x-retry-count'] ?? 0);
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        const body = message.content.toString('utf8');
        setTimeout(() => {
          void this.publishJson(registration.queue, JSON.parse(body) as unknown, {
            messageId: message.properties.messageId as string | undefined,
            headers: { ...(headers ?? {}), 'x-retry-count': retryCount + 1 },
          });
        }, delay);
        channel.ack(message);
      } else {
        channel.nack(message, false, false);
      }
    }
  }

  private async assertDurableQueue(channel: Channel, queue: string): Promise<void> {
    const deadLetterQueue = `${queue}.dead`;
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': deadLetterQueue,
        'x-message-ttl': 86_400_000, // 24h — mensagens não processadas expiram
        'x-max-length': 10_000, // limite de 10k mensagens na fila
        'x-overflow': 'drop-head', // ao atingir o limite, descarta as mais antigas
      },
    });
  }

  private clearConnectionState(): void {
    this.connection = null;
    this.publishChannel = null;
    this.metricsService.setRabbitMqConnectionUp(false);
    for (const registration of this.consumers) {
      registration.channel = undefined;
      registration.consumerTag = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (!this.isEnabled() || this.isShuttingDown || this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnection().catch((error) => {
        this.logger.warn(`RabbitMQ reconnect failed: ${this.errorMessage(error)}`);
      });
    }, delay);
    this.reconnectTimer.unref();
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('RABBITMQ_ENABLED', 'true') !== 'false';
  }

  private getUrl(): string {
    return this.configService.get<string>('RABBITMQ_URL', 'amqp://formhub:formhub@localhost:5672');
  }

  private getDefaultPrefetch(): number {
    const value = Number(this.configService.get<string>('RABBITMQ_PREFETCH', '5'));
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private durationSecondsSince(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
