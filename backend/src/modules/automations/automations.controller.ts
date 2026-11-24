import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AutomationExecutionEntity, AutomationRuleEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AutomationsService } from './automations.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

/**
 * Regras de automação são configuração do processo: toda rota pede "gerenciar fluxos, automações..."
 * no processo da regra.
 */
@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('flows.manage')
@Controller()
export class AutomationsController {
  constructor(
    private readonly automationsService: AutomationsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get('forms/:formId/automations')
  @ApiOperation({ summary: 'Listar regras de automação de um formulário' })
  async listRules(
    @Param('formId') formId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AutomationRuleEntity[]> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'flows.manage');
    return this.automationsService.findRulesByForm(formId);
  }

  @Post('forms/:formId/automations')
  @ApiOperation({ summary: 'Criar regra de automação' })
  async createRule(
    @Param('formId') formId: string,
    @Body() dto: CreateAutomationRuleDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AutomationRuleEntity> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'flows.manage');
    return this.automationsService.createRule(formId, {
      name: dto.name,
      isActive: dto.isActive ?? true,
      trigger: dto.trigger ?? 'on_submission',
      targetSectionId: dto.targetSectionId ?? null,
      conditions: dto.conditions ?? null,
      actions: dto.actions,
    });
  }

  @Patch('automations/:id')
  @ApiOperation({ summary: 'Atualizar regra de automação' })
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AutomationRuleEntity> {
    await this.findRuleForActor(id, currentUser);
    const patch: {
      name?: string;
      isActive?: boolean;
      trigger?: string;
      targetSectionId?: string | null;
      conditions?: Record<string, unknown> | null;
      actions?: Record<string, unknown>[];
    } = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.trigger !== undefined) patch.trigger = dto.trigger;
    if (dto.targetSectionId !== undefined) patch.targetSectionId = dto.targetSectionId;
    if (dto.conditions !== undefined) patch.conditions = dto.conditions;
    if (dto.actions !== undefined) patch.actions = dto.actions;
    return this.automationsService.updateRule(id, patch);
  }

  @Delete('automations/:id')
  @ApiOperation({ summary: 'Excluir regra de automação' })
  async deleteRule(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ deleted: true }> {
    await this.findRuleForActor(id, currentUser);
    await this.automationsService.deleteRule(id);
    return { deleted: true };
  }

  @Get('automations/:id/executions')
  @ApiOperation({ summary: 'Listar execuções de uma regra de automação' })
  async listExecutions(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AutomationExecutionEntity[]> {
    await this.findRuleForActor(id, currentUser);
    return this.automationsService.findExecutions(id);
  }

  private async findRuleForActor(id: string, actor: JwtPayload): Promise<AutomationRuleEntity> {
    const rule = await this.automationsService.findRule(id);
    if (!rule) throw new NotFoundException('Automação não encontrada');
    await this.processAccess.assertFormAccess(rule.formId, actor, 'flows.manage');
    return rule;
  }
}
