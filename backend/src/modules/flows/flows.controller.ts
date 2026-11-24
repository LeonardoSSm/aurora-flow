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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { QueryFlowsDto } from './dto/query-flows.dto';
import { RunFlowTestDto } from './dto/run-flow-test.dto';
import type { DlqQueueInfo } from './dlq-monitor.service';
import { DlqMonitorService } from './dlq-monitor.service';
import { type AuthorizeFlowForms, FlowsService } from './flows.service';
import type { FlowEntity, FlowExecutionEntity } from '../../database/entities';
import type { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import type { NodeExecutionResult } from './types/flow.types';

@ApiTags('flows')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class FlowsController {
  constructor(
    private readonly flowsService: FlowsService,
    private readonly dlqMonitorService: DlqMonitorService,
  ) {}

  /**
   * Ciclo 01: fluxos são de plataforma. A conferência por processo fica isolada no domínio legado.
   */
  private authorizeForms(_currentUser: JwtPayload): AuthorizeFlowForms {
    return async () => undefined;
  }

  @Get('flows')
  @RequirePermission('flows.view')
  @ApiOperation({ summary: 'Listar fluxos (paginado)' })
  findAll(
    @Query() query: QueryFlowsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PaginatedResponseDto<FlowEntity>> {
    return this.flowsService.findAll(currentUser.sub, currentUser.role, query);
  }

  @Post('flows')
  @RequirePermission('flows.manage')
  @ApiOperation({ summary: 'Criar fluxo independente' })
  createStandalone(
    @Body() dto: CreateFlowDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FlowEntity> {
    return this.flowsService.create(dto, currentUser.sub, undefined, this.authorizeForms(currentUser));
  }

  @Get('flows/:id')
  @RequirePermission('flows.view')
  @ApiOperation({ summary: 'Obter fluxo por ID' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<FlowEntity> {
    return this.flowsService.findOne(id, currentUser.sub, currentUser.role);
  }

  @Patch('flows/:id')
  @RequirePermission('flows.manage')
  @ApiOperation({ summary: 'Atualizar canvas do fluxo (nodes/edges/viewport)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFlowDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FlowEntity> {
    return this.flowsService.update(
      id,
      dto,
      currentUser.sub,
      currentUser.role,
      this.authorizeForms(currentUser),
    );
  }

  @Patch('flows/:id/active')
  @RequirePermission('flows.manage')
  @ApiOperation({ summary: 'Ativar/desativar fluxo' })
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FlowEntity> {
    return this.flowsService.toggleActive(id, currentUser.sub, currentUser.role);
  }

  @Delete('flows/:id')
  @RequirePermission('flows.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover fluxo' })
  async delete(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<void> {
    await this.flowsService.delete(id, currentUser.sub, currentUser.role);
  }

  @Post('flows/:id/test')
  @RequirePermission('flows.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Executar fluxo com dados de teste (simula as ações: não envia, não chama nem grava nada)',
  })
  runTest(
    @Param('id') id: string,
    @Body() dto: RunFlowTestDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<NodeExecutionResult[]> {
    return this.flowsService.runTest(id, currentUser.sub, dto, currentUser.role);
  }

  @Get('admin/flows/dlq')
  @RequirePermission('system.maintenance')
  @ApiOperation({ summary: 'Status das filas mortas (DLQ) — admin only' })
  getDlqStatus(): Promise<DlqQueueInfo[]> {
    return this.dlqMonitorService.getDlqStatus();
  }

  @Post('admin/flows/migrate-form-ids')
  @RequirePermission('system.maintenance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Migrar formId de FlowEntity para trigger node data (one-time) — admin only' })
  migrateFormIds(): Promise<{ migrated: number; skipped: number }> {
    return this.flowsService.migrateFlowFormIds();
  }

  @Get('flows/:id/executions')
  @RequirePermission('flows.view')
  @ApiOperation({ summary: 'Histórico de execuções do fluxo' })
  getExecutions(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{
    data: FlowExecutionEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.flowsService.getExecutions(id, Number(page), Number(limit), currentUser.sub, currentUser.role);
  }
}
