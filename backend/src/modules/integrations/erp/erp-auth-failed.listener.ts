import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { ExpoPushService } from '../../notifications/expo-push.service';
import type { ErpAuthFailedEvent } from './erp-auth-failed.event';

const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // 1h — avoid spamming admins while a connector stays broken

@Injectable()
export class ErpAuthFailedListener {
  private readonly logger = new Logger(ErpAuthFailedListener.name);
  private readonly lastNotifiedAt = new Map<string, number>();

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepo: Repository<NotificationEntity>,
    private readonly expoPushService: ExpoPushService,
  ) {}

  @OnEvent('erp.auth.failed')
  async handleErpAuthFailed(event: ErpAuthFailedEvent): Promise<void> {
    const lastNotified = this.lastNotifiedAt.get(event.connectorId);
    if (lastNotified && Date.now() - lastNotified < NOTIFY_COOLDOWN_MS) {
      return;
    }
    this.lastNotifiedAt.set(event.connectorId, Date.now());

    try {
      const admins = await this.usersRepo.find({
        where: { role: 'admin', isActive: true },
        select: ['id'],
      });

      if (admins.length === 0) return;

      const adminIds = admins.map((u) => u.id);
      const message = `Conector ERP "${event.connectorName}" retornou 401. Atualize o token em Administração → ERP.`;

      await this.expoPushService.sendToUsers(adminIds, {
        title: '🔑 ERP: credencial inválida',
        body: message,
        data: { connectorId: event.connectorId, connectorName: event.connectorName },
      });

      const notifications = adminIds.map((userId) =>
        this.notificationsRepo.create({ userId, message, isRead: false }),
      );
      await this.notificationsRepo.save(notifications);
    } catch (err) {
      this.logger.error(
        { connectorId: event.connectorId, error: err instanceof Error ? err.message : String(err) },
        'Falha ao processar evento erp.auth.failed',
      );
    }
  }
}
