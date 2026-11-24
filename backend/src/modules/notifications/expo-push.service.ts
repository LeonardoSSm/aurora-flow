import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Expo, { type ExpoPushMessage } from 'expo-server-sdk';
import { PushTokenEntity } from '../../database/entities/push-token.entity';

/** Mesmo id de `setNotificationChannelAsync` em mobile/src/utils/notifications.ts. */
export const ANDROID_CHANNEL_ID = 'default';

export type PushNotificationDto = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
};

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly expo = new Expo();

  constructor(
    @InjectRepository(PushTokenEntity)
    private readonly pushTokenRepo: Repository<PushTokenEntity>,
  ) {}

  async sendToUser(userId: string, notification: PushNotificationDto): Promise<void> {
    const tokens = await this.pushTokenRepo.find({
      where: { userId, isActive: true },
      select: ['id', 'token'],
    });

    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: notification.sound !== undefined ? notification.sound : 'default',
        badge: notification.badge,
        // Canal que o app cria com importância máxima ("Tijuca Flow"). Sem ele o Android usa o
        // canal genérico do Firebase: chega na gaveta, mas sem banner no topo nem vibração.
        channelId: ANDROID_CHANNEL_ID,
        priority: 'high',
      }));

    if (messages.length === 0) return;

    this.logger.log(`Push enviado para ${messages.length} token(s) do usuário ${userId}`);

    // Dev emulator mock: log and skip real Expo API call
    const mockMessages = messages.filter((m) => (m.to as string).includes('MOCK-EMULATOR'));
    if (mockMessages.length > 0) {
      for (const m of mockMessages) {
        this.logger.log(
          `[MOCK PUSH] to=${m.to} title="${m.title}" body="${m.body}" data=${JSON.stringify(m.data)}`,
        );
      }
    }
    const realMessages = messages.filter((m) => !(m.to as string).includes('MOCK-EMULATOR'));
    if (realMessages.length === 0) return;

    try {
      const chunks = this.expo.chunkPushNotifications(realMessages);
      const tokenByPushToken = new Map(tokens.map((t) => [t.token, t.id]));

      for (const chunk of chunks) {
        try {
          const tickets = await this.expo.sendPushNotificationsAsync(chunk);

          for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (ticket.status === 'error') {
              const pushToken = (chunk[i] as { to: string }).to;
              this.logger.warn(
                { pushToken, error: ticket.message, details: ticket.details },
                'Push ticket error',
              );
              if (ticket.details?.error === 'DeviceNotRegistered') {
                const tokenId = tokenByPushToken.get(pushToken);
                if (tokenId) {
                  await this.pushTokenRepo.update(tokenId, { isActive: false });
                }
              }
            }
          }
        } catch (chunkErr) {
          this.logger.error({ err: chunkErr }, 'Failed to send push chunk');
        }
      }
    } catch (err) {
      this.logger.error({ err, userId }, 'Unexpected error sending push notifications');
    }
  }

  async sendToUsers(userIds: string[], notification: PushNotificationDto): Promise<void> {
    await Promise.allSettled(userIds.map((uid) => this.sendToUser(uid, notification)));
  }
}
