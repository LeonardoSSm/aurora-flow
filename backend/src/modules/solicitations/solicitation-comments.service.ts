import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  FormEntity,
  SolicitationCommentEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { UserNoticeService, solicitationLink } from '../notifications/user-notice.service';
import { PermissionsService } from '../roles/permissions.service';
import { ProcessAccessService } from '../access/process-access.service';

@Injectable()
export class SolicitationCommentsService {
  constructor(
    @InjectRepository(SolicitationCommentEntity)
    private readonly commentsRepo: Repository<SolicitationCommentEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(FormEntity)
    private readonly formsRepo: Repository<FormEntity>,
    @InjectRepository(SolicitationHistoryEntity)
    private readonly historyRepo: Repository<SolicitationHistoryEntity>,
    private readonly permissionsService: PermissionsService,
    private readonly processAccess: ProcessAccessService,
    @Optional() private readonly userNotice?: UserNoticeService,
  ) {}

  async addPublicComment(
    token: string,
    dto: { content: string; authorName?: string; authorEmail?: string },
  ): Promise<SolicitationCommentEntity> {
    const solicitation = await this.solicitationsRepo.findOne({
      where: { trackingToken: token },
    });
    if (!solicitation) throw new NotFoundException('Solicitação não encontrada.');

    const content = dto.content?.trim() ?? '';
    if (!content) throw new BadRequestException('Conteúdo não pode ser vazio.');
    if (content.length > 2000) {
      throw new BadRequestException('Conteúdo excede 2000 caracteres.');
    }

    const comment = this.commentsRepo.create({
      solicitationId: solicitation.id,
      content,
      isInternal: false,
      authorType: 'requester',
      authorName: dto.authorName?.trim() ?? null,
      authorEmail: dto.authorEmail?.trim() ?? null,
      authorUserId: null,
    });
    const saved = await this.commentsRepo.save(comment);

    if (solicitation.assigneeId) {
      void this.userNotice?.notify({
        kind: 'comment',
        userIds: [solicitation.assigneeId],
        title: 'Novo comentário do solicitante',
        pushTitle: '💬 Novo comentário do solicitante',
        body: `${comment.authorName ?? 'Solicitante'} comentou em "${solicitation.title}"`,
        link: solicitationLink(solicitation.id),
        solicitationId: solicitation.id,
      });
    }

    return saved;
  }

  async addInternalComment(
    solicitationId: string,
    dto: { content: string; isInternal?: boolean; asProposal?: boolean },
    actor: JwtPayload,
  ): Promise<SolicitationCommentEntity> {
    const solicitation = await this.processAccess.assertSolicitationAccess(
      solicitationId,
      actor,
      'solicitations.view',
    );

    const content = dto.content?.trim() ?? '';
    if (!content) throw new BadRequestException('Conteúdo não pode ser vazio.');
    if (content.length > 2000) {
      throw new BadRequestException('Conteúdo excede 2000 caracteres.');
    }

    const isInternal = dto.isInternal ?? false;
    let proposalStatus: 'pending' | null = null;

    // Uma resposta só vira proposta quando o atendente pede explicitamente
    // (dto.asProposal) — sem isso, é só um comentário normal, mesmo em
    // formulários que exigem aprovação. Assim a conversa com o solicitante
    // continua livre e "enviar proposta" fica uma ação deliberada.
    if (!isInternal && dto.asProposal && solicitation.formId) {
      const requiresApproval = await this.getRequiresResponseApproval(solicitation.formId);
      if (requiresApproval) {
        const pending = await this.commentsRepo.findOne({
          where: { solicitationId, proposalStatus: 'pending' },
        });
        if (pending) {
          throw new BadRequestException(
            'Já existe uma proposta aguardando aprovação do solicitante.',
          );
        }
        proposalStatus = 'pending';
      }
    }

    const comment = this.commentsRepo.create({
      solicitationId,
      content,
      isInternal,
      authorType: 'team',
      authorName: null,
      authorEmail: null,
      authorUserId: actor.sub,
      proposalStatus,
    });
    const saved = await this.commentsRepo.save(comment);

    if (proposalStatus === 'pending') {
      await this.historyRepo.save(
        this.historyRepo.create({
          solicitationId,
          eventType: SolicitationHistoryEventType.PROPOSAL_SENT,
          actorId: actor.sub,
          fromValue: null,
          toValue: null,
          message: 'Proposta de resposta enviada, aguardando aprovação do solicitante.',
          metadata: null,
        }),
      );
    }

    // Responsável sempre; quem abriu a solicitação (usuário interno) só no que é visível a ele.
    void this.userNotice?.notify({
      kind: 'comment',
      userIds: [solicitation.assigneeId, isInternal ? null : solicitation.createdBy],
      exceptUserIds: [actor.sub],
      title: isInternal ? 'Nova nota interna' : 'Novo comentário',
      pushTitle: isInternal ? '📝 Nova nota interna' : '💬 Novo comentário',
      body: `${actor.fullName?.trim() || 'Alguém da equipe'} comentou em "${solicitation.title}"`,
      link: solicitationLink(solicitation.id),
      solicitationId: solicitation.id,
    });

    return saved;
  }

