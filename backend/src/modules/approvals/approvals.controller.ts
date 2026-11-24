import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { ApprovalEntity } from '../../database/entities';
import type { ApprovalStepEntity } from '../../database/entities';
import { ApprovalsService } from './approvals.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { DecideApprovalStepDto } from './dto/decide-approval-step.dto';

/**
 * Criar, cancelar e reenviar link pedem "pedir e cancelar aprovações" no processo do card. Ler: quem
 * foi chamado a aprovar sempre vê; quem tem "ver todas as aprovações" no processo vê as do card.
 */
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ApprovalsController {
  constructor(
    private readonly approvalsService: ApprovalsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  // ── Nested under solicitations ─────────────────────────────────────────

  @ApiTags('solicitations')
  @Post('solicitations/:solicitationId/approvals')
  @RequirePermission('approvals.manage')
  @ApiOperation({ summary: 'Criar aprovação para uma solicitação' })
  async create(
    @Param('solicitationId') solicitationId: string,
    @Body() dto: CreateApprovalDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ApprovalEntity> {
    await this.processAccess.assertSolicitationAccess(solicitationId, currentUser, 'approvals.manage');
    return this.approvalsService.createApproval(solicitationId, dto, currentUser);
  }

  @ApiTags('solicitations')
  @Get('solicitations/:solicitationId/approvals')
  @RequirePermission('approvals.decide')
  @ApiOperation({ summary: 'Listar aprovações de uma solicitação' })
  findBySolicitation(
    @Param('solicitationId') solicitationId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ApprovalEntity[]> {
    return this.approvalsService.findBySolicitation(solicitationId, currentUser, () =>
      this.processAccess.canOnSolicitation(solicitationId, currentUser, 'approvals.view_all'),
    );
  }

  // ── Top-level /approvals/* ─────────────────────────────────────────────

  @ApiTags('approvals')
  @Get('approvals/my-pending')
  @RequirePermission('approvals.decide')
  @ApiOperation({ summary: 'Listar etapas de aprovação pendentes para o usuário atual' })
  findMyPending(@CurrentUser() currentUser: JwtPayload): Promise<ApprovalStepEntity[]> {
    return this.approvalsService.findMyPending(currentUser);
  }

  @ApiTags('approvals')
  @Get('approvals/:id')
  @RequirePermission('approvals.decide')
  @ApiOperation({ summary: 'Detalhe de uma aprovação com solicitação e histórico' })
  findById(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ApprovalEntity> {
    return this.approvalsService.findById(id, currentUser, (solicitationId) =>
      this.processAccess.canOnSolicitation(solicitationId, currentUser, 'approvals.view_all'),
    );
  }

  @ApiTags('approvals')
  @Post('approvals/:stepId/decide')
  @RequirePermission('approvals.decide')
  @ApiOperation({ summary: 'Registrar decisão em uma etapa de aprovação' })
  decide(
    @Param('stepId') stepId: string,
    @Body() dto: DecideApprovalStepDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ApprovalStepEntity> {
    return this.approvalsService.approveStep(stepId, dto, currentUser);
  }

  @ApiTags('approvals')
  @Post('approvals/:stepId/resend-link')
  @RequirePermission('approvals.manage')
  @ApiOperation({ summary: 'Reenviar o link pessoal de um aprovador externo (gera um link novo)' })
  async resendLink(
    @Param('stepId') stepId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ sent: boolean; sentTo: string; error?: string }> {
    const solicitationId = await this.approvalsService.findSolicitationIdOfStep(stepId);
    await this.processAccess.assertSolicitationAccess(solicitationId, currentUser, 'approvals.manage');
    return this.approvalsService.resendExternalLink(stepId, currentUser);
  }

  @ApiTags('approvals')
  @Patch('approvals/:id/cancel')
  @RequirePermission('approvals.manage')
  @ApiOperation({ summary: 'Cancelar uma aprovação pendente' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ApprovalEntity> {
    const solicitationId = await this.approvalsService.findSolicitationIdOfApproval(id);
    await this.processAccess.assertSolicitationAccess(solicitationId, currentUser, 'approvals.manage');
    return this.approvalsService.cancelApproval(id, currentUser);
  }
}
