import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { DashboardEntity, DashboardWidgetEntity } from '../../database/entities';
import { PermissionsService } from '../roles/permissions.service';
import type { UpsertPainelLivreDto } from './dto/painel-livre.dto';
import type { DashboardWidgetComDados } from './dashboards.service';
import { SolicitacaoQueryService } from './solicitacao-query.service';
import type { WidgetConfig, WidgetResultado } from './widget-config.types';
import { WidgetQueryService } from './widget-query.service';

/**
 * Paineis livres — os que nao nascem de um formulario.
 *
 * A diferenca de fundo para o painel do formulario nao e a tela, e de quem o
 * painel e. O painel do formulario pertence ao formulario: quem enxerga um
 * enxerga o outro. O painel livre pertence a uma pessoa, cruza formularios que
 * so ela escolheu, e so aparece para os demais depois de publicado.
 *
 * Isso muda onde o acesso e conferido. No painel do formulario, uma checagem no
 * topo resolve tudo. Aqui **cada bloco carrega o seu formulario e e conferido
 * sozinho**: abrir um painel publicado por outra pessoa nao da acesso aos dados
 * dela — os blocos sobre formularios que voce nao enxerga falham um a um, com o
 * resto do painel intacto. Nao existe caminho em que publicar vaze numero.
 */

export type PainelLivreResumo = {
  id: string;
  name: string;
  description: string | null;
  publicado: boolean;
  totalWidgets: number;
  ehDono: boolean;
  atualizadoEm: string;
};

export type PainelLivreComDados = {
  id: string;
  name: string;
  description: string | null;
  publicado: boolean;
  widgets: DashboardWidgetComDados[];
  ehDono: boolean;
  podeEditar: boolean;
};

/** Teto de blocos por painel — a tela calcula todos de uma vez, ao vivo. */
const MAX_WIDGETS = 24;

