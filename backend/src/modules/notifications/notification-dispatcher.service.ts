import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import {
  NotificationAttemptEntity,
  NotificationMessageEntity,
  NotificationRecipientEntity,
} from '../../database/entities';
import { MetricsService } from '../observability/metrics.service';
import { NotificationChannelRegistry } from './channels/notification-channel.registry';
import {
  NotificationChannelError,
  classifyError,
  maskAddress,
  sanitizeErrorMessage,
} from './domain/notification-errors';
import { computeNextAttemptAt, normalizeRetryPolicy, shouldRetry } from './domain/notification-retry';
import { assertRecipientTransition, deriveMessageStatus, isTerminalMessageStatus } from './domain/notification-state';
import type { NotificationRecipientStatus } from './domain/notification.types';

const DEFAULT_SEND_TIMEOUT_MS = 20_000;
const DEFAULT_STALE_PROCESSING_MS = 5 * 60_000;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_BATCH_SIZE = 50;

/** Colunas que o dispatcher grava ao fechar uma tentativa (sem relações — mantém o tipo do UPDATE simples). */
type RecipientChanges = Partial<
  Pick<
    NotificationRecipientEntity,
    | 'status'
    | 'provider'
    | 'providerMessageId'
    | 'sentAt'
    | 'deliveredAt'
    | 'failedAt'
    | 'lockedAt'
    | 'lastErrorCategory'
    | 'lastError'
    | 'nextAttemptAt'
  >
>;

export interface DispatchOutcome {
  claimed: number;
}

