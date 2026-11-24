import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  ApprovalEntity,
  ApprovalStepEntity,
  FlowEntity,
  FlowExecutionEntity,
  FormEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ProcessAccessService } from '../access/process-access.service';
import { PermissionsService } from '../roles/permissions.service';
import type {
  ApprovalsBlock,
  FlowsBlock,
  MyWorkBlock,
  OperationalDashboardDto,
  RecentActivityItem,
  SolicitationsBlock,
  TrendBlock,
  TrendPoint,
} from './dto/operational-dashboard.dto';

const TERMINAL_STATUSES: SolicitationStatus[] = [
  SolicitationStatus.RESOLVED,
  SolicitationStatus.CANCELED,
  SolicitationStatus.COMPLETED,
  SolicitationStatus.CANCELLED,
];

@Injectable()
export class OperationalDashboardService {
  constructor(
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(SolicitationHistoryEntity)
    private readonly historyRepo: Repository<SolicitationHistoryEntity>,
    @InjectRepository(ApprovalEntity)
    private readonly approvalsRepo: Repository<ApprovalEntity>,
    @InjectRepository(ApprovalStepEntity)
    private readonly stepsRepo: Repository<ApprovalStepEntity>,
    @InjectRepository(FlowEntity)
    private readonly flowsRepo: Repository<FlowEntity>,
    @InjectRepository(FlowExecutionEntity)
    private readonly flowExecutionsRepo: Repository<FlowExecutionEntity>,
    @InjectRepository(FormEntity)
    private readonly formsRepo: Repository<FormEntity>,
    private readonly permissionsService: PermissionsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  async getOperationalStats(actor: JwtPayload): Promise<OperationalDashboardDto> {
    const isPrivileged = await this.permissionsService.hasAny(actor.role, 'dashboard.view_org');
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [myWork, solStats, trend, recentActivity, flows, approvals] = await Promise.all([
      this.buildMyWork(actor, startOfToday),
      this.buildSolicitationsBlock(actor, sevenDaysAgo, thirtyDaysAgo),
      this.buildTrend(actor, thirtyDaysAgo),
      this.buildRecentActivity(actor),
      isPrivileged ? this.buildFlows(startOfToday) : Promise.resolve(null),
      isPrivileged ? this.buildApprovals(startOfToday) : Promise.resolve(null),
    ]);

    return { myWork, solicitations: solStats, trend, recentActivity, flows, approvals };
  }

  /** Execuções de fluxo com erro hoje; `null` para quem não tem visão da organização. */
  async countFailedFlowsToday(actor: JwtPayload): Promise<number | null> {
    if (!(await this.permissionsService.hasAny(actor.role, 'dashboard.view_org'))) return null;
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    return (await this.buildFlows(startOfToday)).failedToday;
  }

  // ── My work ─────────────────────────────────────────────────────────────────

  private async buildMyWork(actor: JwtPayload, startOfToday: Date): Promise<MyWorkBlock> {
    const [pendingApprovals, myActiveSolicitations, formsRaw] = await Promise.all([
      // Steps assigned to me that are still pending
      this.stepsRepo
        .createQueryBuilder('step')
        .innerJoin('step.approval', 'approval')
        .where('step.assigned_user_id = :uid', { uid: actor.sub })
        .andWhere('step.status = :s', { s: ApprovalStepStatus.PENDING })
        .andWhere('approval.status = :as', { as: ApprovalStatus.PENDING })
        .getCount(),

      // Solicitations where I am assignee and not in terminal status
      this.solicitationsRepo
        .createQueryBuilder('solicitation')
        .where('solicitation.assignee_id = :uid', { uid: actor.sub })
        .andWhere('solicitation.status NOT IN (:...terminals)', { terminals: TERMINAL_STATUSES })
        .getCount(),

      // My forms
      this.formsRepo
        .createQueryBuilder('form')
        .select(['form.status'])
        .where('form.created_by = :uid', { uid: actor.sub })
        .getMany(),
    ]);

    void startOfToday; // unused but kept for future "today's activity" extension

    const myFormsCount = formsRaw.length;
    const myFormsPublished = formsRaw.filter((f) => f.status === FormStatus.PUBLISHED).length;

    return { pendingApprovals, myActiveSolicitations, myFormsCount, myFormsPublished };
  }

  // ── Solicitations block ──────────────────────────────────────────────────────

  private async buildSolicitationsBlock(
    actor: JwtPayload,
    sevenDaysAgo: Date,
    thirtyDaysAgo: Date,
  ): Promise<SolicitationsBlock> {
    // Os cards que a pessoa vê no quadro: pelo vínculo com cada processo (antes: pela área).
    const grants = await this.processAccess.grantsOf(actor);
    const baseQb = (): SelectQueryBuilder<SolicitationEntity> =>
      this.solicitationsRepo.createQueryBuilder('solicitation').select('1');

    // All non-terminal
    const totalQb = this.solicitationsRepo
      .createQueryBuilder('solicitation')
      .select('solicitation.status', 'status')
      .addSelect('COUNT(solicitation.id)', 'count')
      .where('solicitation.status NOT IN (:...terminals)', { terminals: TERMINAL_STATUSES })
      .groupBy('solicitation.status');
    this.processAccess.applySolicitationScopeWith(totalQb, grants, 'solicitation');

    const slaBreachedQb = baseQb()
      .where('solicitation.sla_status = :s', { s: SolicitationSlaStatus.BREACHED });
    this.processAccess.applySolicitationScopeWith(slaBreachedQb, grants, 'solicitation');

    const slaWarningQb = baseQb()
      .where('solicitation.sla_status = :s', { s: SolicitationSlaStatus.WARNING });
    this.processAccess.applySolicitationScopeWith(slaWarningQb, grants, 'solicitation');

    const created7Qb = baseQb()
      .where('solicitation.created_at >= :from', { from: sevenDaysAgo });
    this.processAccess.applySolicitationScopeWith(created7Qb, grants, 'solicitation');

    const created30Qb = baseQb()
      .where('solicitation.created_at >= :from', { from: thirtyDaysAgo });
    this.processAccess.applySolicitationScopeWith(created30Qb, grants, 'solicitation');

    const completed30Qb = baseQb()
      .where('solicitation.status IN (:...terminals)', { terminals: TERMINAL_STATUSES })
      .andWhere('solicitation.updated_at >= :from', { from: thirtyDaysAgo });
    this.processAccess.applySolicitationScopeWith(completed30Qb, grants, 'solicitation');

    // Avg completion: avg hours from createdAt → updatedAt for completed in last 30 days
    const avgQb = this.solicitationsRepo
      .createQueryBuilder('solicitation')
      .select(
        `AVG(EXTRACT(EPOCH FROM (solicitation.updated_at - solicitation.created_at)) / 3600)`,
        'avg_hours',
      )
      .where('solicitation.status IN (:...terminals)', { terminals: TERMINAL_STATUSES })
      .andWhere('solicitation.updated_at >= :from', { from: thirtyDaysAgo });
    this.processAccess.applySolicitationScopeWith(avgQb, grants, 'solicitation');

    const [statusRows, slaBreached, slaWarning, created7, created30, completed30, avgRow] =
      await Promise.all([
        totalQb.getRawMany<{ status: SolicitationStatus; count: string }>(),
        slaBreachedQb.getCount(),
        slaWarningQb.getCount(),
        created7Qb.getCount(),
        created30Qb.getCount(),
        completed30Qb.getCount(),
        avgQb.getRawOne<{ avg_hours: string | null }>(),
      ]);

    const byStatus: Partial<Record<SolicitationStatus, number>> = {};
    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = Number(row.count);
      total += Number(row.count);
    }

    const avgRaw = avgRow?.avg_hours != null ? parseFloat(avgRow.avg_hours) : null;
    const avgCompletionHours =
      avgRaw != null && Number.isFinite(avgRaw) ? Math.round(avgRaw * 10) / 10 : null;

    return {
      total,
      byStatus,
      slaBreached,
      slaWarning,
      createdLast7Days: created7,
      createdLast30Days: created30,
      completedLast30Days: completed30,
      avgCompletionHours,
    };
  }

