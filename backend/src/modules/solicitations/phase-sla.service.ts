import { createHash } from 'crypto';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Not, Repository } from 'typeorm';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  KanbanPhaseEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  SolicitationPhasePeriodEntity,
  UserEntity,
} from '../../database/entities';
import { phaseActors } from '../kanban-phases/phase-people';
import {
  computePhaseDueAt,
  hasPhaseSla,
  phaseSlaProgress,
  warningPercentOf,
  type PhaseSlaState,
} from '../kanban-phases/phase-sla';
import { ExpoPushService } from '../notifications/expo-push.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { effectivePhaseDueAt, phaseEnteredAtOf } from './phase-periods';
import { SolicitationsService } from './solicitations.service';

const TERMINAL_STATUSES = [
  SolicitationStatus.COMPLETED,
  SolicitationStatus.CANCELLED,
  SolicitationStatus.REJECTED,
];
const MAX_PHASE_SLA_BATCH = 500;

/** Uma passagem do card por uma fase, como a linha do tempo mostra. */
export type PhaseTimelineEntry = {
  phaseId: string | null;
  phaseLabel: string;
  enteredAt: string;
  leftAt: string | null;
  dueAt: string | null;
  businessHours: boolean;
  extended: boolean;
  /** Tempo corrido na fase (até agora, se é a atual). */
  durationMinutes: number;
  current: boolean;
  /**
   * Fase encerrada: 'on_time' | 'late'. Fase atual: o estado do prazo agora. 'no_sla' = sem prazo.
   */
  status: 'no_sla' | 'on_time' | 'late' | PhaseSlaState;
};

export type PhaseSlaEvent = {
  solicitationId: string;
  phaseId: string;
  phaseLabel: string;
  enteredAt: string;
};

export type PhaseSlaCheckResult = { processed: number; warned: number; breached: number };

/**
 * Prazo (SLA) por fase do Kanban: linha do tempo do card, prorrogação e a verificação periódica que
 * avisa quem atua na fase quando o prazo entra em alerta ou vence (e dispara os fluxos de SLA com
 * "prazo da fase"). As regras de prazo estão em kanban-phases/phase-sla.ts.
 */
@Injectable()
export class PhaseSlaService {
  private readonly logger = new Logger(PhaseSlaService.name);

  constructor(
    private readonly solicitationsService: SolicitationsService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    @InjectRepository(KanbanPhaseEntity)
    private readonly phasesRepository: Repository<KanbanPhaseEntity>,
    @InjectRepository(SolicitationPhasePeriodEntity)
    private readonly periodsRepository: Repository<SolicitationPhasePeriodEntity>,
    @InjectRepository(SolicitationHistoryEntity)
    private readonly historyRepository: Repository<SolicitationHistoryEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly expoPushService?: ExpoPushService,
  ) {}

  /** Fase em que o card está: a atual ou, sem nenhuma, a 1ª do formulário (como o board). */
  private async currentPhaseOf(
    solicitation: SolicitationEntity,
  ): Promise<KanbanPhaseEntity | null> {
    if (!solicitation.formId) return null;
    const phases = await this.phasesRepository.find({
      where: { formId: solicitation.formId },
      order: { order: 'ASC' },
    });
    return phases.find((phase) => phase.id === solicitation.currentPhaseId) ?? phases[0] ?? null;
  }

  async getTimeline(id: string, actor: JwtPayload): Promise<PhaseTimelineEntry[]> {
    const solicitation = await this.solicitationsService.findOne(id, actor);
    const periods = await this.periodsRepository.find({
      where: { solicitationId: id },
      order: { enteredAt: 'ASC' },
    });
    const phase = await this.currentPhaseOf(solicitation);
    const now = new Date();

    const entries = periods.map((period) =>
      this.toEntry(period, period.leftAt === null ? phase : null, solicitation, now),
    );
    // Card sem passagem aberta (criado antes do SLA por fase, ou nunca movido): a fase atual entra
    // a partir da entrada conhecida.
    if (phase && !periods.some((period) => period.leftAt === null)) {
      entries.push(
        this.toEntry(
          {
            phaseId: phase.id,
            phaseLabel: phase.label,
            enteredAt: phaseEnteredAtOf(solicitation),
            leftAt: null,
            dueAt: null,
            slaBusinessHours: phase.slaBusinessHours,
            extended: Boolean(solicitation.phaseDueAt),
          },
          phase,
          solicitation,
          now,
        ),
      );
    }
    return entries;
  }