  async decideProposal(
    token: string,
    commentId: string,
    dto: { decision: 'approved' | 'rejected'; comment?: string },
  ): Promise<SolicitationCommentEntity> {
    const solicitation = await this.solicitationsRepo.findOne({
      where: { trackingToken: token },
    });
    if (!solicitation) throw new NotFoundException('Solicitação não encontrada.');

    const comment = await this.commentsRepo.findOne({ where: { id: commentId } });
    if (
      comment?.solicitationId !== solicitation.id ||
      comment.authorType !== 'team' ||
      comment.proposalStatus !== 'pending'
    ) {
      throw new BadRequestException('Proposta não encontrada ou já decidida.');
    }

    const reason = dto.comment?.trim() ?? '';
    if (dto.decision === 'rejected' && !reason) {
      throw new BadRequestException('Informe o motivo da reprovação.');
    }

    comment.proposalStatus = dto.decision;
    comment.proposalDecidedAt = new Date();
    comment.proposalRejectionReason = dto.decision === 'rejected' ? reason : null;
    const saved = await this.commentsRepo.save(comment);

    if (dto.decision === 'approved') {
      solicitation.status = SolicitationStatus.COMPLETED;
      await this.solicitationsRepo.save(solicitation);
    }

    await this.historyRepo.save(
      this.historyRepo.create({
        solicitationId: solicitation.id,
        eventType:
          dto.decision === 'approved'
            ? SolicitationHistoryEventType.PROPOSAL_APPROVED
            : SolicitationHistoryEventType.PROPOSAL_REJECTED,
        actorId: null,
        fromValue: null,
        toValue: dto.decision === 'approved' ? SolicitationStatus.COMPLETED : null,
        message:
          dto.decision === 'approved'
            ? 'Proposta de resposta aprovada pelo solicitante.'
            : `Proposta de resposta reprovada pelo solicitante: ${reason}`,
        metadata: null,
      }),
    );

    if (solicitation.assigneeId) {
      const approved = dto.decision === 'approved';
      void this.userNotice?.notify({
        kind: 'proposal_decision',
        userIds: [solicitation.assigneeId],
        title: approved ? 'Proposta aprovada pelo solicitante' : 'Proposta reprovada pelo solicitante',
        pushTitle: approved
          ? '✅ Proposta aprovada pelo solicitante'
          : '❌ Proposta reprovada pelo solicitante',
        body: approved
          ? `O solicitante aprovou sua resposta em "${solicitation.title}".`
          : `Revise sua resposta em "${solicitation.title}": ${reason}`,
        link: solicitationLink(solicitation.id),
        solicitationId: solicitation.id,
      });
    }

    return saved;
  }

  private async getRequiresResponseApproval(formId: string): Promise<boolean> {
    const form = await this.formsRepo.findOne({
      where: { id: formId },
      relations: { versions: true },
    });
    if (!form?.versions?.length) return false;

    const publishedVersion =
      [...form.versions]
        .filter((v) => v.isPublished)
        .sort((a, b) => b.versionNumber - a.versionNumber)[0] ??
      [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];

    const settings = publishedVersion?.settingsJson as
      | { requiresResponseApproval?: boolean }
      | undefined;
    return settings?.requiresResponseApproval === true;
  }

  async findByToken(
    token: string,
    includeInternal = false,
  ): Promise<SolicitationCommentEntity[]> {
    const solicitation = await this.solicitationsRepo.findOne({
      where: { trackingToken: token },
    });
    if (!solicitation) throw new NotFoundException('Solicitação não encontrada.');

    const where: FindOptionsWhere<SolicitationCommentEntity> = {
      solicitationId: solicitation.id,
    };
    if (!includeInternal) where.isInternal = false;

    return this.commentsRepo.find({ where, order: { createdAt: 'ASC' } });
  }

  /** Comentário interno aparece a quem tem "ver comentários internos" no processo do card. */
  async canViewInternal(solicitationId: string, actor: JwtPayload): Promise<boolean> {
    const solicitation = await this.solicitationsRepo.findOne({ where: { id: solicitationId } });
    if (!solicitation) return false;
    return this.processAccess.canAccessSolicitation(solicitation, actor, 'comments.view_internal');
  }

  async findBySolicitation(
    solicitationId: string,
    actor: JwtPayload,
  ): Promise<SolicitationCommentEntity[]> {
    const solicitation = await this.processAccess.assertSolicitationAccess(
      solicitationId,
      actor,
      'solicitations.view',
    );
    const canViewInternal = await this.processAccess.canAccessSolicitation(
      solicitation,
      actor,
      'comments.view_internal',
    );

    const where: FindOptionsWhere<SolicitationCommentEntity> = { solicitationId };
    if (!canViewInternal) where.isInternal = false;

    return this.commentsRepo.find({ where, order: { createdAt: 'ASC' } });
  }
}