  // ── Trend block ──────────────────────────────────────────────────────────────

  private async buildTrend(actor: JwtPayload, thirtyDaysAgo: Date): Promise<TrendBlock> {
    const grants = await this.processAccess.grantsOf(actor);
    const createdQb = this.solicitationsRepo
      .createQueryBuilder('solicitation')
      .select("DATE_TRUNC('day', solicitation.created_at)", 'day')
      .addSelect('COUNT(solicitation.id)', 'count')
      .where('solicitation.created_at >= :from', { from: thirtyDaysAgo })
      .groupBy("DATE_TRUNC('day', solicitation.created_at)")
      .orderBy("DATE_TRUNC('day', solicitation.created_at)", 'ASC');
    this.processAccess.applySolicitationScopeWith(createdQb, grants, 'solicitation');

    const completedQb = this.solicitationsRepo
      .createQueryBuilder('solicitation')
      .select("DATE_TRUNC('day', solicitation.updated_at)", 'day')
      .addSelect('COUNT(solicitation.id)', 'count')
      .where('solicitation.status IN (:...terminals)', { terminals: TERMINAL_STATUSES })
      .andWhere('solicitation.updated_at >= :from', { from: thirtyDaysAgo })
      .groupBy("DATE_TRUNC('day', solicitation.updated_at)")
      .orderBy("DATE_TRUNC('day', solicitation.updated_at)", 'ASC');
    this.processAccess.applySolicitationScopeWith(completedQb, grants, 'solicitation');

    const [createdRaw, completedRaw] = await Promise.all([
      createdQb.getRawMany<{ day: string; count: string }>(),
      completedQb.getRawMany<{ day: string; count: string }>(),
    ]);

    const createdMap = new Map(
      createdRaw.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.count)]),
    );
    const completedMap = new Map(
      completedRaw.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.count)]),
    );

    const startDay = new Date();
    startDay.setUTCHours(0, 0, 0, 0);
    startDay.setUTCDate(startDay.getUTCDate() - 29);

    const data: TrendPoint[] = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(startDay);
      day.setUTCDate(startDay.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      return { date: key, created: createdMap.get(key) ?? 0, completed: completedMap.get(key) ?? 0 };
    });

    return { period: '30d', data };
  }

  // ── Recent activity ──────────────────────────────────────────────────────────

  private async buildRecentActivity(actor: JwtPayload): Promise<RecentActivityItem[]> {
    const grants = await this.processAccess.grantsOf(actor);
    const relevantEvents: SolicitationHistoryEventType[] = [
      SolicitationHistoryEventType.CREATED,
      SolicitationHistoryEventType.STATUS_CHANGED,
    ];

    const historyQb = this.historyRepo
      .createQueryBuilder('history')
      .innerJoin('history.solicitation', 'solicitation')
      .leftJoin('history.actor', 'actor')
      .select([
        'history.id',
        'history.eventType',
        'history.toValue',
        'history.createdAt',
        'history.solicitationId',
        'solicitation.id',
        'solicitation.title',
        'actor.fullName',
      ])
      .where('history.eventType IN (:...types)', { types: relevantEvents })
      .orderBy('history.createdAt', 'DESC')
      .take(10);

    this.processAccess.applySolicitationScopeWith(historyQb, grants, 'solicitation');

    const flowExecQb = this.flowExecutionsRepo
      .createQueryBuilder('exec')
      .select('exec.id', 'id')
      .addSelect('exec.status', 'status')
      .addSelect('exec.created_at', 'createdAt')
      .addSelect('flow.name', 'flowName')
      .leftJoin('flows', 'flow', 'flow.id = exec.flow_id')
      .orderBy('exec.created_at', 'DESC')
      .take(10);

    const [historyRows, flowRaw] = await Promise.all([
      historyQb.getMany(),
      flowExecQb.getRawMany<{ id: string; status: string; createdAt: string; flowName: string | null }>(),
    ]);

    const historyItems: RecentActivityItem[] = historyRows.map((h) => {
      const isCreated = h.eventType === SolicitationHistoryEventType.CREATED;
      const shortId = h.solicitation.id.slice(0, 8).toUpperCase();
      const description = isCreated
        ? `Solicitação #${shortId} recebida`
        : `Solicitação #${shortId} movida para ${h.toValue ?? ''}`;

      return {
        type: isCreated ? 'solicitation_created' : 'solicitation_moved',
        description,
        solicitationNumber: shortId,
        actorName: h.actor?.fullName ?? undefined,
        occurredAt: h.createdAt,
      };
    });

    const flowItems: RecentActivityItem[] = flowRaw.map((exec) => ({
      type: 'flow_executed',
      description: `Fluxo "${exec.flowName ?? 'desconhecido'}" executado (${exec.status})`,
      occurredAt: new Date(exec.createdAt),
    }));

    const combined = [...historyItems, ...flowItems]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 10);

    return combined;
  }

  // ── Flows block (admin/manager only) ────────────────────────────────────────

  private async buildFlows(startOfToday: Date): Promise<FlowsBlock> {
    const [activeFlows, executionsToday, failedToday] = await Promise.all([
      this.flowsRepo.count({ where: { isActive: true } }),
      this.flowExecutionsRepo
        .createQueryBuilder('exec')
        .where('exec.created_at >= :today', { today: startOfToday })
        .getCount(),
      this.flowExecutionsRepo
        .createQueryBuilder('exec')
        .where('exec.created_at >= :today', { today: startOfToday })
        .andWhere('exec.status = :s', { s: 'failed' })
        .getCount(),
    ]);

    return { activeFlows, executionsToday, failedToday };
  }

  // ── Approvals block (admin/manager only) ────────────────────────────────────

  private async buildApprovals(startOfToday: Date): Promise<ApprovalsBlock> {
    const [pendingTotal, decidedToday] = await Promise.all([
      this.approvalsRepo.count({ where: { status: ApprovalStatus.PENDING } }),
      this.stepsRepo
        .createQueryBuilder('step')
        .where('step.decided_at >= :today', { today: startOfToday })
        .andWhere('step.status IN (:...decided)', {
          decided: [ApprovalStepStatus.APPROVED, ApprovalStepStatus.REJECTED],
        })
        .getCount(),
    ]);

    return { pendingTotal, decidedToday };
  }
}
