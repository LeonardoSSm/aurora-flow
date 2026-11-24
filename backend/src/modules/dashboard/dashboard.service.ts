import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { FormStatus } from '../../common/enums/form-status.enum';
import {
  AuditEventEntity,
  FormEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { type ProcessGrants, ProcessAccessService } from '../access/process-access.service';
import { QueryDashboardStatsDto } from './dto/query-dashboard-stats.dto';

export type DashboardTrendPoint = {
  date: string;
  count: number;
};

export type DashboardSubmissionSummary = {
  id: string;
  formId: string;
  formName: string;
  responderName: string | null;
  responderEmail: string | null;
  submittedAt: string | null;
};

export type DashboardStats = {
  forms: {
    total: number;
    byStatus: Record<FormStatus, number>;
  };
  responses: {
    total: number;
    last30Days: number;
  };
  responseTrendLast30Days: DashboardTrendPoint[];
  recentSubmissions: DashboardSubmissionSummary[];
  recentActivity: AuditEventEntity[];
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly auditService: AuditService,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepository: Repository<SubmissionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  private async findActorOrFail(actorId: string): Promise<UserEntity> {
    const actor = await this.usersRepository.findOne({ where: { id: actorId } });
    if (!actor) {
      throw new NotFoundException('Usuario autenticado nao encontrado.');
    }
    return actor;
  }

  /** Só os processos com que a pessoa tem vínculo (todos, com acesso total pelo perfil). */
  private applyFormScope<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, grants: ProcessGrants): SelectQueryBuilder<T> {
    this.processAccess.applyFormScope(qb, grants, 'form.id');
    return qb;
  }

  /**
   * Respostas (contagens, tendência e as recentes, com nome e e-mail de quem respondeu) só dos processos
   * em que a pessoa pode ver respostas — a mesma regra da tela de Respostas. Ter vínculo não basta.
   */
  private applyResponsesScope<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, grants: ProcessGrants): void {
    this.processAccess.applyFormScope(qb, grants, 'form.id', 'responses.view');
  }

  /**
   * Applies the 7-field ILIKE search filter used across submission-scoped query builders.
   * All four QBs that join both `form` and `submission` aliases use this helper.
   */
  private applySearchFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    like: string,
    useWhere = false,
  ): void {
    const clause = `(
      form.name ILIKE :like
      OR COALESCE(form.description, '') ILIKE :like
      OR COALESCE(form.category, '') ILIKE :like
      OR COALESCE(form.area, '') ILIKE :like
      OR CAST(submission.form_id AS text) ILIKE :like
      OR COALESCE(submission.responder_name, '') ILIKE :like
      OR COALESCE(submission.responder_email, '') ILIKE :like
    )`;
    if (useWhere) {
      qb.where(clause, { like });
    } else {
      qb.andWhere(clause, { like });
    }
  }

  private resolveResponderEmail(submission: SubmissionEntity): string | null {
    if (submission.responderEmail) {
      return submission.responderEmail;
    }

    const emailItem = submission.items?.find(
      (item) => item.field?.fieldType === FormFieldType.EMAIL && typeof item.valueText === 'string',
    );

    const emailValue = emailItem?.valueText?.trim();
    if (!emailValue) return null;
    return emailValue;
  }

  async getStats(query: QueryDashboardStatsDto = {}, actorId: string): Promise<DashboardStats> {
    const actor = await this.findActorOrFail(actorId);
    const grants = await this.processAccess.grantsOf({ sub: actor.id, role: actor.role });
    const searchTerm = query.q?.trim() ?? '';
    const hasSearch = searchTerm.length > 0;
    const like = `%${searchTerm}%`;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── Build all query builders ───────────────────────────────────────────────

    const formsByStatusQb = this.formsRepository
      .createQueryBuilder('form')
      .select('form.status', 'status')
      .addSelect('COUNT(form.id)', 'count')
      .groupBy('form.status');

    this.applyFormScope(formsByStatusQb, grants);

    if (hasSearch) {
      formsByStatusQb.andWhere(
        `(
          form.name ILIKE :like
          OR COALESCE(form.description, '') ILIKE :like
          OR COALESCE(form.category, '') ILIKE :like
          OR COALESCE(form.area, '') ILIKE :like
          OR CAST(form.id AS text) ILIKE :like
        )`,
        { like },
      );
    }

    const totalResponsesQb = this.submissionsRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.form', 'form');

    this.applyResponsesScope(totalResponsesQb, grants);
    if (hasSearch) this.applySearchFilter(totalResponsesQb, like);

    const last30DaysQb = this.submissionsRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.form', 'form')
      .where('submission.submitted_at >= :from', { from: thirtyDaysAgo });

    this.applyResponsesScope(last30DaysQb, grants);
    if (hasSearch) this.applySearchFilter(last30DaysQb, like);

    const trendQb = this.submissionsRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.form', 'form')
      .select("DATE_TRUNC('day', submission.submitted_at)", 'day')
      .addSelect('COUNT(submission.id)', 'count')
      .where('submission.submitted_at >= :from', { from: thirtyDaysAgo });

    this.applyResponsesScope(trendQb, grants);
    if (hasSearch) this.applySearchFilter(trendQb, like);

    const recentSubmissionsQb = this.submissionsRepository
      .createQueryBuilder('submission')
      .leftJoinAndSelect('submission.form', 'form')
      .leftJoinAndSelect('submission.items', 'items')
      .leftJoinAndSelect('items.field', 'field')
      .orderBy('submission.submittedAt', 'DESC')
      .take(5);

    this.applyResponsesScope(recentSubmissionsQb, grants);
    if (hasSearch) this.applySearchFilter(recentSubmissionsQb, like);

    // ── Execute all queries in parallel ───────────────────────────────────────

    const [
      formsByStatus,
      totalResponses,
      last30Days,
      trendRaw,
      recentSubmissionsRaw,
      recentActivity,
    ] = await Promise.all([
      formsByStatusQb.getRawMany<{ status: FormStatus; count: string }>(),
      totalResponsesQb.getCount(),
      last30DaysQb.getCount(),
      trendQb
        .groupBy("DATE_TRUNC('day', submission.submitted_at)")
        .orderBy("DATE_TRUNC('day', submission.submitted_at)", 'ASC')
        .getRawMany<{ day: string; count: string }>(),
      recentSubmissionsQb.getMany(),
      grants.fullAccess
        ? this.auditService.findLatest(10)
        : this.auditService.findLatestByActor(actor.id, 10),
    ]);

    // ── Assemble response ─────────────────────────────────────────────────────

    const byStatus = Object.values(FormStatus).reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<FormStatus, number>,
    );

    for (const row of formsByStatus) {
      byStatus[row.status] = Number(row.count);
    }

    const totalForms = Object.values(byStatus).reduce((sum, value) => sum + value, 0);

    const trendMap = new Map(
      trendRaw.map((row) => [new Date(row.day).toISOString().slice(0, 10), Number(row.count)]),
    );

    const trendStart = new Date();
    trendStart.setUTCHours(0, 0, 0, 0);
    trendStart.setUTCDate(trendStart.getUTCDate() - 29);

    const responseTrendLast30Days = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(trendStart);
      day.setUTCDate(trendStart.getUTCDate() + index);
      const key = day.toISOString().slice(0, 10);
      return {
        date: key,
        count: trendMap.get(key) ?? 0,
      };
    });

    const recentSubmissions = recentSubmissionsRaw.map((submission) => ({
      id: submission.id,
      formId: submission.formId,
      formName: submission.form?.name ?? submission.formId,
      responderName: submission.responderName ?? null,
      responderEmail: this.resolveResponderEmail(submission),
      submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
    }));

    return {
      forms: {
        total: totalForms,
        byStatus,
      },
      responses: {
        total: totalResponses,
        last30Days,
      },
      responseTrendLast30Days,
      recentSubmissions,
      recentActivity,
    };
  }
}