@Injectable()
export class PaineisLivresService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly widgetQuery: WidgetQueryService,
    private readonly solicitacaoQuery: SolicitacaoQueryService,
    private readonly permissionsService: PermissionsService,
    @InjectRepository(DashboardEntity)
    private readonly dashboardsRepository: Repository<DashboardEntity>,
    @InjectRepository(DashboardWidgetEntity)
    private readonly widgetsRepository: Repository<DashboardWidgetEntity>,
  ) {}

  /** Os painéis do próprio usuário mais os que outros publicaram. */
  async listar(actorId: string): Promise<PainelLivreResumo[]> {
    const paineis = await this.dashboardsRepository.find({
      where: [
        { formId: IsNull(), createdBy: actorId },
        { formId: IsNull(), publishedAt: Not(IsNull()) },
      ],
      order: { updatedAt: 'DESC' },
    });

    // Uma contagem só para todos, em vez de carregar os widgets de cada painel
    // — a lista não desenha bloco nenhum, só diz quantos há.
    const contagens = await this.contarWidgets(paineis.map((painel) => painel.id));

    return paineis.map((painel) => ({
      id: painel.id,
      name: painel.name,
      description: painel.description,
      publicado: painel.publishedAt !== null,
      totalWidgets: contagens.get(painel.id) ?? 0,
      ehDono: painel.createdBy === actorId,
      atualizadoEm: painel.updatedAt.toISOString(),
    }));
  }

  /**
   * Abre um painel com todos os blocos calculados ao vivo.
   *
   * Cada bloco e calculado em paralelo e cada falha fica contida nele: o
   * formulario de origem some, ou deixa de ser visivel para quem abriu, e o
   * painel perde aquele bloco, nao a tela.
   */
  async obter(
    id: string,
    actorId: string,
    actorRole: string,
    periodoDias?: number | null,
    /** Filtros globais do painel — nunca vêm do bloco, sempre da barra do topo. */
    areaId?: string | null,
    status?: string | null,
  ): Promise<PainelLivreComDados> {
    const painel = await this.carregarComAcesso(id, actorId);
    const widgets = [...(painel.widgets ?? [])].sort((a, b) => a.position - b.position);

    const calculados = await Promise.all(
      widgets.map(async (widget): Promise<DashboardWidgetComDados> => {
        const base = {
          id: widget.id,
          title: widget.title,
          kind: widget.kind,
          configJson: widget.configJson,
          position: widget.position,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
        };
        try {
          const config = widget.configJson as WidgetConfig;
          const resultado = await this.executarBloco(
            {
              ...config,
              tipo: widget.kind as WidgetConfig['tipo'],
              // Período do topo, quando escolhido, vale para o painel inteiro.
              periodoDias: periodoDias === undefined ? config.periodoDias : periodoDias,
              // Área e status são sempre do topo — bloco nenhum guarda os seus.
              areaId,
              statusSolicitacao: status,
            },
            actorId,
            actorRole,
          );
          return { ...base, resultado, erro: null };
        } catch (falha) {
          return {
            ...base,
            resultado: null,
            erro: falha instanceof Error ? falha.message : 'Não foi possível calcular este bloco.',
          };
        }
      }),
    );

    return {
      id: painel.id,
      name: painel.name,
      description: painel.description,
      publicado: painel.publishedAt !== null,
      widgets: calculados,
      ehDono: painel.createdBy === actorId,
      podeEditar: await this.podeEditar(painel, actorId, actorRole),
    };
  }

  /** Cria um painel vazio — a montagem acontece depois, na tela. */
  async criar(dto: UpsertPainelLivreDto, actorId: string, actorRole: string): Promise<string> {
    await this.assertPodeMontar(actorRole);
    const painel = await this.dashboardsRepository.save(
      this.dashboardsRepository.create({
        formId: null,
        name: dto.name,
        description: dto.description ?? null,
        createdBy: actorId,
        publishedAt: null,
      }),
    );
    if (dto.widgets.length > 0) {
      await this.salvar(painel.id, dto, actorId, actorRole);
    }
    return painel.id;
  }

  /**
   * Substitui o painel inteiro — a lista recebida e a verdade, o que nao vier
   * some. Casa com a tela, que edita tudo e salva de uma vez, e evita um
   * protocolo de diferencas que a interface nao usaria.
   */
  async salvar(
    id: string,
    dto: UpsertPainelLivreDto,
    actorId: string,
    actorRole: string,
  ): Promise<PainelLivreComDados> {
    const painel = await this.carregarParaEdicao(id, actorId, actorRole);

    if (dto.widgets.length > MAX_WIDGETS) {
      throw new BadRequestException(`Um painel comporta até ${MAX_WIDGETS} blocos.`);
    }

    // Valida cada bloco contra a fonte real antes de gravar. Guardar
    // configuração que já nasce inválida só adia o erro para a leitura — e
    // aqui é também o que impede montar bloco sobre dado alheio.
    for (const widget of dto.widgets) {
      const config = widget.configJson as WidgetConfig;
      if (config.fonte !== 'solicitacoes' && !config.formId) {
        throw new BadRequestException(`O bloco "${widget.title}" precisa de um formulário.`);
      }
      await this.executarBloco({ ...config, tipo: widget.kind }, actorId, actorRole);
    }

    await this.dataSource.transaction(async (manager) => {
      const dashboardsRepo = manager.getRepository(DashboardEntity);
      const widgetsRepo = manager.getRepository(DashboardWidgetEntity);

      painel.name = dto.name;
      painel.description = dto.description ?? null;
      await dashboardsRepo.save(painel);

      const enviados = dto.widgets.map((widget) => widget.id).filter(Boolean) as string[];
      const existentes = await widgetsRepo.find({ where: { dashboardId: painel.id } });
      const removidos = existentes
        .filter((widget) => !enviados.includes(widget.id))
        .map((widget) => widget.id);
      if (removidos.length > 0) {
        await widgetsRepo.delete({ id: In(removidos) });
      }

      for (const [indice, widget] of dto.widgets.entries()) {
        const dados = {
          dashboardId: painel.id,
          title: widget.title,
          kind: widget.kind,
          configJson: widget.configJson,
          position: widget.position ?? indice,
          x: widget.x ?? 0,
          y: widget.y ?? 0,
          w: widget.w ?? 6,
          h: widget.h ?? 4,
        };
        // `save` cobre criar e atualizar; `update` tropeça no jsonb, que o
        // TypeORM trata como partial profundo em vez de valor único.
        const existente = existentes.find((atual) => atual.id === widget.id);
        await widgetsRepo.save(
          existente ? Object.assign(existente, dados) : widgetsRepo.create(dados),
        );
      }
    });

    return this.obter(id, actorId, actorRole);
  }

  /**
   * Publica ou volta a privado.
   *
   * Publicar torna o painel visivel; nao torna os dados dele visiveis. Quem
   * abrir continua vendo apenas os blocos cujos formularios ele proprio
   * enxerga, porque o calculo e feito com a identidade de quem abre.
   */
  async publicar(
    id: string,
    publicado: boolean,
    actorId: string,
    actorRole: string,
  ): Promise<PainelLivreComDados> {
    const painel = await this.carregarParaEdicao(id, actorId, actorRole);
    painel.publishedAt = publicado ? new Date() : null;
    await this.dashboardsRepository.save(painel);
    return this.obter(id, actorId, actorRole);
  }

  async remover(id: string, actorId: string, actorRole: string): Promise<void> {
    const painel = await this.carregarParaEdicao(id, actorId, actorRole);
    // Os widgets caem junto pelo ON DELETE CASCADE.
    await this.dashboardsRepository.delete({ id: painel.id });
  }

  /**
   * Calcula um bloco, escolhendo o motor pela fonte que ele declara.
   *
   * Ponto unico de passagem: leitura do painel, validacao na gravacao e
   * pre-visualizacao vem todas por aqui, entao nao ha como uma delas aceitar
   * uma configuracao que as outras recusariam.
   */
  async executarBloco(
    config: WidgetConfig,
    actorId: string,
    actorRole: string,
  ): Promise<WidgetResultado> {
    if (config.fonte === 'solicitacoes') {
      return this.solicitacaoQuery.executar(config, actorId, actorRole);
    }
    if (!config.formId) {
      throw new BadRequestException('Este bloco não diz de qual formulário ele lê.');
    }
    return this.widgetQuery.executar(config.formId, config, actorId);
  }

  // ─── Acesso ─────────────────────────────────────────────────────────────────

  /** Lê o painel conferindo se o ator pode ao menos abri-lo. */
  private async carregarComAcesso(id: string, actorId: string): Promise<DashboardEntity> {
    const painel = await this.dashboardsRepository.findOne({
      where: { id, formId: IsNull() },
      relations: { widgets: true },
    });
    if (!painel) throw new NotFoundException('Painel não encontrado.');
    if (painel.createdBy !== actorId && painel.publishedAt === null) {
      // 404 e não 403: para quem não é o dono, um painel privado alheio não
      // existe — responder 403 confirmaria que ele existe.
      throw new NotFoundException('Painel não encontrado.');
    }
    return painel;
  }

  private async carregarParaEdicao(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<DashboardEntity> {
    const painel = await this.carregarComAcesso(id, actorId);
    if (!(await this.podeEditar(painel, actorId, actorRole))) {
      throw new ForbiddenException('Só quem criou o painel pode alterá-lo.');
    }
    return painel;
  }

  /**
   * Edita o dono. Tambem edita quem tem `dashboards.manage` com escopo total —
   * senao um painel publicado por alguem que saiu da empresa ficaria orfao, sem
   * ninguem capaz de corrigi-lo ou tira-lo do ar.
   */
  private async podeEditar(
    painel: DashboardEntity,
    actorId: string,
    actorRole: string,
  ): Promise<boolean> {
    if (painel.createdBy === actorId) {
      return this.permissionsService.hasAny(actorRole, 'dashboards.manage');
    }
    return (await this.permissionsService.getScope(actorRole, 'dashboards.manage')) === 'all';
  }

  private async assertPodeMontar(actorRole: string): Promise<void> {
    if (!(await this.permissionsService.hasAny(actorRole, 'dashboards.manage'))) {
      throw new ForbiddenException('Apenas perfis de gestão podem montar painéis.');
    }
  }

  private async contarWidgets(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const linhas = await this.widgetsRepository
      .createQueryBuilder('widget')
      .select('widget.dashboard_id', 'dashboardId')
      .addSelect('COUNT(*)::int', 'total')
      .where('widget.dashboard_id IN (:...ids)', { ids })
      .groupBy('widget.dashboard_id')
      .getRawMany<{ dashboardId: string; total: number }>();
    return new Map(linhas.map((linha) => [linha.dashboardId, Number(linha.total)]));
  }
}
