import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import type { ErpConnectorEntity } from '../../../database/entities/erp-connector.entity';
import type { ErpOperationLogEntity } from '../../../database/entities/erp-operation-log.entity';
import type { ErpOperationTemplateEntity } from '../../../database/entities/erp-operation-template.entity';
import { ErpConnectorService, type ErpHealthResult } from './erp-connector.service';
import {
  CreateErpConnectorDto,
  CreateErpTemplateDto,
  QueryErpLogsDto,
  UpdateErpConnectorDto,
  UpdateErpTemplateDto,
} from './erp-admin.dto';

type MaskedConnector = Omit<ErpConnectorEntity, 'bearerToken' | 'refreshCredentials'> & {
  bearerToken: '***';
  refreshCredentials: '***' | null;
};
type LogsPage = { data: Partial<ErpOperationLogEntity>[]; total: number; page: number; limit: number };
type TestResult = { reachable: boolean; authValid: boolean | null; statusCode?: number; durationMs: number };

@Controller('admin/erp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ErpAdminController {
  constructor(private readonly erpService: ErpConnectorService) {}

  // ─── Connectors ──────────────────────────────────────────────────────────

  @Get('connectors')
  @RequirePermission('integrations.manage')
  findAllConnectors(): Promise<MaskedConnector[]> {
    return this.erpService.findAllConnectors();
  }

  @Post('connectors')
  @RequirePermission('integrations.manage')
  createConnector(
    @Body() dto: CreateErpConnectorDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MaskedConnector> {
    return this.erpService.createConnector(dto, user.sub);
  }

  @Patch('connectors/:id')
  @RequirePermission('integrations.manage')
  updateConnector(
    @Param('id') id: string,
    @Body() dto: UpdateErpConnectorDto,
  ): Promise<MaskedConnector> {
    return this.erpService.updateConnector(id, dto);
  }

  @Patch('connectors/:id/deactivate')
  @RequirePermission('integrations.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateConnector(@Param('id') id: string): Promise<void> {
    await this.erpService.deactivateConnector(id);
  }

  @Delete('connectors/:id')
  @RequirePermission('integrations.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConnector(
    @Param('id') id: string,
    @Query('force') force?: string,
  ): Promise<void> {
    await this.erpService.deleteConnector(id, force === 'true');
  }

  // ─── Templates ───────────────────────────────────────────────────────────

  @Get('connectors/:id/templates')
  @RequirePermission('integrations.manage')
  findTemplates(@Param('id') connectorId: string): Promise<ErpOperationTemplateEntity[]> {
    return this.erpService.findTemplates(connectorId);
  }

  @Post('connectors/:id/templates')
  @RequirePermission('integrations.manage')
  createTemplate(
    @Param('id') connectorId: string,
    @Body() dto: CreateErpTemplateDto,
  ): Promise<ErpOperationTemplateEntity> {
    return this.erpService.createTemplate(connectorId, dto);
  }

  @Patch('templates/:id')
  @RequirePermission('integrations.manage')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateErpTemplateDto,
  ): Promise<ErpOperationTemplateEntity> {
    return this.erpService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @RequirePermission('integrations.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateTemplate(@Param('id') id: string): Promise<void> {
    await this.erpService.deactivateTemplate(id);
  }

  // ─── Test connection ─────────────────────────────────────────────────────

  @Post('connectors/:id/test')
  @RequirePermission('integrations.manage')
  testConnection(@Param('id') id: string): Promise<TestResult> {
    return this.erpService.testConnection(id);
  }

  // ─── Logs ────────────────────────────────────────────────────────────────

  @Get('logs')
  @RequirePermission('integrations.view_logs')
  findLogs(@Query() filters: QueryErpLogsDto): Promise<LogsPage> {
    return this.erpService.findLogs(filters);
  }

  @Post('logs/:id/retry')
  @RequirePermission('integrations.manage')
  retryLog(@Param('id') id: string): Promise<ErpOperationLogEntity> {
    return this.erpService.manualRetryLog(id);
  }

  // ─── Health ──────────────────────────────────────────────────────────────

  @Get('connectors/:id/health')
  @RequirePermission('integrations.view_logs')
  checkConnectorHealth(@Param('id') id: string): Promise<ErpHealthResult> {
    return this.erpService.checkHealth(id);
  }

  @Get('health')
  @RequirePermission('integrations.view_logs')
  getAllConnectorsHealth(): Promise<ErpHealthResult[]> {
    return this.erpService.getAllConnectorsHealthCached();
  }
}
