import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { NotificationEntity } from '../../database/entities';
import type { QueryInboxDto } from './dto/query-inbox.dto';

export interface InboxItem {
  id: string;
  title: string | null;
  message: string;
  /** Caminho interno que o aviso abre; nulo = só texto. */
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

/**
 * Caixa de entrada do usuário (tabela `notifications`). Sempre filtrada pelo usuário
 * autenticado — não existe leitura de caixa alheia.
 */
@Injectable()
export class NotificationInboxService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly inbox: Repository<NotificationEntity>,
  ) {}

  async list(userId: string, query: QueryInboxDto): Promise<PaginatedResponseDto<InboxItem>> {
    const where = query.unreadOnly ? { userId, isRead: false } : { userId };
    const [rows, total] = await this.inbox.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return PaginatedResponseDto.of(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        link: row.link ?? null,
        isRead: row.isRead,
        createdAt: row.createdAt,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.inbox.count({ where: { userId, isRead: false } }) };
  }

  async markRead(userId: string, id: string): Promise<{ read: true }> {
    const result = await this.inbox.update({ id, userId }, { isRead: true });
    if (!result.affected) throw new NotFoundException('Notificação não encontrada.');
    return { read: true };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.inbox.update({ userId, isRead: false }, { isRead: true });
    return { updated: result.affected ?? 0 };
  }
}
