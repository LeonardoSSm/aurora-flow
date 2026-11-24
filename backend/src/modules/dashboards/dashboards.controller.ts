import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { DashboardsService, type DashboardComDados } from './dashboards.service';
import { RunWidgetDto, UpsertDashboardDto } from './dto/dashboard.dto';
import type { WidgetConfig, WidgetResultado } from './widget-config.types';
import type { CampoDisponivel } from './widget-query.service';
import { WidgetQueryService } from './widget-query.service';

/**
 * Painel de indicadores de um formulario.
 *
 * O guard exige `analytics.view` em todas as rotas — a mesma permissao que hoje
 * abre a aba Analytics, que este painel substitui. Escrever exige ainda
 * `dashboards.manage`, conferida dentro do servico para poder devolver mensagem
 * explicando o motivo em vez de um 403 seco.
 */
@ApiTags('dashboards')
@ApiBearerAuth('access-token')
@Controller('forms/:formId/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('analytics.view')
export class DashboardsController {
  constructor(
    private readonly dashboardsService: DashboardsService,
    private readonly widgetQuery: WidgetQueryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Painel do formulário com os indicadores já calculados',
    description:
      'Sem painel salvo, devolve uma sugestão montada na hora (gerado: true). ' +
      'O parâmetro periodoDias, quando enviado, vale para todos os blocos.',
  })
  obter(
    @Param('formId') formId: string,
    @CurrentUser() user: JwtPayload,
    // Convertido a mão: ParseIntPipe com `optional` ainda recusa a ausência do
    // parâmetro nesta versão do Nest, e o filtro de período é opcional por natureza.
    @Query('periodoDias') periodoDias?: string,
  ): Promise<DashboardComDados> {
    const dias = periodoDias === undefined || periodoDias === '' ? undefined : Number(periodoDias);
    if (dias !== undefined && !Number.isFinite(dias)) {
      throw new BadRequestException('periodoDias deve ser um número.');
    }
    return this.dashboardsService.obterPainel(formId, user.sub, user.role, dias);
  }

  @Get('campos')
  @ApiOperation({ summary: 'Campos que podem virar indicador, com formatos e agregações válidos' })
  campos(
    @Param('formId') formId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CampoDisponivel[]> {
    return this.widgetQuery.listarCamposDisponiveis(formId, user.sub);
  }

  @Post('previsualizar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula um indicador sem gravar — alimenta a pré-visualização' })
  previsualizar(
    @Param('formId') formId: string,
    @Body() dto: RunWidgetDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WidgetResultado> {
    return this.dashboardsService.previsualizar(
      formId,
      dto as unknown as WidgetConfig,
      user.sub,
      user.role,
    );
  }

  @Put()
  @ApiOperation({ summary: 'Cria ou substitui o painel do formulário [gestão]' })
  salvar(
    @Param('formId') formId: string,
    @Body() dto: UpsertDashboardDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DashboardComDados> {
    return this.dashboardsService.salvarPainel(formId, dto, user.sub, user.role);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove o painel do formulário [gestão]' })
  remover(@Param('formId') formId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.dashboardsService.removerPainel(formId, user.sub, user.role);
  }
}
