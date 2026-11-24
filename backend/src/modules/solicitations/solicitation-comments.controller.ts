import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { SolicitationCommentEntity } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateInternalCommentDto } from './dto/create-comment.dto';
import { SolicitationCommentsService } from './solicitation-comments.service';

type CommentDto = {
  id: string;
  solicitationId: string;
  content: string;
  isInternal: boolean;
  authorType: 'requester' | 'team';
  authorName: string | null;
  authorUserId: string | null;
  authorEmail?: string | null;
  createdAt: Date;
  proposalStatus: 'pending' | 'approved' | 'rejected' | null;
  proposalDecidedAt: Date | null;
  proposalRejectionReason: string | null;
};

function toDto(comment: SolicitationCommentEntity, canViewInternal: boolean): CommentDto {
  return {
    id: comment.id,
    solicitationId: comment.solicitationId,
    content: comment.content,
    isInternal: comment.isInternal,
    authorType: comment.authorType,
    authorName: comment.authorName,
    authorUserId: comment.authorUserId,
    createdAt: comment.createdAt,
    proposalStatus: comment.proposalStatus,
    proposalDecidedAt: comment.proposalDecidedAt,
    proposalRejectionReason: comment.proposalRejectionReason,
    ...(canViewInternal ? { authorEmail: comment.authorEmail } : {}),
  };
}

@ApiTags('solicitations')
@ApiBearerAuth('access-token')
@Controller('solicitations')
@UseGuards(JwtAuthGuard)
export class SolicitationCommentsController {
  constructor(
    private readonly commentsService: SolicitationCommentsService,
  ) {}

  @Get(':id/comments')
  @ApiOperation({ summary: 'Listar comentários de uma solicitação' })
  async getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CommentDto[]> {
    const [comments, canViewInternal] = await Promise.all([
      this.commentsService.findBySolicitation(id, actor),
      this.commentsService.canViewInternal(id, actor),
    ]);
    return comments.map((c) => toDto(c, canViewInternal));
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Adicionar comentário interno a uma solicitação' })
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInternalCommentDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CommentDto> {
    const [comment, canViewInternal] = await Promise.all([
      this.commentsService.addInternalComment(id, dto, actor),
      this.commentsService.canViewInternal(id, actor),
    ]);
    return toDto(comment, canViewInternal);
  }
}
