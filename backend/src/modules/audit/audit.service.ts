import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AuditEventEntity, UserEntity } from '../../database/entities';
import { QueryAuditDto } from './dto/query-audit.dto';

/** Evento como a tela mostra: com o nome de quem fez (null = sistema ou usuário apagado). */
export type AuditEventView = AuditEventEntity & { actorName: string | null };

type AuditInput = {
  actorId?: string | null;
  module: string;
  entity: string;
  entityId: string;
  action: string;
  payload?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly auditRepository: Repository<AuditEventEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async log(entry: AuditInput): Promise<void> {
    const event = this.auditRepository.create({
      actorId: entry.actorId ?? null,
      module: entry.module,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      payload: entry.payload ?? null,
    });
    await this.auditRepository.save(event);
  }

  async findAll(query: QueryAuditDto): Promise<PaginatedResponseDto<AuditEventView>> {
    const { page, limit, module, action, actorId, from, to } = query;
    const skip = (page - 1) * limit;

    const qb = this.auditRepository.createQueryBuilder('audit');

    if (module) {
      qb.andWhere('audit.module = :module', { module });
    }
    if (action) {
      qb.andWhere('audit.action = :action', { action });
    }
    if (actorId) {
      qb.andWhere('audit.actor_id = :actorId', { actorId });
    }
    if (from) {
      qb.andWhere('audit.created_at >= :from', { from: new Date(from) });
    }
    if (to) {
      qb.andWhere('audit.created_at <= :to', { to: new Date(to) });
    }

    qb.orderBy('audit.createdAt', 'DESC').skip(skip).take(limit);

    const [events, total] = await qb.getManyAndCount();
    return PaginatedResponseDto.of(await this.withActorNames(events), total, page, limit);
  }

  private async withActorNames(events: AuditEventEntity[]): Promise<AuditEventView[]> {
    const ids = [...new Set(events.map((e) => e.actorId).filter((id): id is string => !!id))];
    const users = ids.length
      ? await this.usersRepository.find({ where: { id: In(ids) }, select: ['id', 'fullName'] })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return events.map((e) =>
      Object.assign(e, { actorName: e.actorId ? (names.get(e.actorId) ?? null) : null }),
    );
  }

  /** Shorthand for dashboard: get last N events without filters */
  findLatest(limit = 10): Promise<AuditEventEntity[]> {
    return this.auditRepository.find({
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  findLatestByActor(actorId: string, limit = 10): Promise<AuditEventEntity[]> {
    return this.auditRepository.find({
      where: { actorId },
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }
}
