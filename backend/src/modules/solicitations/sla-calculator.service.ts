import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { SolicitationEntity } from '../../database/entities';
import {
  UserNoticeService,
  solicitationLink,
  type UserNoticeInput,
} from '../notifications/user-notice.service';
import { MetricsService } from '../observability/metrics.service';

export type SlaStatusResult = {
  status: SolicitationSlaStatus | null;
  percentUsed: number;
  minutesRemaining: number;
  isBreached: boolean;
  isWarning: boolean;
};

export type SlaCheckResult = {
  processed: number;
  warned: number;
  breached: number;
};

type SlaStateTransition = 'warning' | 'breached' | 'none';

const TERMINAL_SLA_STATUSES = [
  SolicitationStatus.COMPLETED,
  SolicitationStatus.CANCELLED,
  SolicitationStatus.REJECTED,
] as const;

const MAX_SLA_CHECK_BATCH = 100;
const DEFAULT_WARNING_THRESHOLD_PERCENT = 80;

@Injectable()
export class SlaCalculatorService {
  private readonly logger = new Logger(SlaCalculatorService.name);

  constructor(
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
    @Optional() private readonly userNotice?: UserNoticeService,
  ) {}

  /** Aviso ao responsável; um por estado e prazo (prorrogar o prazo volta a valer). */
  private slaNotice(solicitation: SolicitationEntity, state: 'warning' | 'breached'): UserNoticeInput {
    const breached = state === 'breached';
    return {
      kind: breached ? 'sla_breached' : 'sla_warning',
      userIds: [solicitation.assigneeId],
      title: breached ? 'Prazo vencido' : 'Prazo perto de vencer',
      pushTitle: breached ? '🚨 SLA vencido' : '⚠️ SLA em alerta',
      body: breached
        ? `${solicitation.title} passou do prazo.`
        : `${solicitation.title} está próximo do prazo.`,
      priority: breached ? 'high' : 'normal',
      link: solicitationLink(solicitation.id),
      solicitationId: solicitation.id,
      dedupeKey: `sla:${solicitation.id}:${solicitation.slaDueAt?.toISOString() ?? ''}:${state}`,
    };
  }

  calculateSlaDueAt(startedAt: Date, durationHours: number): Date {
    return new Date(startedAt.getTime() + durationHours * 60 * 60 * 1000);
  }

  getSlaStatus(solicitation: SolicitationEntity): SlaStatusResult {
    if (!solicitation.slaDueAt) {
      return this.emptyResult(null);
    }

    const now = new Date();
    const startedAt = solicitation.slaStartedAt ?? solicitation.createdAt;
    const dueAt = solicitation.slaDueAt;
    const totalMs = dueAt.getTime() - startedAt.getTime();
    const elapsedMs = now.getTime() - startedAt.getTime();
    const remainingMs = dueAt.getTime() - now.getTime();
    const percentUsed = this.calculatePercentUsed(elapsedMs, totalMs);
    const minutesRemaining = this.calculateMinutesRemaining(remainingMs);

    if (this.isTerminalStatus(solicitation.status)) {
      return {
        status: SolicitationSlaStatus.COMPLETED,
        percentUsed,
        minutesRemaining,
        isBreached: false,
        isWarning: false,
      };
    }

    if (solicitation.slaPausedAt || solicitation.slaStatus === SolicitationSlaStatus.PAUSED) {
      return {
        status: SolicitationSlaStatus.PAUSED,
        percentUsed,
        minutesRemaining,
        isBreached: false,
        isWarning: false,
      };
    }

    const isBreached = now.getTime() > dueAt.getTime();
    const threshold =
      solicitation.slaWarningThresholdPercent ?? DEFAULT_WARNING_THRESHOLD_PERCENT;
    const isWarning = !isBreached && percentUsed >= threshold;

    return {
      status: isBreached
        ? SolicitationSlaStatus.BREACHED
        : isWarning
          ? SolicitationSlaStatus.WARNING
          : SolicitationSlaStatus.ON_TRACK,
      percentUsed,
      minutesRemaining,
      isBreached,
      isWarning,
    };
  }

  initializeSlaForSolicitation(
    solicitation: SolicitationEntity,
    durationHours?: number,
  ): Partial<SolicitationEntity> {
    const startedAt = new Date();
    const normalizedDuration = this.normalizeDurationHours(durationHours);
    return {
      slaStartedAt: startedAt,
      slaDurationHours: normalizedDuration ?? null,
      slaDueAt: normalizedDuration ? this.calculateSlaDueAt(startedAt, normalizedDuration) : null,
      slaStatus: SolicitationSlaStatus.ON_TRACK,
      slaWarningThresholdPercent:
        solicitation.slaWarningThresholdPercent ?? DEFAULT_WARNING_THRESHOLD_PERCENT,
    };
  }

