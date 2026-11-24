import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PhaseSlaService, type PhaseSlaCheckResult, type PhaseTimelineEntry } from './phase-sla.service';

export class ExtendPhaseSlaDto {
  /** Novo vencimento do prazo da fase atual (ISO 8601). */
  @IsISO8601()
  dueAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@ApiTags('solicitations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('solicitations')
export class PhaseSlaController {
  constructor(
    private readonly phaseSlaService: PhaseSlaService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get(':id/phase-timeline')
  @ApiOperation({ summary: 'Linha do tempo das fases do card: entrada, saída, prazo e se cumpriu' })
  getTimeline(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<PhaseTimelineEntry[]> {
    return this.phaseSlaService.getTimeline(id, currentUser);
  }

  @Post(':id/phase-sla/extend')
  @RequirePermission('kanban_phases.manage')
  @ApiOperation({ summary: 'Prorrogar o prazo do card na fase atual (fica no histórico)' })
  async extend(
    @Param('id') id: string,
    @Body() dto: ExtendPhaseSlaDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhaseTimelineEntry[]> {
    // Prorrogar o prazo é configurar a fase DESTE processo.
    await this.processAccess.assertSolicitationAccess(id, currentUser, 'kanban_phases.manage');
    return this.phaseSlaService.extend(id, dto, currentUser);
  }
}

@ApiTags('admin-sla')
@ApiBearerAuth('access-token')
@Controller('admin/sla')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('system.maintenance')
export class PhaseSlaAdminController {
  constructor(private readonly phaseSlaService: PhaseSlaService) {}

  @Post('check-phases')
  @ApiOperation({ summary: 'Executar verificação manual do prazo das fases' })
  checkPhases(): Promise<PhaseSlaCheckResult> {
    return this.phaseSlaService.checkPhaseDeadlines();
  }
}
