import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AreaEntity } from '../../database/entities/area.entity';
import { AreasService } from '../areas/areas.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  PublicarPainelDto,
  PreverPainelLivreDto,
  UpsertPainelLivreDto,
} from './dto/painel-livre.dto';
import {
  PaineisLivresService,
  type PainelLivreComDados,
  type PainelLivreResumo,
} from './paineis-livres.service';
import {
  SolicitacaoQueryService,
  type DimensaoDisponivel,
} from './solicitacao-query.service';
import { KANBAN_COLUMNS } from '../solicitations/solicitation-transitions';
import type { Agregacao, WidgetConfig, WidgetResultado } from './widget-config.types';
import type { CampoDisponivel, FormularioDisponivel } from './widget-query.service';
import { WidgetQueryService } from './widget-query.service';

/**
 * Paineis livres — os que cruzam formularios.
 *
 * Rota separada da do painel de formulario (`forms/:formId/dashboard`) porque
 * o recurso e outro: aqui nao existe formulario no caminho, e o dono do painel
 * e uma pessoa. O guard exige `analytics.view` para tudo; montar exige tambem
 * `dashboards.manage`, conferida no servico para poder explicar o motivo.
 *
 * A ordem das rotas importa: `formularios` e `previsualizar` sao declaradas
 * antes de `:id`, senao o Nest as leria como identificadores de painel.
 */
@ApiTags('dashboards')
@ApiBearerAuth('access-token')
@Controller('dashboards')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('analytics.view')
export class PaineisLivresController {
  constructor(
    private readonly paineis: PaineisLivresService,
    private readonly widgetQuery: WidgetQueryService,
    private readonly solicitacaoQuery: SolicitacaoQueryService,
    private readonly areasService: AreasService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Painéis próprios e os publicados por outras pessoas' })
  listar(@CurrentUser() user: JwtPayload): Promise<PainelLivreResumo[]> {
    return this.paineis.listar(user.sub);
  }

  @Get('formularios')
  @ApiOperation({ summary: 'Formulários que o usuário pode usar como fonte de um bloco' })
  formularios(@CurrentUser() user: JwtPayload): Promise<FormularioDisponivel[]> {
    return this.widgetQuery.listarFormulariosDisponiveis(user.sub, user.role);
  }

  @Get('formularios/:formId/campos')
  @ApiOperation({ summary: 'Campos de um formulário que podem virar indicador' })
  campos(
    @Param('formId', ParseUUIDPipe) formId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CampoDisponivel[]> {
    return this.widgetQuery.listarCamposDisponiveis(formId, user.sub);
  }

  @Get('areas')
  @ApiOperation({ summary: 'Áreas disponíveis para o filtro global do painel' })
  areas(): Promise<Pick<AreaEntity, 'id' | 'name'>[]> {
    return this.areasService.findAll(false);
  }

  @Get('solicitacoes/status')
  @ApiOperation({ summary: 'Status disponíveis para o filtro global do painel' })
  statusDisponiveis(): Array<{ status: string; label: string }> {
    return KANBAN_COLUMNS.map((coluna) => ({ status: coluna.status, label: coluna.label }));
  }

  @Get('solicitacoes/dimensoes')
  @ApiOperation({
    summary: 'Dimensões e medidas disponíveis na fonte de solicitações',
    description:
      'O análogo dos campos de um formulário: status, prioridade, área, responsável, ' +
      'formulário de origem e situação do prazo.',
  })
  dimensoes(): { dimensoes: DimensaoDisponivel[]; agregacoes: Agregacao[] } {
    return this.solicitacaoQuery.listarDimensoes();
  }

  @Post('previsualizar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Calcula um indicador sem gravar — alimenta a pré-visualização',
    description:
      'A fonte decide o motor: `respostas` exige formId no corpo, `solicitacoes` não.',
  })
  previsualizar(
    @Body() dto: PreverPainelLivreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WidgetResultado> {
    return this.paineis.executarBloco(dto as unknown as WidgetConfig, user.sub, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um painel livre [gestão]' })
  criar(
    @Body() dto: UpsertPainelLivreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string }> {
    return this.paineis
      .criar(dto, user.sub, user.role)
      .then((id) => ({ id }));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Painel livre com os indicadores calculados',
    description:
      'O parâmetro periodoDias, quando enviado, sobrepõe o período de todos os blocos. ' +
      'Blocos sobre formulários que o usuário não enxerga voltam com erro próprio, ' +
      'sem derrubar o restante do painel.',
  })
  obter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    // Convertido a mão: ParseIntPipe com `optional` ainda recusa a ausência do
    // parâmetro nesta versão do Nest, e o filtro de período é opcional por natureza.
    @Query('periodoDias') periodoDias?: string,
    @Query('areaId') areaId?: string,
    @Query('status') status?: string,
  ): Promise<PainelLivreComDados> {
    const dias = periodoDias === undefined || periodoDias === '' ? undefined : Number(periodoDias);
    if (dias !== undefined && !Number.isFinite(dias)) {
      throw new BadRequestException('periodoDias deve ser um número.');
    }
    return this.paineis.obter(
      id,
      user.sub,
      user.role,
      dias,
      areaId === '' ? undefined : areaId,
      status === '' ? undefined : status,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Substitui nome, descrição e blocos do painel [dono]' })
  salvar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertPainelLivreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PainelLivreComDados> {
    return this.paineis.salvar(id, dto, user.sub, user.role);
  }

  @Post(':id/publicar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publica o painel para a organização, ou volta a privado [dono]',
    description:
      'Publicar torna o painel visível, não os dados dele: cada bloco continua ' +
      'sendo calculado com a identidade de quem abre.',
  })
  publicar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublicarPainelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PainelLivreComDados> {
    return this.paineis.publicar(id, dto.publicado, user.sub, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Exclui o painel [dono]' })
  remover(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.paineis.remover(id, user.sub, user.role);
  }
}
