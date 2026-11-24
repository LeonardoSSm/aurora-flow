import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type {
  ApprovalEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
  SolicitationStandardAnswerEntity,
} from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { readSolicitationFormFieldValues } from '../flows/lib/flow-field-values';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateSolicitationDto } from './dto/create-solicitation.dto';
import { MoveKanbanCardDto } from './dto/move-kanban-card.dto';
import { MovePhaseDto } from './dto/move-phase.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { QuerySolicitationsDto } from './dto/query-solicitations.dto';
import { SavePhaseFieldValuesDto } from './dto/save-phase-field-values.dto';
import { SaveStandardAnswersDto } from './dto/save-standard-answers.dto';
import { UpdateSolicitationAssigneeDto } from './dto/update-solicitation-assignee.dto';
import { UpdateSolicitationPriorityDto } from './dto/update-solicitation-priority.dto';
import { UpdateSolicitationStatusDto } from './dto/update-solicitation-status.dto';
import type { KanbanBoardDto, KanbanFormSummary } from './solicitation-transitions';
import { SlaCalculatorService, type SlaStatusResult } from './sla-calculator.service';
import {
  SolicitationsService,
  type HandoffLinksDto,
  type SolicitationWithContact,
} from './solicitations.service';
import {
  ErpLookupFieldService,
  type AnsweredErpLookupDetail,
} from '../integrations/erp/lookup/erp-lookup-field.service';

