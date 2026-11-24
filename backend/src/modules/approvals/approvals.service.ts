import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  ApprovalApprovedEvent,
  ApprovalCancelledEvent,
  ApprovalCreatedEvent,
  ApprovalRejectedEvent,
} from '../../common/events/approval-events';
import {
  ApprovalDecisionEntity,
  ApprovalEntity,
  ApprovalStepEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  UserEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { MetricsService } from '../observability/metrics.service';
import {
  UserNoticeService,
  approvalLink,
  solicitationLink,
} from '../notifications/user-notice.service';
import { PermissionsService } from '../roles/permissions.service';
import { normalizeEmailAddress } from '../notifications/channels/address.util';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { DecideApprovalStepDto } from './dto/decide-approval-step.dto';
import {
  ExternalApprovalLinkService,
  MAX_EXTERNAL_APPROVERS_PER_APPROVAL,
} from './external/external-approval-link.service';

const TERMINAL_STATUSES: SolicitationStatus[] = [
  SolicitationStatus.COMPLETED,
  SolicitationStatus.CANCELLED,
  SolicitationStatus.REJECTED,
];

type ApprovalActor = JwtPayload | null;

/**
 * Quem está decidindo uma etapa: um usuário logado (checado por usuário/perfil) ou um aprovador
 * externo que já provou o link (checado pelo e-mail da etapa). O resto da regra é o mesmo.
 */
type StepDecider =
  | { kind: 'user'; actor: JwtPayload }
  | { kind: 'external'; email: string; ip: string | null };

type PlannedApprovalStep = {
  key: string;
  assignedUserId?: string;
  assignedRoleCode?: string;
  assignedEmail?: string;
};

/** Etapas na ordem pedida (chaves `user:`, `role:`, `email:`); o que não está na lista vai para o fim. */
export function orderApprovalSteps(
  steps: PlannedApprovalStep[],
  order: readonly string[] | undefined,
): PlannedApprovalStep[] {
  if (!order?.length) return steps;
  const rank = new Map(order.map((key, index) => [key, index]));
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => (rank.get(a.step.key) ?? order.length + a.index) - (rank.get(b.step.key) ?? order.length + b.index))
    .map(({ step }) => step);
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(ApprovalEntity)
    private readonly approvalsRepo: Repository<ApprovalEntity>,
    @InjectRepository(ApprovalStepEntity)
    private readonly stepsRepo: Repository<ApprovalStepEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly metricsService: MetricsService,
    private readonly permissionsService: PermissionsService,
    @Optional() private readonly userNotice?: UserNoticeService,
    @Optional() private readonly externalLinks?: ExternalApprovalLinkService,
  ) {}

  /**
   * Usuários que decidem AGORA nesta aprovação: titulares das etapas pendentes (nomeados) e quem
   * tem o perfil das etapas por perfil. Etapas em espera (sequencial) e externas (e-mail) ficam de
   * fora — o externo já recebe o link pessoal.
   */
  async pendingApproverUserIds(approvalId: string): Promise<string[]> {
    const steps = await this.stepsRepo.find({
      where: { approvalId, status: ApprovalStepStatus.PENDING },
    });
    const userIds = steps.map((step) => step.assignedUserId).filter((id): id is string => !!id);
    const roleCodes = steps.map((step) => step.assignedRoleCode).filter((code): code is string => !!code);
    if (roleCodes.length > 0) {
      const users = await this.usersRepo.find({
        where: { role: In(roleCodes), isActive: true },
        select: ['id'],
      });
      userIds.push(...users.map((user) => user.id));
    }
    return [...new Set(userIds)];
  }

  async createApproval(
    solicitationId: string,
    dto: CreateApprovalDto,
    actor: ApprovalActor,
    /** `notify: false`: sem push "aguarda sua decisão" — a aprovação vai ser decidida na mesma hora. */
    options: { notify?: boolean } = {},
  ): Promise<ApprovalEntity> {
    const actorId = actor?.sub ?? null;
    const mode = dto.mode ?? 'parallel';
    // E-mails de aprovadores: quem já tem usuário ativo decide logado (e recebe push); os demais viram
    // aprovadores externos e recebem um link pessoal por e-mail.
    const { userIds: emailUserIds, externalEmails } = await this.routeApproverEmails(dto.assignedEmails);
    const assignedUserIds = [...new Set([...(dto.assignedUserIds ?? []), ...emailUserIds])];
    const assignedRoleCodes = dto.assignedRoleCodes ?? [];
    if (assignedUserIds.length === 0 && assignedRoleCodes.length === 0 && externalEmails.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um usuário (assignedUserIds), perfil (assignedRoleCodes) ou e-mail (assignedEmails) para a aprovação.',
      );
    }
    if (externalEmails.length > MAX_EXTERNAL_APPROVERS_PER_APPROVAL) {
      throw new BadRequestException(
        `No máximo ${MAX_EXTERNAL_APPROVERS_PER_APPROVAL} aprovadores externos por aprovação (informados: ${externalEmails.length}).`,
      );
    }
    // Sem como mandar o link, a aprovação ficaria presa: recusa antes de criar qualquer coisa.
    if (externalEmails.length > 0) this.requireExternalLinks().assertDeliverable();
    const plannedSteps = orderApprovalSteps(
      [
        ...assignedUserIds.map((userId) => ({ key: `user:${userId}`, assignedUserId: userId })),
        ...assignedRoleCodes.map((roleCode) => ({ key: `role:${roleCode}`, assignedRoleCode: roleCode })),
        ...externalEmails.map((email) => ({ key: `email:${email}`, assignedEmail: email })),
      ],
      dto.assigneeOrder,
    );
    const pendingExternalStepIds: string[] = [];

    const approval = await this.dataSource.transaction(async (manager) => {
      const solicitation = await manager.findOne(SolicitationEntity, {
        where: { id: solicitationId },
      });
      if (!solicitation) throw new NotFoundException('Solicitação não encontrada.');
      if (TERMINAL_STATUSES.includes(solicitation.status as SolicitationStatus)) {
        throw new BadRequestException(
          `Não é possível criar aprovação para solicitação com status "${solicitation.status}".`,
        );
      }

      if (dto.phaseId) {
        const pendingForPhase = await manager.findOne(ApprovalEntity, {
          where: { solicitationId, phaseId: dto.phaseId, status: ApprovalStatus.PENDING },
        });
        if (pendingForPhase) {
          throw new BadRequestException('Já existe uma aprovação pendente para esta fase.');
        }
      }

      const created = manager.getRepository(ApprovalEntity).create({
        solicitationId,
        status: ApprovalStatus.PENDING,
        mode,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        // Em ordem ou "todos": cada etapa precisa aprovar; senão basta uma.
        requiredDecisions: mode === 'sequential' || dto.requireAll ? plannedSteps.length : 1,
        completedAt: null,
        cancelledAt: null,
        createdBy: actorId,
        phaseId: dto.phaseId ?? null,
      });
      const saved = await manager.getRepository(ApprovalEntity).save(created);

      let order = 1;
      for (const planned of plannedSteps) {
        const stepStatus =
          mode === 'sequential' && order > 1
            ? ApprovalStepStatus.WAITING
            : ApprovalStepStatus.PENDING;
        const step = manager.getRepository(ApprovalStepEntity).create({
          approvalId: saved.id,
          ...(planned.assignedUserId ? { assignedUserId: planned.assignedUserId } : {}),
          ...(planned.assignedRoleCode ? { assignedRoleCode: planned.assignedRoleCode } : {}),
          ...(planned.assignedEmail ? { assignedEmail: planned.assignedEmail } : {}),
          status: stepStatus,
          order: order++,
          decidedAt: null,
        });
        const savedStep = await manager.getRepository(ApprovalStepEntity).save(step);
        if (planned.assignedEmail && stepStatus === ApprovalStepStatus.PENDING) {
          pendingExternalStepIds.push(savedStep.id);
        }
      }

      if (dto.phaseId) {
        await this.registerSolicitationHistory(
          {
            solicitationId,
            eventType: SolicitationHistoryEventType.PHASE_APPROVAL_REQUESTED,
            actorId,
            message: `Aprovação de fase solicitada: "${saved.title}".`,
          },
          manager,
        );
      } else {
        const previousStatus = solicitation.status;
        solicitation.status = SolicitationStatus.WAITING_APPROVAL;
        await manager.getRepository(SolicitationEntity).save(solicitation);

        await this.registerSolicitationHistory(
          {
            solicitationId,
            eventType: SolicitationHistoryEventType.STATUS_CHANGED,
            actorId,
            fromValue: previousStatus,
            toValue: SolicitationStatus.WAITING_APPROVAL,
            message: `Aprovação iniciada: "${saved.title}".`,
          },
          manager,
        );
      }

      return saved;
    });

    const approvalWithSteps = await this.approvalsRepo.findOneOrFail({
      where: { id: approval.id },
      relations: { steps: true },
    });

    this.logger.log(
      {
        approvalId: approval.id,
        solicitationId,
        actorId: actorId ?? undefined,
        status: ApprovalStatus.PENDING,
      },
      'Approval created',
    );

    this.eventEmitter.emit(
      'approvals.created',
      new ApprovalCreatedEvent(actorId, approval.id, solicitationId, assignedUserIds),
    );

    // Sequencial: só a primeira etapa está com status PENDING de fato — notifica
    // seu(s) titular(es) (um usuário nomeado, ou todos que têm o papel da etapa).
    const notifySteps = mode === 'sequential' ? plannedSteps.slice(0, 1) : plannedSteps;
    const notifyRoleCodes = notifySteps
      .map((step) => step.assignedRoleCode)
      .filter((code): code is string => Boolean(code));
    const roleUserIds =
      notifyRoleCodes.length > 0
        ? (
            await this.usersRepo.find({
              where: { role: In(notifyRoleCodes), isActive: true },
              select: ['id'],
            })
          ).map((u) => u.id)
        : [];
    const notifyUserIds = [
      ...new Set([
        ...notifySteps
          .map((step) => step.assignedUserId)
          .filter((id): id is string => Boolean(id)),
        ...roleUserIds,
      ]),
    ];
    if (notifyUserIds.length > 0 && options.notify !== false) {
      void this.userNotice?.notify({
        kind: 'approval',
        userIds: notifyUserIds,
        title: 'Aprovação pendente',
        pushTitle: '✅ Aprovação pendente',
        body: `"${approvalWithSteps.title}" aguarda sua decisão.`,
        link: approvalLink(approval.id),
        solicitationId,
        pushData: { approvalId: approval.id, screen: 'ApprovalDetail' },
      });
    }

    await this.sendExternalLinks(pendingExternalStepIds, approval.id);

    await this.refreshPendingApprovalsMetric();

    return approvalWithSteps;
  }

  /**
   * Divide os e-mails informados em "tem usuário ativo" (decide logado) e "externo" (decide por link).
   * Normaliza, tira duplicados e ignora e-mails inválidos com erro claro.
   */
  private async routeApproverEmails(
    rawEmails: string[] | undefined,
  ): Promise<{ userIds: string[]; externalEmails: string[] }> {
    const emails: string[] = [];
    for (const raw of rawEmails ?? []) {
      const normalized = normalizeEmailAddress(raw);
      if (!normalized || normalized.length > 180) throw new BadRequestException('E-mail de aprovador inválido.');
      if (!emails.includes(normalized)) emails.push(normalized);
    }
    if (emails.length === 0) return { userIds: [], externalEmails: [] };

    const users = await this.usersRepo.find({
      where: { email: In(emails), isActive: true },
      select: ['id', 'email'],
    });
    const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));
    return {
      userIds: emails.filter((email) => byEmail.has(email)).map((email) => byEmail.get(email) as string),
      externalEmails: emails.filter((email) => !byEmail.has(email)),
    };
  }

  private requireExternalLinks(): ExternalApprovalLinkService {
    if (!this.externalLinks) {
      throw new BadRequestException('Aprovação por e-mail não está disponível neste ambiente.');
    }
    return this.externalLinks;
  }

  /** Envia (ou tenta) o link de cada etapa externa pendente; falha de envio nunca desfaz a aprovação. */
  /**
   * Resultado da aprovação para quem a pediu e — na aprovação da solicitação (não de fase), que
   * muda o status dela — para o solicitante. Quem decidiu por último já sabe.
   */
  private async notifyConclusion(
    approval: ApprovalEntity,
    status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED,
    actorId: string | null,
    comment: string | undefined,
  ): Promise<void> {
    if (!this.userNotice) return;
    try {
      const solicitation = approval.phaseId
        ? null
        : await this.dataSource.getRepository(SolicitationEntity).findOne({
            where: { id: approval.solicitationId },
            select: ['id', 'createdBy'],
          });
      const approved = status === ApprovalStatus.APPROVED;
      const reason = !approved && comment?.trim() ? ` Motivo: ${comment.trim()}` : '';
      await this.userNotice.notify({
        kind: approved ? 'approval_approved' : 'approval_rejected',
        userIds: [approval.createdBy, solicitation?.createdBy],
        exceptUserIds: [actorId],
        title: approved ? 'Aprovação concluída' : 'Aprovação reprovada',
        pushTitle: approved ? '✅ Aprovação concluída' : '❌ Aprovação reprovada',
        body: `"${approval.title}" foi ${approved ? 'aprovada' : 'reprovada'}.${reason}`,
        link: solicitationLink(approval.solicitationId),
        solicitationId: approval.solicitationId,
        pushData: { approvalId: approval.id },
      });
    } catch (error) {
      this.logger.warn(
        `Aviso do resultado da aprovação ${approval.id} falhou: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async sendExternalLinks(stepIds: string[], approvalId: string): Promise<void> {
    for (const stepId of stepIds) {
      try {
        const result = await this.requireExternalLinks().issueAndSend(stepId);
        if (!result.sent) {
          this.logger.warn(
            { approvalId, stepId, error: result.error },
            'Link de aprovação externa não enviado — use "Reenviar link"',
          );
        }
      } catch (error) {
        this.logger.warn(
          { approvalId, stepId, error: error instanceof Error ? error.message : String(error) },
          'Falha ao emitir o link de aprovação externa',
        );
      }
    }
  }

  /**
   * `canViewAll` (passado pela rota) diz se a pessoa tem "ver todas as aprovações" no processo do
   * card. Sem isso, só as aprovações em que ela é chamada. Sem a função (chamada interna), vale o
   * escopo de `approvals.decide` do perfil.
   */
  async findBySolicitation(
    solicitationId: string,
    actor: JwtPayload,
    canViewAll?: () => Promise<boolean>,
  ): Promise<ApprovalEntity[]> {
    const approvals = await this.approvalsRepo.find({
      where: { solicitationId },
      relations: { steps: { decision: true, assignedUser: true, assignedRole: true } },
      // As etapas vêm ordenadas: no modo sequencial a tela mostra a fila na ordem de decisão.
      order: { createdAt: 'ASC', steps: { order: 'ASC' } },
    });

    const viewAll = canViewAll
      ? await canViewAll()
      : (await this.permissionsService.getScope(actor.role, 'approvals.decide')) === 'all';
    if (viewAll) return approvals;
    return approvals.filter((approval) => this.isAssignedToApproval(approval, actor));
  }

  findMyPending(actor: JwtPayload): Promise<ApprovalStepEntity[]> {
    return this.stepsRepo.find({
      where: [
        { assignedUserId: actor.sub, status: ApprovalStepStatus.PENDING },
        { assignedRoleCode: actor.role, status: ApprovalStepStatus.PENDING },
      ],
      relations: {
        approval: {
          solicitation: { createdByUser: true },
        },
        decision: true,
      },
      order: { approval: { createdAt: 'ASC' } },
    });
  }

  /** Quem foi chamado a aprovar sempre abre; os demais, com "ver todas as aprovações" no processo. */
  async findById(
    approvalId: string,
    actor: JwtPayload,
    canViewAll?: (solicitationId: string) => Promise<boolean>,
  ): Promise<ApprovalEntity> {
    const approval = await this.approvalsRepo.findOneOrFail({
      where: { id: approvalId },
      relations: {
        steps: { decision: true, assignedUser: true, assignedRole: true },
        solicitation: { createdByUser: true, history: { actor: true } },
      },
      order: { steps: { order: 'ASC' } },
    });

    if (this.isAssignedToApproval(approval, actor)) return approval;
    const viewAll = canViewAll
      ? await canViewAll(approval.solicitationId)
      : (await this.permissionsService.getScope(actor.role, 'approvals.decide')) === 'all';
    if (!viewAll) {
      throw new ForbiddenException('Acesso negado.');
    }

    return approval;
  }

  /** Card de uma aprovação — a rota confere o processo antes de cancelar. */
  async findSolicitationIdOfApproval(approvalId: string): Promise<string> {
    const approval = await this.approvalsRepo.findOne({
      where: { id: approvalId },
      select: { id: true, solicitationId: true },
    });
    if (!approval) throw new NotFoundException('Aprovação não encontrada.');
    return approval.solicitationId;
  }

  /** Card da etapa — a rota confere o processo antes de reenviar o link. */
  async findSolicitationIdOfStep(stepId: string): Promise<string> {
    const step = await this.stepsRepo.findOne({
      where: { id: stepId },
      relations: { approval: true },
    });
    if (!step?.approval) throw new NotFoundException('Etapa de aprovação não encontrada.');
    return step.approval.solicitationId;
  }

  private isAssignedToApproval(approval: ApprovalEntity, actor: JwtPayload): boolean {
    return (approval.steps ?? []).some(
      (step) => step.assignedUserId === actor.sub || step.assignedRoleCode === actor.role,
    );
  }

  /** Decisão de um usuário logado (usuário nomeado ou perfil da etapa). */
  approveStep(
    stepId: string,
    dto: DecideApprovalStepDto,
    actor: JwtPayload,
  ): Promise<ApprovalStepEntity> {
    return this.decideStep(stepId, dto, { kind: 'user', actor });
  }

  /**
   * Decisão de um aprovador externo. Quem chama (ExternalApprovalsService) JÁ validou o token e a
   * confirmação do e-mail; aqui só se confere que o e-mail é o da etapa e se aplica a mesma regra de
   * decisão do usuário logado.
   */
  decideExternalStep(
    stepId: string,
    dto: DecideApprovalStepDto,
    external: { email: string; ip: string | null },
  ): Promise<ApprovalStepEntity> {
    return this.decideStep(stepId, dto, { kind: 'external', ...external });
  }

  private async decideStep(
    stepId: string,
    dto: DecideApprovalStepDto,
    decider: StepDecider,
  ): Promise<ApprovalStepEntity> {
    if (dto.decision === 'rejected' && !dto.comment?.trim()) {
      throw new BadRequestException('Comentário obrigatório na reprovação.');
    }
    const actorId = decider.kind === 'user' ? decider.actor.sub : null;
    const decidedVia = decider.kind === 'external' ? 'email_link' : 'system';
    const decidedByEmail = decider.kind === 'external' ? decider.email : null;
    const byExternal = decider.kind === 'external' ? ` Decidido por aprovador externo (${decider.email}).` : '';

    const result = await this.dataSource.transaction(async (manager) => {
      const step = await manager.findOne(ApprovalStepEntity, {
        where: { id: stepId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!step) throw new NotFoundException('Etapa de aprovação não encontrada.');
      const authorized =
        decider.kind === 'user'
          ? step.assignedUserId === decider.actor.sub || step.assignedRoleCode === decider.actor.role
          : Boolean(step.assignedEmail) && step.assignedEmail === decider.email;
      if (!authorized) {
        throw new ForbiddenException('Você não tem permissão para decidir esta etapa.');
      }
      if (step.status !== ApprovalStepStatus.PENDING) {
        throw new BadRequestException(`Esta etapa já foi decidida (status: "${step.status}").`);
      }

      const existingDecision = await manager.findOne(ApprovalDecisionEntity, {
        where: { approvalStepId: stepId },
      });
      if (existingDecision) {
        throw new BadRequestException('Esta etapa já possui uma decisão registrada.');
      }

      const approval = await manager.findOneOrFail(ApprovalEntity, {
        where: { id: step.approvalId },
      });
      if (approval.status !== ApprovalStatus.PENDING) {
        throw new BadRequestException(
          `A aprovação não está mais pendente (status: "${approval.status}").`,
        );
      }

      const decision = manager.getRepository(ApprovalDecisionEntity).create({
        approvalStepId: stepId,
        decidedByUserId: actorId,
        decidedByEmail,
        decidedVia,
        decidedIp: decider.kind === 'external' ? decider.ip : null,
        decision: dto.decision,
        comment: dto.comment?.trim() ?? null,
        decidedAt: new Date(),
      });
      await manager.getRepository(ApprovalDecisionEntity).save(decision);

      step.status =
        dto.decision === 'approved' ? ApprovalStepStatus.APPROVED : ApprovalStepStatus.REJECTED;
      step.decidedAt = new Date();
      await manager.getRepository(ApprovalStepEntity).save(step);

      let conclusionStatus: ApprovalStatus | null = null;
      let newSolicitationStatus: SolicitationStatus | null = null;
      let nextStepForNotify: ApprovalStepEntity | null = null;

      if (dto.decision === 'rejected') {
        conclusionStatus = ApprovalStatus.REJECTED;
        newSolicitationStatus = SolicitationStatus.REJECTED;

        const stepsToSkip = await manager.find(ApprovalStepEntity, {
          where: [
            { approvalId: approval.id, status: ApprovalStepStatus.PENDING },
            { approvalId: approval.id, status: ApprovalStepStatus.WAITING },
          ],
        });
        for (const s of stepsToSkip) {
          s.status = ApprovalStepStatus.SKIPPED;
          await manager.getRepository(ApprovalStepEntity).save(s);
        }
      } else if (approval.mode === 'sequential') {
        const waitingSteps = await manager.find(ApprovalStepEntity, {
          where: { approvalId: approval.id, status: ApprovalStepStatus.WAITING },
          order: { order: 'ASC' },
        });
        if (waitingSteps.length > 0) {
          const next = waitingSteps[0];
          next.status = ApprovalStepStatus.PENDING;
          await manager.getRepository(ApprovalStepEntity).save(next);
          nextStepForNotify = next;
        } else {
          const approvedCount = await manager.count(ApprovalStepEntity, {
            where: { approvalId: approval.id, status: ApprovalStepStatus.APPROVED },
          });
          if (approvedCount >= approval.requiredDecisions) {
            conclusionStatus = ApprovalStatus.APPROVED;
            newSolicitationStatus = SolicitationStatus.APPROVED;
          }
        }
      } else {
        const approvedCount = await manager.count(ApprovalStepEntity, {
          where: { approvalId: approval.id, status: ApprovalStepStatus.APPROVED },
        });
        if (approvedCount >= approval.requiredDecisions) {
          conclusionStatus = ApprovalStatus.APPROVED;
          newSolicitationStatus = SolicitationStatus.APPROVED;
        }
      }

      if (conclusionStatus) {
        approval.status = conclusionStatus;
        approval.completedAt = new Date();
        await manager.getRepository(ApprovalEntity).save(approval);

        // "Basta um": aprovada, as etapas que ainda esperavam não precisam mais decidir.
        if (conclusionStatus === ApprovalStatus.APPROVED) {
          const leftover = await manager.find(ApprovalStepEntity, {
            where: [
              { approvalId: approval.id, status: ApprovalStepStatus.PENDING },
              { approvalId: approval.id, status: ApprovalStepStatus.WAITING },
            ],
          });
          for (const s of leftover) {
            s.status = ApprovalStepStatus.SKIPPED;
            await manager.getRepository(ApprovalStepEntity).save(s);
          }
        }

        if (approval.phaseId) {
          await this.registerSolicitationHistory(
            {
              solicitationId: approval.solicitationId,
              eventType:
                conclusionStatus === ApprovalStatus.APPROVED
                  ? SolicitationHistoryEventType.PHASE_APPROVAL_APPROVED
                  : SolicitationHistoryEventType.PHASE_APPROVAL_REJECTED,
              actorId,
              message:
                (conclusionStatus === ApprovalStatus.APPROVED
                  ? `Aprovação de fase concluída: "${approval.title}".`
                  : `Aprovação de fase reprovada: "${approval.title}". Motivo: ${dto.comment ?? '—'}`) +
                byExternal,
            },
            manager,
          );
        } else if (newSolicitationStatus) {
          const solicitation = await manager.findOneOrFail(SolicitationEntity, {
            where: { id: approval.solicitationId },
          });
          const previousStatus = solicitation.status;
          solicitation.status = newSolicitationStatus;
          await manager.getRepository(SolicitationEntity).save(solicitation);

          await this.registerSolicitationHistory(
            {
              solicitationId: approval.solicitationId,
              eventType: SolicitationHistoryEventType.STATUS_CHANGED,
              actorId,
              fromValue: previousStatus,
              toValue: newSolicitationStatus,
              message:
                (conclusionStatus === ApprovalStatus.APPROVED
                  ? `Aprovação concluída: "${approval.title}".`
                  : `Aprovação reprovada: "${approval.title}". Motivo: ${dto.comment ?? '—'}`) +
                byExternal,
            },
            manager,
          );
        }
      }

      return { step, approval, conclusionStatus, nextStepForNotify };
    });

    if (result.conclusionStatus === ApprovalStatus.APPROVED) {
      this.eventEmitter.emit(
        'approvals.approved',
        new ApprovalApprovedEvent(
          actorId,
          result.approval.id,
          result.approval.solicitationId,
          0,
          decidedVia,
          decidedByEmail,
        ),
      );
    } else if (result.conclusionStatus === ApprovalStatus.REJECTED) {
      this.eventEmitter.emit(
        'approvals.rejected',
        new ApprovalRejectedEvent(
          actorId,
          result.approval.id,
          result.approval.solicitationId,
          stepId,
          0,
          decidedVia,
          decidedByEmail,
        ),
      );
    }

    const nextRoleUserIds = result.nextStepForNotify?.assignedRoleCode
      ? (
          await this.usersRepo.find({
            where: { role: result.nextStepForNotify.assignedRoleCode, isActive: true },
            select: ['id'],
          })
        ).map((u) => u.id)
      : [];
    const nextUserIds = result.nextStepForNotify?.assignedUserId
      ? [result.nextStepForNotify.assignedUserId]
      : nextRoleUserIds;
    if (nextUserIds.length > 0) {
      void this.userNotice?.notify({
        kind: 'approval',
        userIds: nextUserIds,
        title: 'Aprovação pendente',
        pushTitle: '✅ Aprovação pendente',
        body: `"${result.approval.title}" aguarda sua decisão.`,
        link: approvalLink(result.approval.id),
        solicitationId: result.approval.solicitationId,
        pushData: { approvalId: result.approval.id, screen: 'ApprovalDetail' },
      });
    }

    if (
      result.conclusionStatus === ApprovalStatus.APPROVED ||
      result.conclusionStatus === ApprovalStatus.REJECTED
    ) {
      void this.notifyConclusion(result.approval, result.conclusionStatus, actorId, dto.comment);
    }

    if (result.nextStepForNotify?.assignedEmail) {
      await this.sendExternalLinks([result.nextStepForNotify.id], result.approval.id);
    }

    await this.refreshPendingApprovalsMetric();

    if (result.conclusionStatus) {
      this.metricsService.incrementApprovalsDecided(dto.decision);
    }

    const finalApprovalStatus = result.conclusionStatus ?? ApprovalStatus.PENDING;
    this.logger.log(
      {
        approvalId: result.approval.id,
        solicitationId: result.approval.solicitationId,
        actorId: actorId ?? undefined,
        via: decidedVia,
        status: finalApprovalStatus,
      },
      'Approval step decided',
    );

    return this.stepsRepo.findOneOrFail({
      where: { id: stepId },
      relations: { decision: true, approval: true },
    });
  }

  /**
   * Reenvia o link de uma etapa externa pendente (e-mail perdido, link expirado ou bloqueado). Gera um
   * token NOVO — o anterior deixa de valer. A rota exige "pedir e cancelar aprovações" no processo do
   * card, como cancelar.
   */
  async resendExternalLink(
    stepId: string,
    actor: JwtPayload,
  ): Promise<{ sent: boolean; sentTo: string; error?: string }> {
    const step = await this.stepsRepo.findOne({ where: { id: stepId } });
    if (!step) throw new NotFoundException('Etapa de aprovação não encontrada.');
    if (!step.assignedEmail) {
      throw new BadRequestException('Esta etapa não é de um aprovador externo.');
    }
    const result = await this.requireExternalLinks().issueAndSend(stepId);
    this.logger.log(
      { stepId, approvalId: step.approvalId, actorId: actor.sub, sent: result.sent },
      'Link de aprovação externa reenviado',
    );
    return { sent: result.sent, sentTo: step.assignedEmail, ...(result.error ? { error: result.error } : {}) };
  }

  /** A rota confere "pedir e cancelar aprovações" no processo do card. */
  async cancelApproval(approvalId: string, actor: JwtPayload): Promise<ApprovalEntity> {

    const approval = await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(ApprovalEntity, {
        where: { id: approvalId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!found) throw new NotFoundException('Aprovação não encontrada.');
      if (found.status !== ApprovalStatus.PENDING) {
        throw new BadRequestException(
          `Apenas aprovações pendentes podem ser canceladas (status atual: "${found.status}").`,
        );
      }

      found.status = ApprovalStatus.CANCELLED;
      found.cancelledAt = new Date();
      await manager.getRepository(ApprovalEntity).save(found);

      const stepsToSkip = await manager.find(ApprovalStepEntity, {
        where: [
          { approvalId, status: ApprovalStepStatus.PENDING },
          { approvalId, status: ApprovalStepStatus.WAITING },
        ],
      });
      for (const s of stepsToSkip) {
        s.status = ApprovalStepStatus.SKIPPED;
        await manager.getRepository(ApprovalStepEntity).save(s);
      }

      return found;
    });

    this.logger.log(
      {
        approvalId,
        solicitationId: approval.solicitationId,
        actorId: actor.sub,
        status: ApprovalStatus.CANCELLED,
      },
      'Approval cancelled',
    );

    this.eventEmitter.emit(
      'approvals.cancelled',
      new ApprovalCancelledEvent(actor.sub, approvalId, approval.solicitationId),
    );

    return this.approvalsRepo.findOneOrFail({
      where: { id: approvalId },
      relations: { steps: { decision: true } },
    });
  }

  private registerSolicitationHistory(
    input: {
      solicitationId: string;
      eventType: SolicitationHistoryEventType;
      actorId: string | null;
      fromValue?: string | null;
      toValue?: string | null;
      message?: string | null;
    },
    manager: EntityManager,
  ): Promise<SolicitationHistoryEntity> {
    const repo = manager.getRepository(SolicitationHistoryEntity);
    const entry = repo.create({
      solicitationId: input.solicitationId,
      eventType: input.eventType,
      actorId: input.actorId,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      message: input.message ?? null,
      metadata: null,
    });
    return repo.save(entry);
  }

  private async refreshPendingApprovalsMetric(): Promise<void> {
    try {
      const pending = await this.approvalsRepo.count({
        where: { status: ApprovalStatus.PENDING },
      });
      this.metricsService.setApprovalsPendingTotal(pending);
    } catch (error) {
      this.logger.warn(
        `Unable to refresh pending approvals metric: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
