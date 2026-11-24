import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, QueryFailedError, Repository } from 'typeorm';
import {
  NotificationMessageEntity,
  NotificationRecipientEntity,
} from '../../database/entities';
import { MetricsService } from '../observability/metrics.service';
import { NotificationChannelRegistry } from './channels/notification-channel.registry';
import {
  DEFAULT_MAX_RECIPIENTS_PER_FLOW_PER_HOUR,
  DEFAULT_MAX_RECIPIENTS_PER_NOTIFICATION,
} from './domain/notification.limits';
import { normalizeRetryPolicy, type NotificationRetryPolicy } from './domain/notification-retry';
import { deriveMessageStatus, isTerminalMessageStatus } from './domain/notification-state';
import {
  NOTIFICATION_PRIORITY_RANK,
  type NotificationChannelId,
  type NotificationErrorCategory,
  type NotificationMessageStatus,
  type NotificationPriority,
  type NotificationRecipientSource,
  type NotificationRecipientStatus,
} from './domain/notification.types';
import { NotificationDispatcherService } from './notification-dispatcher.service';

/** Entrada inválida (sem destinatário, excesso de destinatários, conteúdo vazio). */
export class NotificationValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'no_recipients' | 'too_many_recipients' | 'empty_content' | 'unknown_channel',
  ) {
    super(message);
    this.name = 'NotificationValidationError';
  }
}

/** Limite de envio por fluxo/hora atingido. */
export class NotificationRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationRateLimitError';
  }
}

export interface ResolvedRecipient {
  source: NotificationRecipientSource;
  userId?: string | null;
  displayName?: string | null;
  address?: string | null;
  /** Se preenchido, o destinatário não pôde ser resolvido: vira uma linha `failed` rastreável. */
  unresolvedReason?: string | null;
}

export interface EnqueueNotificationInput {
  channel: NotificationChannelId;
  title: string | null;
  body: string;
  /**
   * HTML pronto para o e-mail (ex.: aviso de pontuação). Só para conteúdo montado pelo sistema com
   * tudo escapado — o nó "Notificação" dos fluxos nunca passa isto. Fica em `metadata.html`.
   */
  html?: string | null;
  priority?: NotificationPriority;
  recipients: ResolvedRecipient[];
  /** Primeira tentativa no futuro (atraso do nó). */
  scheduledFor?: Date | null;
  retryPolicy?: Partial<NotificationRetryPolicy> | null;
  /** Mesma chave ⇒ mesma notificação (idempotência). */
  idempotencyKey?: string | null;
  origin?: {
    flowId?: string | null;
    flowExecutionId?: string | null;
    nodeId?: string | null;
    solicitationId?: string | null;
  };
  metadata?: Record<string, unknown>;
}

export interface EnqueueResult {
  message: NotificationMessageEntity;
  recipients: NotificationRecipientEntity[];
  /** `false` = já existia uma notificação com esta chave de idempotência. */
  created: boolean;
}

