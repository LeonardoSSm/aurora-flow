import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannelId } from '../domain/notification.types';
import { NOTIFICATION_CHANNELS_TOKEN, type NotificationChannel } from './notification-channel';

@Injectable()
export class NotificationChannelRegistry {
  private readonly byId = new Map<NotificationChannelId, NotificationChannel>();

  constructor(@Inject(NOTIFICATION_CHANNELS_TOKEN) channels: NotificationChannel[]) {
    for (const channel of channels) this.byId.set(channel.id, channel);
  }

  has(id: string): id is NotificationChannelId {
    return this.byId.has(id as NotificationChannelId);
  }

  get(id: NotificationChannelId): NotificationChannel {
    const channel = this.byId.get(id);
    if (!channel) throw new Error(`Canal de notificação não registrado: ${id}`);
    return channel;
  }

  list(): NotificationChannel[] {
    return [...this.byId.values()];
  }
}
