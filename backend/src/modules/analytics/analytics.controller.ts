import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AnalyticsService, type FormAnalytics } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@Controller('forms/:id/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('analytics.view')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Obter analytics de um formulário [ADMIN, MANAGER, EDITOR, VIEWER]' })
  getFormAnalytics(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormAnalytics> {
    return this.analyticsService.getFormAnalytics(id, currentUser.sub);
  }
}