  private toEntry(
    period: Pick<
      SolicitationPhasePeriodEntity,
      'phaseId' | 'phaseLabel' | 'enteredAt' | 'leftAt' | 'dueAt' | 'slaBusinessHours' | 'extended'
    >,
    currentPhase: KanbanPhaseEntity | null,
    solicitation: SolicitationEntity,
    now: Date,
  ): PhaseTimelineEntry {
    const current = period.leftAt === null;
    const end = period.leftAt ?? now;
    // Fase atual: o prazo vivo (configuração de agora ou prorrogação); encerrada: o que valia.
    const dueAt = current ? effectivePhaseDueAt(solicitation, currentPhase) : period.dueAt;
    const businessHours = current
      ? (currentPhase?.slaBusinessHours ?? false)
      : period.slaBusinessHours;
    let status: PhaseTimelineEntry['status'] = 'no_sla';
    if (dueAt && current && currentPhase) {
      status = phaseSlaProgress(period.enteredAt, dueAt, {
        businessHours,
        warningPercent: warningPercentOf(currentPhase),
        now,
      }).state;
    } else if (dueAt) {
      status = end.getTime() <= dueAt.getTime() ? 'on_time' : 'late';
    }
    return {
      phaseId: period.phaseId,
      phaseLabel: period.phaseLabel,
      enteredAt: period.enteredAt.toISOString(),
      leftAt: period.leftAt?.toISOString() ?? null,
      dueAt: dueAt?.toISOString() ?? null,
      businessHours,
      extended: current ? Boolean(solicitation.phaseDueAt) : period.extended,
      durationMinutes: Math.max(
        0,
        Math.round((end.getTime() - period.enteredAt.getTime()) / 60_000),
      ),
      current,
      status,
    };
  }

