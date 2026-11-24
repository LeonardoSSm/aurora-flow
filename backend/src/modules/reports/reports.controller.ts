import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { ExecutiveReportService } from './executive-report.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly executiveReportService: ExecutiveReportService) {}

  @Get('solicitations/executive')
  @RequirePermission('reports.view')
  @ApiOperation({ summary: 'Gera relatório executivo de solicitações em PDF' })
  async generateExecutiveReport(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() actor: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const buffer = await this.executiveReportService.generateSolicitationsReport(
        filters,
        actor,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="relatorio-solicitacoes.pdf"',
      );
      res.send(buffer);
    } catch (err) {
      console.error('[PDF] Erro ao gerar:', err);
      throw err;
    }
  }
}