export interface NotificationSummary {
  notificationId: string;
  channel: NotificationChannelId;
  status: NotificationMessageStatus;
  counts: Record<NotificationRecipientStatus, number> & { total: number };
  /** Destinatários que falharam de forma transitória e têm nova tentativa agendada. */
  retryScheduled: number;
  /** Falhas finais agrupadas por categoria. */
  errors: Array<{ category: NotificationErrorCategory; count: number }>;
}

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(NotificationMessageEntity)
    private readonly messages: Repository<NotificationMessageEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipients: Repository<NotificationRecipientEntity>,
    private readonly registry: NotificationChannelRegistry,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Persiste a notificação e seus destinatários (a “caixa de saída”). **Não envia** — quem envia é
   * o despacho imediato (`dispatch`) ou o worker. Idempotente por `idempotencyKey`.
   */
  async enqueue(input: EnqueueNotificationInput): Promise<EnqueueResult> {
    if (!this.registry.has(input.channel)) {
      throw new NotificationValidationError(`Canal desconhecido: ${input.channel}`, 'unknown_channel');
    }
    const channel = this.registry.get(input.channel);

    if (!input.body?.trim()) {
      throw new NotificationValidationError('O conteúdo da notificação está vazio.', 'empty_content');
    }
    if (input.recipients.length === 0) {
      throw new NotificationValidationError('Nenhum destinatário informado.', 'no_recipients');
    }
    const maxRecipients = this.maxRecipientsPerNotification();
    if (input.recipients.length > maxRecipients) {
      throw new NotificationValidationError(
        `Destinatários demais (${input.recipients.length}); o limite por notificação é ${maxRecipients}.`,
        'too_many_recipients',
      );
    }

    // Idempotência primeiro: reprocessar não conta contra o limite nem cria nada.
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return { ...existing, created: false };
    }

    await this.assertFlowRateLimit(input.origin?.flowId ?? null, input.recipients.length);

    const now = new Date();
    const policy = normalizeRetryPolicy(input.retryPolicy);
    const priority = input.priority ?? 'normal';
    const scheduledFuture = Boolean(input.scheduledFor && input.scheduledFor.getTime() > now.getTime());
    const firstAttemptAt = scheduledFuture ? (input.scheduledFor as Date) : now;

    const seen = new Set<string>();
    const recipientRows: Array<Partial<NotificationRecipientEntity>> = [];
    input.recipients.forEach((recipient, index) => {
      const validation = recipient.unresolvedReason
        ? { valid: false as const, reason: recipient.unresolvedReason, normalizedAddress: null }
        : channel.validateRecipient({
            userId: recipient.userId ?? null,
            displayName: recipient.displayName ?? null,
            address: recipient.address ?? null,
          });

      const key = validation.valid
        ? (recipient.userId ?? validation.normalizedAddress ?? `row:${index}`)
        : `unresolved:${recipient.source}:${index}`;
      if (seen.has(key)) return; // mesmo usuário/endereço por duas fontes: um só envio
      seen.add(key);

      const base = {
        userId: recipient.userId ?? null,
        source: recipient.source,
        displayName: recipient.displayName?.slice(0, 150) ?? null,
        recipientKey: key.slice(0, 255),
        priorityRank: NOTIFICATION_PRIORITY_RANK[priority],
        attemptCount: 0,
        nextAttemptAt: firstAttemptAt,
      };
      if (!validation.valid) {
        recipientRows.push({
          ...base,
          address: recipient.address ? recipient.address.slice(0, 255) : null,
          status: 'failed',
          nextAttemptAt: now,
          lastErrorCategory: 'invalid_recipient',
          lastError: (validation.reason ?? 'Destinatário inválido.').slice(0, 500),
          failedAt: now,
        });
        return;
      }
      recipientRows.push({
        ...base,
        address: validation.normalizedAddress ?? null,
        status: scheduledFuture ? 'scheduled' : 'pending',
      });
    });

    const status = deriveMessageStatus(recipientRows.map((r) => r.status as NotificationRecipientStatus));
    const terminal = isTerminalMessageStatus(status);

    let saved: { message: NotificationMessageEntity; recipients: NotificationRecipientEntity[] };
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const message = await manager.save(
          NotificationMessageEntity,
          manager.create(NotificationMessageEntity, {
            channel: input.channel,
            status,
            priority,
            title: input.title ? input.title.slice(0, channel.limits.titleMax) : null,
            body: input.body,
            scheduledFor: scheduledFuture ? firstAttemptAt : null,
            maxAttempts: policy.maxAttempts,
            backoffSeconds: policy.backoffSeconds,
            idempotencyKey: input.idempotencyKey ?? null,
            flowId: input.origin?.flowId ?? null,
            flowExecutionId: input.origin?.flowExecutionId ?? null,
            nodeId: input.origin?.nodeId ?? null,
            solicitationId: input.origin?.solicitationId ?? null,
            metadata: { ...(input.metadata ?? {}), ...(input.html ? { html: input.html } : {}) },
            completedAt: terminal ? now : null,
          }),
        );
        const rows = await manager.save(
          NotificationRecipientEntity,
          recipientRows.map((row) =>
            manager.create(NotificationRecipientEntity, { ...row, notificationId: message.id }),
          ),
        );
        return { message, recipients: rows };
      });
    } catch (error) {
      // Corrida: outra execução inseriu a mesma chave entre a checagem e o INSERT.
      if (input.idempotencyKey && this.isIdempotencyViolation(error)) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing) return { ...existing, created: false };
      }
      throw error;
    }

    this.metrics.incrementNotificationsCreated(input.channel);
    this.logger.log(
      {
        notificationId: saved.message.id,
        flowId: saved.message.flowId,
        executionId: saved.message.flowExecutionId,
        nodeId: saved.message.nodeId,
        channel: input.channel,
        status,
        recipients: saved.recipients.length,
        scheduled: scheduledFuture,
      },
      'Notification created',
    );
    return { ...saved, created: true };
  }

  /** Despacho imediato dos destinatários elegíveis e resumo do resultado. */
  async dispatch(notificationId: string): Promise<NotificationSummary> {
    await this.dispatcher.dispatchMessage(notificationId);
    return this.summarize(notificationId);
  }

  async summarize(notificationId: string): Promise<NotificationSummary> {
    const message = await this.messages.findOneOrFail({ where: { id: notificationId } });
    const rows = await this.recipients.find({
      where: { notificationId },
      select: ['id', 'status', 'attemptCount', 'lastErrorCategory'],
    });

    const counts = {
      total: rows.length,
      scheduled: 0,
      pending: 0,
      processing: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
    } as NotificationSummary['counts'];
    const errors = new Map<NotificationErrorCategory, number>();
    let retryScheduled = 0;
    for (const row of rows) {
      counts[row.status] += 1;
      if (row.status === 'pending' && row.attemptCount > 0) retryScheduled += 1;
      if (row.status === 'failed' && row.lastErrorCategory) {
        errors.set(row.lastErrorCategory, (errors.get(row.lastErrorCategory) ?? 0) + 1);
      }
    }
    return {
      notificationId,
      channel: message.channel,
      status: deriveMessageStatus(rows.map((r) => r.status)),
      counts,
      retryScheduled,
      errors: [...errors.entries()].map(([category, count]) => ({ category, count })),
    };
  }

  /**
   * Cancela o que ainda não foi reivindicado (`pending`/`scheduled`). Quem já está `processing`
   * termina o envio — o provedor pode já ter aceitado —, e o que já foi enviado não é desfeito.
   */
  async cancel(notificationId: string): Promise<{ cancelled: number; summary: NotificationSummary }> {
    const now = new Date();
    const result = await this.recipients.update(
      { notificationId, status: In(['pending', 'scheduled']) },
      { status: 'cancelled', cancelledAt: now, lockedAt: null },
    );
    await this.dispatcher.refreshMessageStatus(notificationId);
    const summary = await this.summarize(notificationId);
    if (summary.status === 'cancelled' || summary.status === 'partially_sent') {
      await this.messages.update(notificationId, { cancelledAt: now });
    }
    return { cancelled: result.affected ?? 0, summary };
  }

  /**
   * Reenvio manual: devolve à fila os destinatários que falharam por motivo **recuperável** (não
   * `invalid_recipient`), com orçamento novo de tentativas (`attempt_count = 0`; o histórico de
   * tentativas continua numerado em sequência).
   */
  async retryFailed(notificationId: string): Promise<{ requeued: number; summary: NotificationSummary }> {
    const failed = await this.recipients.find({
      where: { notificationId, status: 'failed' },
      select: ['id', 'lastErrorCategory'],
    });
    const retryable = failed.filter((r) => r.lastErrorCategory !== 'invalid_recipient');
    if (retryable.length > 0) {
      await this.recipients.update(
        { id: In(retryable.map((r) => r.id)), status: 'failed' },
        {
          status: 'pending',
          attemptCount: 0,
          nextAttemptAt: new Date(),
          failedAt: null,
          lockedAt: null,
        },
      );
      await this.messages.update(notificationId, { completedAt: null, cancelledAt: null });
      await this.dispatcher.refreshMessageStatus(notificationId);
    }
    return { requeued: retryable.length, summary: await this.summarize(notificationId) };
  }

  // ── Consultas ───────────────────────────────────────────────────────────────────

  async findMessages(query: {
    flowId: string;
    flowExecutionId?: string;
    status?: NotificationMessageStatus;
    page: number;
    limit: number;
  }): Promise<{ data: NotificationMessageEntity[]; total: number }> {
    const where: Record<string, unknown> = { flowId: query.flowId };
    if (query.flowExecutionId) where.flowExecutionId = query.flowExecutionId;
    if (query.status) where.status = query.status;
    const [data, total] = await this.messages.findAndCount({
      where,
      relations: { recipients: true },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { data, total };
  }

  findMessageWithAttempts(notificationId: string): Promise<NotificationMessageEntity | null> {
    return this.messages.findOne({
      where: { id: notificationId },
      relations: { recipients: { attempts: true } },
      order: { recipients: { createdAt: 'ASC' } },
    });
  }

  // ── Retenção ────────────────────────────────────────────────────────────────────

  /** Apaga notificações **terminais** mais antigas que a retenção (cascata leva destinatários e tentativas). */
  async purgeExpired(now = new Date()): Promise<number> {
    const days = this.retentionDays();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const result = await this.messages.delete({
      createdAt: LessThan(cutoff),
      status: In(['sent', 'delivered', 'partially_sent', 'failed', 'cancelled']),
    });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      this.logger.log({ removed, retentionDays: days }, 'Notificações antigas expurgadas');
    }
    return removed;
  }

  // ── Internos ────────────────────────────────────────────────────────────────────

  private async findByIdempotencyKey(
    key: string,
  ): Promise<{ message: NotificationMessageEntity; recipients: NotificationRecipientEntity[] } | null> {
    const message = await this.messages.findOne({ where: { idempotencyKey: key } });
    if (!message) return null;
    const recipients = await this.recipients.find({ where: { notificationId: message.id } });
    return { message, recipients };
  }

  private async assertFlowRateLimit(flowId: string | null, incoming: number): Promise<void> {
    if (!flowId) return;
    const limit = this.maxRecipientsPerFlowPerHour();
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.recipients
      .createQueryBuilder('r')
      .innerJoin('r.notification', 'm')
      .where('m.flowId = :flowId', { flowId })
      .andWhere('m.createdAt >= :since', { since })
      .getCount();
    if (recent + incoming > limit) {
      this.logger.warn(
        { flowId, recent, incoming, limit },
        'Limite de notificações por fluxo/hora atingido',
      );
      throw new NotificationRateLimitError(
        `Limite de ${limit} notificações por hora para este fluxo atingido.`,
      );
    }
  }

  private isIdempotencyViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driver = error.driverError as { code?: string; constraint?: string } | undefined;
    return (
      driver?.code === UNIQUE_VIOLATION &&
      driver.constraint === 'UQ_notification_messages_idempotency_key'
    );
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }

  private maxRecipientsPerNotification(): number {
    return this.numberConfig(
      'NOTIFICATIONS_MAX_RECIPIENTS_PER_NODE',
      DEFAULT_MAX_RECIPIENTS_PER_NOTIFICATION,
    );
  }

  private maxRecipientsPerFlowPerHour(): number {
    return this.numberConfig(
      'NOTIFICATIONS_MAX_RECIPIENTS_PER_FLOW_PER_HOUR',
      DEFAULT_MAX_RECIPIENTS_PER_FLOW_PER_HOUR,
    );
  }

  private retentionDays(): number {
    return this.numberConfig('NOTIFICATIONS_RETENTION_DAYS', 90);
  }
}