  /**
   * Prorroga (ou antecipa) o prazo do card na fase atual. Fica no histórico com quem fez, o prazo de
   * antes e o novo, e o motivo. O aviso volta a valer para o prazo novo.
   */
  async extend(
    id: string,
    input: { dueAt: string; reason?: string },
    actor: JwtPayload,
  ): Promise<PhaseTimelineEntry[]> {
    const solicitation = await this.solicitationsService.findOne(id, actor);
    const phase = await this.currentPhaseOf(solicitation);
    if (!phase || !hasPhaseSla(phase)) {
      throw new BadRequestException('A fase atual deste card não tem prazo.');
    }
    const dueAt = new Date(input.dueAt);
    if (Number.isNaN(dueAt.getTime()))
      throw new BadRequestException('Data do novo prazo inválida.');
    if (dueAt.getTime() <= Date.now()) {
      throw new BadRequestException('O novo prazo precisa ser no futuro.');
    }

    const previousDue = effectivePhaseDueAt(solicitation, phase);
    await this.solicitationsRepository.update(id, { phaseDueAt: dueAt, phaseSlaStatus: null });
    const open = await this.periodsRepository.findOne({
      where: { solicitationId: id, leftAt: IsNull() },
      order: { enteredAt: 'DESC' },
    });
    if (open) await this.periodsRepository.save({ ...open, dueAt, extended: true });

    const reason = input.reason?.trim() ? input.reason.trim() : null;
    await this.historyRepository.save(
      this.historyRepository.create({
        solicitationId: id,
        eventType: SolicitationHistoryEventType.PHASE_SLA_EXTENDED,
        actorId: actor.sub,
        fromValue: previousDue?.toISOString() ?? null,
        toValue: dueAt.toISOString(),
        message: `Prazo da fase "${phase.label}" alterado para ${formatDateTime(dueAt)}${reason ? ` — ${reason}` : ''}.`,
        metadata: { phaseId: phase.id, reason },
      }),
    );
    return this.getTimeline(id, actor);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkPhaseDeadlines(): Promise<PhaseSlaCheckResult> {
    const result: PhaseSlaCheckResult = { processed: 0, warned: 0, breached: 0 };
    const slaPhases = (
      await this.phasesRepository.find({ where: { slaHours: Not(IsNull()) } })
    ).filter(hasPhaseSla);
    if (slaPhases.length === 0) return result;

    // Card sem fase (nunca movido) está na 1ª fase do formulário: vale o prazo dela.
    const formIds = [...new Set(slaPhases.map((phase) => phase.formId))];
    const formPhases = await this.phasesRepository.find({
      where: { formId: In(formIds) },
      order: { order: 'ASC' },
    });
    const firstPhaseByForm = new Map<string, KanbanPhaseEntity>();
    for (const phase of formPhases)
      if (!firstPhaseByForm.has(phase.formId)) firstPhaseByForm.set(phase.formId, phase);
    const formsWithFirstSla = [...firstPhaseByForm.values()]
      .filter(hasPhaseSla)
      .map((phase) => phase.formId);
    const phaseById = new Map(formPhases.map((phase) => [phase.id, phase]));

    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .where('solicitation.status NOT IN (:...terminal)', { terminal: TERMINAL_STATUSES })
      .andWhere(
        new Brackets((where) => {
          where.where('solicitation.current_phase_id IN (:...slaPhaseIds)', {
            slaPhaseIds: slaPhases.map((phase) => phase.id),
          });
          if (formsWithFirstSla.length) {
            where.orWhere(
              '(solicitation.current_phase_id IS NULL AND solicitation.form_id IN (:...firstSlaForms))',
              {
                firstSlaForms: formsWithFirstSla,
              },
            );
          }
        }),
      )
      .orderBy('solicitation.created_at', 'ASC')
      .take(MAX_PHASE_SLA_BATCH);
    const solicitations = await qb.getMany();

    const now = new Date();
    for (const solicitation of solicitations) {
      const phase = solicitation.currentPhaseId
        ? phaseById.get(solicitation.currentPhaseId)
        : solicitation.formId
          ? firstPhaseByForm.get(solicitation.formId)
          : undefined;
      if (!phase || !hasPhaseSla(phase)) continue;
      result.processed += 1;
      const transition = await this.updateState(solicitation, phase, now);
      if (transition === 'warning') result.warned += 1;
      if (transition === 'breached') result.breached += 1;
    }
    if (result.warned || result.breached) {
      this.logger.log(result, 'Phase SLA check');
    }
    return result;
  }

  private async updateState(
    solicitation: SolicitationEntity,
    phase: KanbanPhaseEntity,
    now: Date,
  ): Promise<'warning' | 'breached' | 'none'> {
    const enteredAt = phaseEnteredAtOf(solicitation);
    const dueAt = solicitation.phaseDueAt ?? computePhaseDueAt(enteredAt, phase);
    if (!dueAt) return 'none';
    const { state } = phaseSlaProgress(enteredAt, dueAt, {
      businessHours: phase.slaBusinessHours,
      warningPercent: warningPercentOf(phase),
      now,
    });
    const notified = solicitation.phaseSlaStatus;
    if (state === 'on_track') {
      // Prazo prorrogado ou fase com prazo maior: o aviso volta a valer.
      if (notified)
        await this.solicitationsRepository.update(solicitation.id, { phaseSlaStatus: null });
      return 'none';
    }
    if (state === notified || (state === 'warning' && notified === 'breached')) return 'none';

    await this.solicitationsRepository.update(solicitation.id, { phaseSlaStatus: state });
    const event: PhaseSlaEvent = {
      solicitationId: solicitation.id,
      phaseId: phase.id,
      phaseLabel: phase.label,
      enteredAt: enteredAt.toISOString(),
    };
    this.eventEmitter.emit(`solicitations.phase_sla.${state}`, event);
    await this.notifyActors(solicitation, phase, state, dueAt);
    return state;
  }

  /** Quem atua na fase (perfis e usuários); fase aberta a todos → o responsável do card. */
  private async recipientsFor(
    solicitation: SolicitationEntity,
    phase: KanbanPhaseEntity,
  ): Promise<string[]> {
    const actors = phaseActors(phase);
    if (!actors) return solicitation.assigneeId ? [solicitation.assigneeId] : [];
    const byRole = actors.roleCodes.length
      ? await this.usersRepository.find({
          where: { role: In(actors.roleCodes), isActive: true },
          select: ['id'],
        })
      : [];
    return [...new Set([...byRole.map((user) => user.id), ...actors.userIds])];
  }

  private async notifyActors(
    solicitation: SolicitationEntity,
    phase: KanbanPhaseEntity,
    state: 'warning' | 'breached',
    dueAt: Date,
  ): Promise<void> {
    try {
      const userIds = await this.recipientsFor(solicitation, phase);
      if (userIds.length === 0) return;
      const title =
        state === 'breached'
          ? `Prazo vencido na fase "${phase.label}"`
          : `Prazo perto de vencer na fase "${phase.label}"`;
      const body =
        state === 'breached'
          ? `${solicitation.title} passou do prazo da fase (${formatDateTime(dueAt)}).`
          : `${solicitation.title} vence na fase em ${formatDateTime(dueAt)}.`;

      if (this.notificationsService) {
        const enqueued = await this.notificationsService.enqueue({
          channel: 'in_app',
          title,
          body,
          priority: state === 'breached' ? 'high' : 'normal',
          recipients: userIds.map((userId) => ({ source: 'user' as const, userId })),
          // Uma vez por estado em cada passagem/prazo. Hash: a coluna tem 100 caracteres.
          idempotencyKey: `phase-sla:${createHash('sha256')
            .update(
              [
                solicitation.id,
                phase.id,
                phaseEnteredAtOf(solicitation).toISOString(),
                dueAt.toISOString(),
                state,
              ].join('|'),
            )
            .digest('hex')}`,
          origin: { solicitationId: solicitation.id },
          metadata: { kind: 'phase_sla', state, phaseId: phase.id },
        });
        if (enqueued.created) await this.notificationsService.dispatch(enqueued.message.id);
      }
      void this.expoPushService?.sendToUsers(userIds, {
        title: state === 'breached' ? `🚨 ${title}` : `⚠️ ${title}`,
        body,
        data: { type: `phase_sla_${state}`, solicitationId: solicitation.id },
      });
    } catch (error) {
      this.logger.warn(
        `Phase SLA notification failed for ${solicitation.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
