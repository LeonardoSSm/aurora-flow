import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { CHANNEL_LIMITS } from '../domain/notification.limits';
import { NotificationChannelError } from '../domain/notification-errors';
import type {
  ChannelAvailability,
  ChannelRecipient,
  NotificationChannel,
  NotificationDeliveryRequest,
  NotificationDeliveryResult,
  RecipientValidation,
} from './notification-channel';

/**
 * Caixa de entrada dentro do sistema: grava em `notifications` (tabela que já existia) — agora
 * com um leitor de verdade (`GET /notifications/inbox`). É o único canal em que “entregue” é
 * comprovável: a linha existe na caixa do usuário.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly id = 'in_app' as const;
  readonly limits = CHANNEL_LIMITS.in_app;

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly inbox: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  describe(): ChannelAvailability {
    return { available: true, provider: 'in_app' };
  }

  validateRecipient(recipient: ChannelRecipient): RecipientValidation {
    if (!recipient.userId) {
      return {
        valid: false,
        reason: 'Destinatário sem usuário do sistema (a caixa de entrada exige um usuário).',
      };
    }
    return { valid: true, normalizedAddress: null };
  }

  async send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResult> {
    const userId = request.recipient.userId;
    if (!userId) {
      throw new NotificationChannelError('Destinatário sem usuário.', 'invalid_recipient');
    }

    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'isActive'] });
    if (!user?.isActive) {
      throw new NotificationChannelError('Usuário inexistente ou inativo.', 'invalid_recipient');
    }

    const row = await this.inbox.save(
      this.inbox.create({
        userId,
        title: request.title ? request.title.slice(0, this.limits.titleMax) : null,
        message: request.body.slice(0, this.limits.bodyMax),
        link: safeAppLink(request.link),
      }),
    );
    return { status: 'delivered', provider: 'in_app', providerMessageId: row.id };
  }
}

/** Só caminho interno (`/algo`): nada de `//host` ou `https://` — o sino não leva para fora. */
export function safeAppLink(link: string | null | undefined): string | null {
  if (typeof link !== 'string') return null;
  const value = link.trim();
  if (!/^\/(?![/\\])/.test(value) || value.length > 300) return null;
  return value;
}