  /**
   * Variante de initializeSlaForSolicitation para quando o prazo já é uma data —
   * caso das tarefas criadas por fluxo com vencimento próprio (ex: renovação anual
   * de certificado). A duração em horas é derivada da data para manter coerente o
   * percentual consumido, que getSlaStatus calcula por startedAt/dueAt.
   */
  initializeSlaWithDeadline(
    dueAt: Date,
    warningThresholdPercent?: number,
  ): Partial<SolicitationEntity> {
    const startedAt = new Date();
    const durationHours = Math.max(
      1,
      Math.round((dueAt.getTime() - startedAt.getTime()) / (60 * 60 * 1000)),
    );

    return {
      slaStartedAt: startedAt,
      slaDurationHours: durationHours,
      slaDueAt: dueAt,
      slaStatus: SolicitationSlaStatus.ON_TRACK,
      slaWarningThresholdPercent: warningThresholdPercent ?? DEFAULT_WARNING_THRESHOLD_PERCENT,
    };
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkSlaDeadlines(): Promise<SlaCheckResult> {
    const cycleStart = Date.now();
    this.logger.log({ status: 'started' }, 'SLA deadline check started');

    const solicitations = await this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .where('solicitation.sla_due_at IS NOT NULL')
      .andWhere('solicitation.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: TERMINAL_SLA_STATUSES,
      })
      .orderBy('solicitation.sla_due_at', 'ASC')
      .take(MAX_SLA_CHECK_BATCH)
      .getMany();

    let warned = 0;
    let breached = 0;
    for (const solicitation of solicitations) {
      const transition = await this.updateSlaState(solicitation);
      if (transition === 'warning') warned += 1;
      if (transition === 'breached') breached += 1;
    }

    await this.refreshSlaMetrics();
    await this.refreshSolicitationsByAreaMetric();

    const result: SlaCheckResult = {
      processed: solicitations.length,
      warned,
      breached,
    };

    this.logger.log(
      { ...result, durationMs: Date.now() - cycleStart, status: 'completed' },
      'SLA deadline check completed',
    );

    return result;
  }

  private async updateSlaState(solicitation: SolicitationEntity): Promise<SlaStateTransition> {
    const result = this.getSlaStatus(solicitation);
    if (!result.status) return 'none';

    if (result.isBreached) {
      if (!solicitation.slaBreachedAt) {
        await this.solicitationsRepository.update(solicitation.id, {
          slaBreachedAt: new Date(),
          slaStatus: SolicitationSlaStatus.BREACHED,
        });
        this.eventEmitter.emit('solicitations.sla.breached', {
          solicitationId: solicitation.id,
        });
        if (solicitation.assigneeId) {
          void this.userNotice?.notify(this.slaNotice(solicitation, 'breached'));
        }
        return 'breached';
      }

      if (solicitation.slaStatus !== SolicitationSlaStatus.BREACHED) {
        await this.solicitationsRepository.update(solicitation.id, {
          slaStatus: SolicitationSlaStatus.BREACHED,
        });
      }
      return 'none';
    }

    if (
      result.isWarning &&
      solicitation.slaStatus !== SolicitationSlaStatus.WARNING &&
      solicitation.slaStatus !== SolicitationSlaStatus.BREACHED
    ) {
      await this.solicitationsRepository.update(solicitation.id, {
        slaStatus: SolicitationSlaStatus.WARNING,
      });
      this.eventEmitter.emit('solicitations.sla.warning', {
        solicitationId: solicitation.id,
      });
      if (solicitation.assigneeId) {
        void this.userNotice?.notify(this.slaNotice(solicitation, 'warning'));
      }
      return 'warning';
    }

    if (
      result.status === SolicitationSlaStatus.ON_TRACK &&
      solicitation.slaStatus !== SolicitationSlaStatus.ON_TRACK
    ) {
      await this.solicitationsRepository.update(solicitation.id, {
        slaStatus: SolicitationSlaStatus.ON_TRACK,
      });
    }
    return 'none';
  }

  private async refreshSolicitationsByAreaMetric(): Promise<void> {
    const rows: Array<{ area_code: string; count: string }> =
      await this.solicitationsRepository.manager.query(`
        SELECT COALESCE(a.code, 'none') AS area_code, COUNT(*)::text AS count
        FROM solicitations s
        LEFT JOIN areas a ON s.area_id = a.id
        WHERE s.status NOT IN (${TERMINAL_SLA_STATUSES.map((_, i) => `$${i + 1}`).join(', ')})
        GROUP BY COALESCE(a.code, 'none')
      `, [...TERMINAL_SLA_STATUSES]);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.area_code] = parseInt(row.count, 10);
    }
    this.metricsService.setSolicitationsByArea(counts);
  }

  private async refreshSlaMetrics(): Promise<void> {
    const counts: Record<string, number> = {};
    for (const slaStatus of Object.values(SolicitationSlaStatus)) {
      counts[slaStatus] = await this.solicitationsRepository.count({
        where: { slaStatus },
      });
    }

    this.metricsService.setSolicitationsSlaBreachedTotal(
      counts[SolicitationSlaStatus.BREACHED] ?? 0,
    );
    this.metricsService.setSolicitationsBySlaStatus(counts);
  }

  private emptyResult(status: SolicitationSlaStatus | null): SlaStatusResult {
    return {
      status,
      percentUsed: 0,
      minutesRemaining: 0,
      isBreached: false,
      isWarning: false,
    };
  }

  private calculatePercentUsed(elapsedMs: number, totalMs: number): number {
    if (totalMs <= 0) return elapsedMs >= 0 ? 100 : 0;
    return Math.round((elapsedMs / totalMs) * 10_000) / 100;
  }

  private calculateMinutesRemaining(remainingMs: number): number {
    const minutes = remainingMs / 60_000;
    return remainingMs >= 0 ? Math.ceil(minutes) : Math.floor(minutes);
  }

  private normalizeDurationHours(value: number | undefined): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.trunc(value);
  }

  private isTerminalStatus(status: SolicitationStatus): boolean {
    return (TERMINAL_SLA_STATUSES as readonly SolicitationStatus[]).includes(status);
  }
}
