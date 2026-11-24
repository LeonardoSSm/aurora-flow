import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { QueryDashboardStatsDto } from './dto/query-dashboard-stats.dto';
import type { DashboardStats } from './dashboard.service';
import { DashboardService } from './dashboard.service';
import { OperationalDashboardService } from './operational-dashboard.service';
import type { OperationalDashboardDto } from './dto/operational-dashboard.dto';
import { SolicitationsService } from '../solicitations/solicitations.service';
import type { ProcessPanelDto } from '../solicitations/process-panel';

export type DashboardPanelDto = ProcessPanelDto & {
  alerts: { failedFlowsToday: number | null };
};

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly operationalDashboardService: OperationalDashboardService,
    private readonly solicitationsService: SolicitationsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatisticas resumidas da plataforma' })
  getStats(
    @Query() query: QueryDashboardStatsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<DashboardStats> {
    return this.dashboardService.getStats(query, currentUser.sub);
  }

  @Get('operational-stats')
  @ApiOperation({ summary: 'Dashboard operacional contextualizado por role e area' })
  getOperationalStats(@CurrentUser() actor: JwtPayload): Promise<OperationalDashboardDto> {
    return this.operationalDashboardService.getOperationalStats(actor);
  }

  @Get('panel')
  @ApiOperation({ summary: 'Painel inicial: o que depende de mim e cada processo por fase' })
  async getPanel(@CurrentUser() actor: JwtPayload): Promise<DashboardPanelDto> {
    const [panel, failedFlowsToday] = await Promise.all([
      this.solicitationsService.getProcessPanel(actor),
      this.operationalDashboardService.countFailedFlowsToday(actor),
    ]);
    return { ...panel, alerts: { failedFlowsToday } };
  }
}
