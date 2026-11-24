import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { MetricsSummaryService, type MetricsSummaryDto } from './metrics-summary.service';

@ApiTags('admin')
@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('observability.view_metrics')
export class AdminMetricsController {
  constructor(private readonly metricsSummaryService: MetricsSummaryService) {}

  @Get('summary')
  getSummary(): Promise<MetricsSummaryDto> {
    return this.metricsSummaryService.getSummary();
  }
}
