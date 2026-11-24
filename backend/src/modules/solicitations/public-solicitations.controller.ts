import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import type { SolicitationCommentEntity } from '../../database/entities';
import { AttachmentsService } from '../attachments/attachments.service';
import { SolicitationsService } from './solicitations.service';
import { CreatePublicCommentDto } from './dto/create-comment.dto';
import { DecideProposalDto } from './dto/decide-proposal.dto';
import {
  getStatusLabel,
  toPublicTimelineEvents,
  type PublicSolicitationDto,
} from './dto/public-solicitation.dto';
import { SolicitationCommentsService } from './solicitation-comments.service';

type PublicCommentDto = {
  id: string;
  content: string;
  authorType: 'requester' | 'team';
  authorName: string | null;
  createdAt: Date;
  proposalStatus: 'pending' | 'approved' | 'rejected' | null;
  proposalDecidedAt: Date | null;
  proposalRejectionReason: string | null;
};

function toPublicDto(c: SolicitationCommentEntity): PublicCommentDto {
  return {
    id: c.id,
    content: c.content,
    authorType: c.authorType,
    authorName: c.authorName,
    createdAt: c.createdAt,
    proposalStatus: c.proposalStatus,
    proposalDecidedAt: c.proposalDecidedAt,
    proposalRejectionReason: c.proposalRejectionReason,
  };
}

@ApiTags('public-solicitations')
@Controller('public/solicitations')
export class PublicSolicitationsController {
  constructor(
    private readonly solicitationsService: SolicitationsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly commentsService: SolicitationCommentsService,
  ) {}

  @Get('track/:token')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Consultar solicitação pelo token de rastreamento (público)' })
  async trackByToken(@Param('token') token: string): Promise<PublicSolicitationDto> {
    let solicitation;
    try {
      solicitation = await this.solicitationsService.findByTrackingToken(token);
    } catch {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    const attachments = await this.getPublicAttachments(solicitation.id);

    return {
      number: solicitation.id,
      title: solicitation.title,
      status: solicitation.status,
      statusLabel: getStatusLabel(solicitation.status),
      priority: solicitation.priority,
      currentStage: (solicitation.metadata?.currentStage as string | null) ?? null,
      slaStatus: solicitation.slaStatus ?? null,
      slaDueAt: solicitation.slaDueAt,
      formName: solicitation.form?.name ?? '',
      createdAt: solicitation.createdAt,
      updatedAt: solicitation.updatedAt,
      timeline: toPublicTimelineEvents(solicitation.history ?? []),
      attachments: attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt,
      })),
    };
  }

  @Get('track/:token/attachments/:attachmentId/download')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Download de anexo público vinculado a uma solicitação rastreada' })
  async downloadAttachment(
    @Param('token') token: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Verify token is valid before serving the attachment
    try {
      await this.solicitationsService.findByTrackingToken(token);
    } catch {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    const { stream, attachment } = await this.attachmentsService.download(attachmentId, {
      isPublicRoute: true,
    });

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    stream.pipe(res);
  }

  @Post('track/:token/comments')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Adicionar comentário público a uma solicitação rastreada' })
  async addPublicComment(
    @Param('token') token: string,
    @Body() dto: CreatePublicCommentDto,
  ): Promise<PublicCommentDto> {
    const comment = await this.commentsService.addPublicComment(token, dto);
    return toPublicDto(comment);
  }

  @Get('track/:token/comments')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Listar comentários públicos de uma solicitação rastreada' })
  async getPublicComments(
    @Param('token') token: string,
  ): Promise<PublicCommentDto[]> {
    const comments = await this.commentsService.findByToken(token, false);
    return comments.map(toPublicDto);
  }

  @Post('track/:token/comments/:commentId/decide')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Aprovar ou reprovar uma proposta de resposta (público)' })
  async decideProposal(
    @Param('token') token: string,
    @Param('commentId') commentId: string,
    @Body() dto: DecideProposalDto,
  ): Promise<PublicCommentDto> {
    const comment = await this.commentsService.decideProposal(token, commentId, dto);
    return toPublicDto(comment);
  }

  private getPublicAttachments(solicitationId: string): ReturnType<AttachmentsService['findBySolicitation']> {
    // 'viewer' with no actorId means only isPublic=true attachments are returned
    return this.attachmentsService.findBySolicitation(solicitationId, false, undefined);
  }
}
