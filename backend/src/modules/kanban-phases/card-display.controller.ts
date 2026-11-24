import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CardDisplayService, type PhaseCardDisplayView } from './card-display.service';
import { SaveCardDisplayDto } from './dto/save-card-display.dto';

/**
 * "Personalizar card" de uma fase do Kanban. Quem enxerga o processo ajusta o próprio card (`/me`);
 * o padrão da fase, que vale para todos, pede "configurar as fases" naquele processo.
 */
@ApiTags('kanban-phases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/:formId/kanban-phases/:phaseId/card-display')
export class CardDisplayController {
  constructor(
    private readonly cardDisplay: CardDisplayService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'O que o card mostra nesta fase (padrão, meu ajuste e campos disponíveis)' })
  async find(
    @Param('formId', new ParseUUIDPipe()) formId: string,
    @Param('phaseId', new ParseUUIDPipe()) phaseId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhaseCardDisplayView> {
    await this.processAccess.assertProcessVisible(formId, currentUser);
    return this.cardDisplay.getForPhase(formId, phaseId, currentUser.sub);
  }

  @Put('me')
  @ApiOperation({ summary: 'Meu ajuste do card nesta fase (só para mim)' })
  async saveMine(
    @Param('formId', new ParseUUIDPipe()) formId: string,
    @Param('phaseId', new ParseUUIDPipe()) phaseId: string,
    @Body() dto: SaveCardDisplayDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhaseCardDisplayView> {
    await this.processAccess.assertProcessVisible(formId, currentUser);
    return this.cardDisplay.savePersonal(formId, phaseId, currentUser.sub, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Apagar meu ajuste (volto ao padrão da fase)' })
  async resetMine(
    @Param('formId', new ParseUUIDPipe()) formId: string,
    @Param('phaseId', new ParseUUIDPipe()) phaseId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhaseCardDisplayView> {
    await this.processAccess.assertProcessVisible(formId, currentUser);
    return this.cardDisplay.savePersonal(formId, phaseId, currentUser.sub, null);
  }

  @Put()
  @RequirePermission('kanban_phases.manage')
  @ApiOperation({ summary: 'Padrão do card nesta fase (para todos)' })
  async savePhaseDefault(
    @Param('formId', new ParseUUIDPipe()) formId: string,
    @Param('phaseId', new ParseUUIDPipe()) phaseId: string,
    @Body() dto: SaveCardDisplayDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhaseCardDisplayView> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'kanban_phases.manage');
    return this.cardDisplay.savePhaseDefault(formId, phaseId, dto, currentUser.sub);
  }

  @Delete()
  @RequirePermission('kanban_phases.manage')
  @ApiOperation({ summary: 'Voltar a fase ao card padrão do sistema' })
  async resetPhaseDefault(
    @Param('formId', new ParseUUIDPipe()) formId: string,
    @Param('phaseId', new ParseUUIDPipe()) phaseId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhaseCardDisplayView> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'kanban_phases.manage');
    return this.cardDisplay.savePhaseDefault(formId, phaseId, null, currentUser.sub);
  }
}