/**
 * Envia os destinatários que estão prontos: reivindica (atomicamente), tenta, registra a
 * tentativa, classifica o erro, agenda a retentativa e recalcula o estado da notificação.
 *
 * Dois caminhos usam o mesmo código — o **despacho imediato** de um nó (`dispatchMessage`) e o
 * **worker** periódico (`processDue`). Como a reivindicação é um `SELECT … FOR UPDATE SKIP LOCKED`
 * seguido de `UPDATE … processing`, os dois (e várias instâncias do backend) nunca pegam o mesmo
 * destinatário.
 *
 * Garantia: **pelo menos uma vez**. Se o processo morrer entre o aceite do provedor e a gravação do
 * resultado, a recuperação (`recoverStale`) refaz a tentativa — pode haver um duplicado nesse caso
 * raro, mas nunca perda silenciosa. Resultados atrasados são ignorados (`attempt_count` como versão).
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(NotificationMessageEntity)
    private readonly messages: Repository<NotificationMessageEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipients: Repository<NotificationRecipientEntity>,
    @InjectRepository(NotificationAttemptEntity)
    private readonly attempts: Repository<NotificationAttemptEntity>,
    private readonly registry: NotificationChannelRegistry,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  /** Despacho imediato dos destinatários elegíveis de UMA notificação (usado pelo nó do fluxo). */
  async dispatchMessage(notificationId: string): Promise<DispatchOutcome> {
    const claimed = await this.claimDue({ notificationId, limit: 500 });
    await this.processClaimed(claimed);
    return { claimed: claimed.length };
  }

  /** Um ciclo do worker: recupera travados, reivindica um lote vencido e envia. */
  async processDue(limit = DEFAULT_BATCH_SIZE): Promise<number> {
    await this.recoverStale();
    const claimed = await this.claimDue({ limit });
    await this.processClaimed(claimed);
    this.metrics.setNotificationRecipientsDue(await this.countDue());
    return claimed.length;
  }

  async countDue(): Promise<number> {
    return this.recipients
      .createQueryBuilder('r')
      .where('r.status IN (:...statuses)', { statuses: ['pending', 'scheduled'] })
      .andWhere('r.nextAttemptAt <= :now', { now: new Date() })
      .getCount();
  }

  // ── Reivindicação ───────────────────────────────────────────────────────────────

  private async claimDue(options: {
    notificationId?: string;
    limit: number;
  }): Promise<NotificationRecipientEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const qb = manager
        .getRepository(NotificationRecipientEntity)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('r.status IN (:...statuses)', { statuses: ['pending', 'scheduled'] })
        // Relógio único (o da aplicação) para criar, agendar e reivindicar — sem depender de NOW() do banco.
        .andWhere('r.nextAttemptAt <= :now', { now: new Date() })
        .orderBy('r.priorityRank', 'ASC')
        .addOrderBy('r.nextAttemptAt', 'ASC')
        .limit(options.limit);
      if (options.notificationId) {
        qb.andWhere('r.notificationId = :notificationId', {
          notificationId: options.notificationId,
        });
      }
      const rows = await qb.getMany();
      if (rows.length === 0) return [];

      for (const row of rows) assertRecipientTransition(row.status, 'processing');
      const now = new Date();
      await manager.update(
        NotificationRecipientEntity,
        { id: In(rows.map((row) => row.id)) },
        { status: 'processing', lockedAt: now, attemptCount: () => 'attempt_count + 1' },
      );
      for (const row of rows) {
        row.status = 'processing';
        row.lockedAt = now;
        row.attemptCount += 1;
      }
      return rows;
    });
  }

  // ── Processamento ───────────────────────────────────────────────────────────────

  private async processClaimed(claimed: NotificationRecipientEntity[]): Promise<void> {
    if (claimed.length === 0) return;

    const messages = await this.messages.find({
      where: { id: In([...new Set(claimed.map((r) => r.notificationId))]) },
    });
    const messageById = new Map(messages.map((m) => [m.id, m]));
    const concurrency = this.concurrency();

    for (let i = 0; i < claimed.length; i += concurrency) {
      const slice = claimed.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (recipient) => {
          const message = messageById.get(recipient.notificationId);
          if (!message) {
            this.logger.error(
              { recipientId: recipient.id, notificationId: recipient.notificationId },
              'Destinatário sem notificação — ignorado',
            );
            return;
          }
          try {
            await this.deliver(recipient, message);
          } catch (error) {
            // Falha de infraestrutura (ex.: banco) ao registrar o resultado: o destinatário fica
            // `processing` e será recuperado por `recoverStale`. Não derruba o lote.
            this.logger.error(
              {
                notificationId: message.id,
                recipientId: recipient.id,
                error: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
              },
              'Falha ao registrar resultado do envio',
            );
          }
        }),
      );
    }

    for (const id of new Set(claimed.map((r) => r.notificationId))) {
      await this.refreshMessageStatus(id);
    }
  }

  private async deliver(
    recipient: NotificationRecipientEntity,
    message: NotificationMessageEntity,
  ): Promise<void> {
    const channel = this.registry.get(message.channel);
    const policy = normalizeRetryPolicy({
      maxAttempts: message.maxAttempts,
      backoffSeconds: message.backoffSeconds,
    });
    const cycleAttempt = recipient.attemptCount; // tentativa dentro do orçamento atual
    const startedAt = new Date();
    const attempt = await this.attempts.save(
      this.attempts.create({
        recipientId: recipient.id,
        attemptNumber: await this.nextAttemptNumber(recipient.id),
        status: 'started',
        provider: null,
        startedAt,
      }),
    );

    let providerName = channel.describe().provider;
    let failure: NotificationChannelError | null = null;
    let success: { status: 'sent' | 'delivered'; provider: string; providerMessageId: string | null } | null =
      null;

    try {
      const validation = channel.validateRecipient({
        userId: recipient.userId,
        displayName: recipient.displayName,
        address: recipient.address,
      });
      if (!validation.valid) {
        throw new NotificationChannelError(
          validation.reason ?? 'Destinatário inválido.',
          'invalid_recipient',
        );
      }
      success = await this.withTimeout(
        channel.send({
          notificationId: message.id,
          recipientId: recipient.id,
          attemptNumber: cycleAttempt,
          title: message.title,
          body: message.body,
          html: typeof message.metadata?.html === 'string' ? message.metadata.html : null,
          link: typeof message.metadata?.link === 'string' ? message.metadata.link : null,
          priority: message.priority,
          recipient: {
            userId: recipient.userId,
            displayName: recipient.displayName,
            address: validation.normalizedAddress ?? recipient.address,
          },
        }),
        this.sendTimeoutMs(),
      );
      providerName = success.provider;
    } catch (error) {
      failure = classifyError(error);
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const logBase = {
      notificationId: message.id,
      recipientId: recipient.id,
      flowId: message.flowId,
      executionId: message.flowExecutionId,
      nodeId: message.nodeId,
      channel: message.channel,
      provider: providerName,
      attempt: cycleAttempt,
      durationMs,
    };

    if (success) {
      const targetStatus: NotificationRecipientStatus = success.status;
      assertRecipientTransition('processing', targetStatus);
      const applied = await this.applyRecipientUpdate(recipient, {
        status: targetStatus,
        provider: success.provider,
        providerMessageId: success.providerMessageId,
        sentAt: finishedAt,
        deliveredAt: targetStatus === 'delivered' ? finishedAt : null,
        lockedAt: null,
        lastErrorCategory: null,
        lastError: null,
        failedAt: null,
      });
      await this.attempts.update(attempt.id, {
        status: 'success',
        provider: success.provider,
        providerMessageId: success.providerMessageId,
        finishedAt,
        durationMs,
      });
      if (applied) {
        this.metrics.recordNotificationAttempt(message.channel, success.provider, 'success', durationMs / 1000);
        this.logger.log({ ...logBase, status: targetStatus }, 'Notification attempt succeeded');
      }
      return;
    }

    const error = failure as NotificationChannelError;
    const errorMessage = sanitizeErrorMessage(error.message);
    const retry = shouldRetry(error.category, cycleAttempt, policy);
    const nextStatus: NotificationRecipientStatus = retry ? 'pending' : 'failed';
    assertRecipientTransition('processing', nextStatus);

    const applied = await this.applyRecipientUpdate(recipient, {
      status: nextStatus,
      provider: providerName,
      lockedAt: null,
      lastErrorCategory: error.category,
      lastError: errorMessage,
      failedAt: retry ? null : finishedAt,
      ...(retry
        ? {
            nextAttemptAt: computeNextAttemptAt(cycleAttempt, policy, finishedAt, {
              retryAfterMs: error.retryAfterMs,
            }),
          }
        : {}),
    });
    await this.attempts.update(attempt.id, {
      status: 'failed',
      provider: providerName,
      errorCategory: error.category,
      errorMessage,
      httpStatus: error.httpStatus ?? null,
      finishedAt,
      durationMs,
    });
    if (applied) {
      this.metrics.recordNotificationAttempt(
        message.channel,
        providerName,
        retry ? 'retry' : 'failed',
        durationMs / 1000,
      );
      this.logger.warn(
        {
          ...logBase,
          status: nextStatus,
          errorCategory: error.category,
          recipient: maskAddress(recipient.address),
        },
        retry ? 'Notification attempt failed — retry scheduled' : 'Notification attempt failed',
      );
    }
  }

  /**
   * Grava o resultado SÓ se o destinatário continua sendo desta tentativa (`processing` e mesmo
   * `attempt_count`) — um resultado atrasado de um worker já dado como morto não sobrescreve a
   * retentativa que outro worker reivindicou depois.
   */
  private async applyRecipientUpdate(
    recipient: NotificationRecipientEntity,
    changes: RecipientChanges,
  ): Promise<boolean> {
    const result = await this.recipients.update(
      { id: recipient.id, status: 'processing', attemptCount: recipient.attemptCount },
      changes,
    );
    const applied = (result.affected ?? 0) > 0;
    if (!applied) {
      this.logger.warn(
        { notificationId: recipient.notificationId, recipientId: recipient.id },
        'Resultado de envio atrasado ignorado (a tentativa foi reivindicada por outro processamento)',
      );
    }
    return applied;
  }

  private async nextAttemptNumber(recipientId: string): Promise<number> {
    const row = await this.attempts
      .createQueryBuilder('a')
      .select('COALESCE(MAX(a.attemptNumber), 0)', 'max')
      .where('a.recipientId = :recipientId', { recipientId })
      .getRawOne<{ max: string | number }>();
    return Number(row?.max ?? 0) + 1;
  }

  // ── Estado agregado ─────────────────────────────────────────────────────────────

  async refreshMessageStatus(notificationId: string): Promise<void> {
    const rows = await this.recipients.find({
      where: { notificationId },
      select: ['id', 'status'],
    });
    if (rows.length === 0) return;
    const status = deriveMessageStatus(rows.map((r) => r.status));
    const current = await this.messages.findOne({
      where: { id: notificationId },
      select: ['id', 'status', 'completedAt'],
    });
    if (!current) return;
    const terminal = isTerminalMessageStatus(status);
    if (current.status === status && Boolean(current.completedAt) === terminal) return;
    await this.messages.update(notificationId, {
      status,
      completedAt: terminal ? (current.completedAt ?? new Date()) : null,
    });
  }

  // ── Recuperação ─────────────────────────────────────────────────────────────────

  /**
   * Destinatários presos em `processing` além do limite (worker morreu ou travou) voltam à fila —
   * ou viram `failed` se já gastaram o orçamento de tentativas.
   */
  async recoverStale(): Promise<number> {
    const threshold = new Date(Date.now() - this.staleProcessingMs());
    const stale = await this.recipients.find({
      where: { status: 'processing', lockedAt: LessThan(threshold) },
      take: 100,
    });
    if (stale.length === 0) return 0;

    const messages = await this.messages.find({
      where: { id: In([...new Set(stale.map((r) => r.notificationId))]) },
    });
    const messageById = new Map(messages.map((m) => [m.id, m]));
    const now = new Date();
    let recovered = 0;

    for (const recipient of stale) {
      const message = messageById.get(recipient.notificationId);
      const maxAttempts = normalizeRetryPolicy({ maxAttempts: message?.maxAttempts }).maxAttempts;
      const exhausted = recipient.attemptCount >= maxAttempts;
      const next: NotificationRecipientStatus = exhausted ? 'failed' : 'pending';
      assertRecipientTransition('processing', next);

      const result = await this.recipients.update(
        { id: recipient.id, status: 'processing', attemptCount: recipient.attemptCount },
        {
          status: next,
          lockedAt: null,
          lastErrorCategory: 'unknown',
          lastError: 'Processamento interrompido antes de registrar o resultado.',
          failedAt: exhausted ? now : null,
          nextAttemptAt: now,
        },
      );
      if ((result.affected ?? 0) === 0) continue;
      recovered += 1;

      await this.attempts.update(
        { recipientId: recipient.id, status: 'started' },
        {
          status: 'abandoned',
          errorCategory: 'unknown',
          errorMessage: 'Processamento interrompido antes de registrar o resultado.',
          finishedAt: now,
        },
      );
      this.metrics.recordNotificationAttempt(
        message?.channel ?? 'unknown',
        recipient.provider ?? 'unknown',
        'abandoned',
        0,
      );
      this.logger.warn(
        {
          notificationId: recipient.notificationId,
          recipientId: recipient.id,
          attempt: recipient.attemptCount,
          status: next,
        },
        'Destinatário travado em processing recuperado',
      );
    }

    for (const id of new Set(stale.map((r) => r.notificationId))) {
      await this.refreshMessageStatus(id);
    }
    return recovered;
  }

  // ── Configuração ────────────────────────────────────────────────────────────────

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new NotificationChannelError('Tempo esgotado ao enviar.', 'timeout')),
        ms,
      );
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }

  private sendTimeoutMs(): number {
    return this.numberConfig('NOTIFICATIONS_SEND_TIMEOUT_MS', DEFAULT_SEND_TIMEOUT_MS);
  }

  private staleProcessingMs(): number {
    return this.numberConfig('NOTIFICATIONS_STALE_PROCESSING_MS', DEFAULT_STALE_PROCESSING_MS);
  }

  private concurrency(): number {
    return this.numberConfig('NOTIFICATIONS_DISPATCH_CONCURRENCY', DEFAULT_CONCURRENCY);
  }
}
