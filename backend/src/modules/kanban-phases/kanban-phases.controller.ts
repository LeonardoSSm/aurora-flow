import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { KanbanPhaseEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { FormKanbanSettings } from '../../database/entities/form.entity';
import { SaveKanbanPhasesDto } from './dto/save-kanban-phases.dto';
import { SaveKanbanSettingsDto } from './dto/save-kanban-settings.dto';
import { SavePhaseCardVisibilityDto } from './dto/save-phase-card-visibility.dto';
import { KanbanPhasesService } from './kanban-phases.service';

/**
 * Ler as fases pede enxergar o processo (vínculo, ou um card dele ao alcance); gravar pede
 * "configurar as fases" NAQUELE processo.
 */
@ApiTags('kanban-phases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/:formId/kanban-phases')
export class KanbanPhasesController {
  constructor(
    private readonly kanbanPhasesService: KanbanPhasesService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar fases configuradas do Kanban para um formulário' })
  async findByForm(
    @Param('formId') formId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<KanbanPhaseEntity[]> {
    await this.processAccess.assertProcessVisible(formId, currentUser);
    return this.kanbanPhasesService.findByForm(formId);
  }

  @Put()
  @RequirePermission('kanban_phases.manage')
  @ApiOperation({ summary: 'Substituir a configuração de fases do Kanban de um formulário' })
  async save(
    @Param('formId') formId: string,
    @Body() dto: SaveKanbanPhasesDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<KanbanPhaseEntity[]> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'kanban_phases.manage');
    return this.kanbanPhasesService.save(formId, dto);
  }

  @Put(':phaseId/card-visibility')
  @RequirePermission('kanban_phases.manage')
  @ApiOperation({ summary: 'Filtro de cards da fase pela resposta (quem vê quais cards)' })
  async saveCardVisibility(
    @Param('formId') formId: string,
    @Param('phaseId', new ParseUUIDPipe()) phaseId: string,
    @Body() dto: SavePhaseCardVisibilityDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<KanbanPhaseEntity> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'kanban_phases.manage');
    return this.kanbanPhasesService.saveCardVisibility(formId, phaseId, dto);
  }
}

@ApiTags('kanban-phases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/:formId/kanban-settings')
export class KanbanSettingsController {
  constructor(
    private readonly kanbanPhasesService: KanbanPhasesService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Configuração do Kanban do formulário (campo de valor do card)' })
  async find(
    @Param('formId') formId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormKanbanSettings> {
    await this.processAccess.assertProcessVisible(formId, currentUser);
    return this.kanbanPhasesService.getSettings(formId);
  }

  @Put()
  @RequirePermission('kanban_phases.manage')
  @ApiOperation({ summary: 'Salvar a configuração do Kanban do formulário' })
  async save(
    @Param('formId') formId: string,
    @Body() dto: SaveKanbanSettingsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormKanbanSettings> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'kanban_phases.manage');
    return this.kanbanPhasesService.saveSettings(formId, dto);
  }
}
