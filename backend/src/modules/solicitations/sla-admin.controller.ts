import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SlaCalculatorService, type SlaCheckResult } from './sla-calculator.service';

@ApiTags('admin-sla')
@ApiBearerAuth('access-token')
@Controller('admin/sla')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('system.maintenance')
export class SlaAdminController {
  constructor(private readonly slaCalculatorService: SlaCalculatorService) {}

  @Post('check')
  @ApiOperation({ summary: 'Executar verificacao manual de SLA' })
  checkSlaDeadlines(): Promise<SlaCheckResult> {
    return this.slaCalculatorService.checkSlaDeadlines();
  }
}
