import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsService } from './notifications.service';

const BATCH_SIZE = 50;
/** Teto de lotes por ciclo — o que sobrar fica para o próximo (evita monopolizar o processo). */
const MAX_BATCHES_PER_TICK = 5;

/**
 * Worker periódico da caixa de saída: envia o que ficou `pending`/`scheduled` e venceu —
 * retentativas, atrasos e notificações em modo “background”. Roda em qualquer instância do backend;
 * a reivindicação com `SKIP LOCKED` evita envio em dobro. Desligável com
 * `NOTIFICATIONS_WORKER_ENABLED=false` (ex.: testes, ou para dedicar uma instância).
 */
@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private isProcessing = false;

  constructor(
    private readonly dispatcher: NotificationDispatcherService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    if (!this.isEnabled() || this.isProcessing) return;
    this.isProcessing = true;
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
        const processed = await this.dispatcher.processDue(BATCH_SIZE);
        if (processed < BATCH_SIZE) break;
      }
    } catch (error) {
      this.logger.error(
        `Notification worker failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /** Expurgo diário por retenção (NOTIFICATIONS_RETENTION_DAYS, padrão 90 dias). */
  @Cron('0 30 3 * * *')
  async purge(): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.notifications.purgeExpired();
    } catch (error) {
      this.logger.error(
        `Notification purge failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isEnabled(): boolean {
    return this.config.get<string>('NOTIFICATIONS_WORKER_ENABLED', 'true') !== 'false';
  }
}