@ApiTags('solicitations')
@ApiBearerAuth('access-token')
@Controller('solicitations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SolicitationsController {
  constructor(
    private readonly solicitationsService: SolicitationsService,
    private readonly slaCalculatorService: SlaCalculatorService,
    private readonly erpLookupFieldService: ErpLookupFieldService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar solicitacoes com paginacao e filtros' })
  findAll(
    @Query() query: QuerySolicitationsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PaginatedResponseDto<SolicitationEntity>> {
    return this.solicitationsService.findAll(query, currentUser);
  }

  @Get('kanban/summary')
  @ApiOperation({ summary: 'Retorna resumo do Kanban agrupado por formulario' })
  getKanbanSummary(@CurrentUser() currentUser: JwtPayload): Promise<KanbanFormSummary[]> {
    return this.solicitationsService.getKanbanSummary(currentUser);
  }

  @Get('kanban/board')
  @ApiOperation({ summary: 'Retorna o board Kanban de um formulario (fases) ou "unassigned" (colunas padrao)' })
  getKanbanBoard(
    @Query('formId') formId: string | undefined,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<KanbanBoardDto> {
    return this.solicitationsService.getKanbanBoard(currentUser, formId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhe da solicitacao' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationWithContact> {
    return this.solicitationsService.findOne(id, currentUser);
  }

  @Get(':id/sla')
  @ApiOperation({ summary: 'Obter status de SLA da solicitacao' })
  async getSlaStatus(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SlaStatusResult> {
    const solicitation = await this.solicitationsService.findOne(id, currentUser);
    return this.slaCalculatorService.getSlaStatus(solicitation);
  }

  @Post()
  @RequirePermission('solicitations.create')
  @ApiOperation({ summary: 'Criar solicitacao manual' })
  create(
    @Body() dto: CreateSolicitationDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.createManual(dto, currentUser);
  }

  @Patch(':id/status')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Alterar status da solicitacao' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSolicitationStatusDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.updateStatus(id, dto, currentUser);
  }

  @Patch(':id/assignee')
  @RequirePermission('solicitations.reassign')
  @ApiOperation({ summary: 'Atualizar responsavel da solicitacao' })
  updateAssignee(
    @Param('id') id: string,
    @Body() dto: UpdateSolicitationAssigneeDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.updateAssignee(id, dto, currentUser);
  }

  @Patch(':id/priority')
  @RequirePermission('solicitations.reassign')
  @ApiOperation({ summary: 'Atualizar prioridade da solicitacao' })
  updatePriority(
    @Param('id') id: string,
    @Body() dto: UpdateSolicitationPriorityDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.updatePriority(id, dto, currentUser);
  }

  @Patch(':id/move')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Mover card no Kanban com validacao de transicao permitida' })
  moveCard(
    @Param('id') id: string,
    @Body() dto: MoveKanbanCardDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.moveCard(id, dto, currentUser);
  }

  @Patch(':id/move-phase')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Mover card para uma fase configurável (movimento livre)' })
  movePhase(
    @Param('id') id: string,
    @Body() dto: MovePhaseDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.movePhase(id, dto, currentUser);
  }

  @Patch(':id/move-stage')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Mover card sem formulario entre as colunas padrao (Novo/Pendente/Concluido)' })
  moveStage(
    @Param('id') id: string,
    @Body() dto: MoveStageDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationEntity> {
    return this.solicitationsService.moveStage(id, dto, currentUser);
  }

  @Post(':id/phase-approvals')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Solicitar aprovação da fase atual da solicitação (roteada pelo perfil aprovador da fase)' })
  requestPhaseApproval(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ApprovalEntity> {
    return this.solicitationsService.requestCurrentPhaseApproval(id, currentUser);
  }

  @Get(':id/erp-details')
  @ApiOperation({
    summary: 'Fichas do ERP de cada campo "Lista do ERP" respondido (ex.: o pedido), para aprovação e card da fase',
  })
  async getErpDetails(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AnsweredErpLookupDetail[]> {
    const solicitation = await this.solicitationsService.findOne(id, currentUser);
    const items = solicitation.submission?.items ?? [];
    // Sem envio: a solicitação nasceu num fluxo, que pode ter respondido o formulário por ela.
    if (items.length === 0 && solicitation.formId) {
      return this.erpLookupFieldService.detailsForFlowGivenValues(
        solicitation.formId,
        readSolicitationFormFieldValues(solicitation.metadata),
      );
    }
    return this.erpLookupFieldService.detailsForAnswers(items);
  }

  @Get(':id/handoffs')
  @ApiOperation({
    summary: 'Card de origem e cards criados ao encaminhar este para outros processos',
  })
  getHandoffLinks(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<HandoffLinksDto> {
    return this.solicitationsService.findHandoffLinks(id, currentUser);
  }

  @Get(':id/phase-fields')
  @ApiOperation({ summary: 'Obter valores dos campos de fase da solicitacao' })
  getPhaseFieldValues(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<KanbanPhaseFieldValueEntity[]> {
    return this.solicitationsService.getPhaseFieldValues(id, currentUser);
  }

  @Patch(':id/phase-fields')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Salvar valores dos campos de fase da solicitacao' })
  savePhaseFieldValues(
    @Param('id') id: string,
    @Body() dto: SavePhaseFieldValuesDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<KanbanPhaseFieldValueEntity[]> {
    return this.solicitationsService.savePhaseFieldValues(id, dto, currentUser);
  }

  @Get(':id/standard-answers')
  @ApiOperation({ summary: 'Obter respostas às perguntas padrão da solicitacao' })
  getStandardAnswers(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationStandardAnswerEntity[]> {
    return this.solicitationsService.getStandardAnswers(id, currentUser);
  }

  @Patch(':id/standard-answers')
  @RequirePermission('solicitations.act')
  @ApiOperation({ summary: 'Salvar respostas às perguntas padrão da solicitacao' })
  saveStandardAnswers(
    @Param('id') id: string,
    @Body() dto: SaveStandardAnswersDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationStandardAnswerEntity[]> {
    return this.solicitationsService.saveStandardAnswers(id, dto, currentUser);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Listar historico da solicitacao' })
  findHistory(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<SolicitationHistoryEntity[]> {
    return this.solicitationsService.findHistory(id, currentUser);
  }

  @Post(':id/tracking-token/regenerate')
  @RequirePermission('solicitations.regenerate_token')
  @ApiOperation({ summary: 'Regenerar token de rastreamento da solicitacao' })
  regenerateTrackingToken(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ trackingToken: string }> {
    return this.solicitationsService.regenerateTrackingToken(id, currentUser);
  }
}
