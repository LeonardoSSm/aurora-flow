import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { DashboardEntity, DashboardWidgetEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import type { UpsertDashboardDto } from './dto/dashboard.dto';
import { empacotar } from './grid-layout.util';
import type { WidgetConfig, WidgetResultado } from './widget-config.types';
import type { CampoDisponivel } from './widget-query.service';
import { WidgetQueryService } from './widget-query.service';

export type DashboardWidgetComDados = {
  id: string;
  title: string;
  kind: string;
  configJson: Record<string, unknown>;
  position: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Resultado calculado ao vivo, ou o motivo de não ter sido possível. */
  resultado: WidgetResultado | null;
  erro: string | null;
};

export type DashboardComDados = {
  /** true = sugestão montada na hora, ainda não salva por ninguém. */
  gerado: boolean;
  id: string;
  formId: string;
  name: string;
  description: string | null;
  widgets: DashboardWidgetComDados[];
  podeEditar: boolean;
};

/** Quantos widgets a sugestão pode ter — formulário de 38 campos não vira 38 blocos. */
const MAX_WIDGETS_SUGERIDOS = 8;

type WidgetSugerido = {
  id: string;
  title: string;
  kind: string;
  configJson: Record<string, unknown>;
  position: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Painel sugerido para um formulario que ainda nao tem o seu.
 *
 * Reproduz o que a aba Analytics entregava — volume total, recorte recente e
 * evolucao no tempo — e completa com os campos que rendem indicador, dando
 * preferencia a campo de escolha (distribuicao le melhor) e depois a numerico.
 *
 * O `id` vazio e proposital: nenhum destes widgets existe no banco. Salvar o
 * painel e o que os torna reais.
 */
function sugerirWidgets(campos: CampoDisponivel[]): WidgetSugerido[] {
  const sugeridos: Array<Omit<WidgetSugerido, 'id' | 'position' | 'x' | 'y' | 'w' | 'h'>> = [
    {
      title: 'Total de respostas',
      kind: 'kpi',
      configJson: { campo: null, agregacao: 'contagem', periodoDias: null },
    },
    {
      title: 'Últimos 30 dias',
      kind: 'kpi',
      configJson: { campo: null, agregacao: 'contagem', periodoDias: 30 },
    },
    {
      title: 'Taxa de conclusão',
      kind: 'kpi',
      configJson: { campo: null, agregacao: 'taxa', periodoDias: null },
    },
    {
      title: 'Volume de respostas',
      kind: 'serie',
      configJson: { campo: null, intervalo: 'dia', periodoDias: 30 },
    },
  ];

  const escolha = campos.filter((campo) => campo.tiposDeWidget.includes('categorias'));
  const numericos = campos.filter((campo) => campo.tiposDeWidget.includes('serie'));
  const textos = campos.filter((campo) => campo.tiposDeWidget.includes('ranking'));

  for (const campo of escolha) {
    if (sugeridos.length >= MAX_WIDGETS_SUGERIDOS) break;
    sugeridos.push({
      title: campo.label,
      kind: 'categorias',
      configJson: { campo: campo.code, periodoDias: null },
    });
  }

  for (const campo of numericos) {
    if (sugeridos.length >= MAX_WIDGETS_SUGERIDOS) break;
    sugeridos.push({
      title: `Soma de ${campo.label}`,
      kind: 'kpi',
      configJson: { campo: campo.code, agregacao: 'soma', periodoDias: null },
    });
  }

  for (const campo of textos) {
    if (sugeridos.length >= MAX_WIDGETS_SUGERIDOS) break;
    sugeridos.push({
      title: campo.label,
      kind: 'ranking',
      configJson: { campo: campo.code, limite: 5, periodoDias: null },
    });
  }

  const comPosicao = sugeridos.map((widget, position) => ({ ...widget, id: '', position }));
  return empacotar(comPosicao);
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly widgetQuery: WidgetQueryService,
    private readonly processAccess: ProcessAccessService,
    @InjectRepository(DashboardEntity)
    private readonly dashboardsRepository: Repository<DashboardEntity>,
    @InjectRepository(DashboardWidgetEntity)
    private readonly widgetsRepository: Repository<DashboardWidgetEntity>,
  ) {}

  /**
   * Painel do formulario com todos os widgets ja calculados.
   *
   * Os widgets sao calculados em paralelo e cada falha fica contida no proprio
   * widget: um campo removido do formulario derruba um bloco, nao a tela
   * inteira. A configuracao e revalidada a cada leitura justamente por isso —
   * o formulario muda depois que o painel foi montado.
   */
  async obterPainel(
    formId: string,
    actorId: string,
    actorRole: string,
    periodoDias?: number | null,
  ): Promise<DashboardComDados> {
    // Delegado ao motor: mesma regra de acesso do formulário, 403/404 iguais.
    const campos = await this.widgetQuery.listarCamposDisponiveis(formId, actorId);

    const dashboard = await this.dashboardsRepository.findOne({
      where: { formId },
      relations: { widgets: true },
    });

    // Sem painel salvo, o formulário não fica sem indicador nenhum: monta-se uma
    // sugestão na hora, a partir dos campos que existem. É o que garante que a
    // troca da aba Analytics não tire nada de ninguém.
    const gerado = !dashboard;
    const widgets = dashboard
      ? [...(dashboard.widgets ?? [])].sort((a, b) => a.position - b.position)
      : sugerirWidgets(campos);

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
          const configBase = widget.configJson as WidgetConfig;
          const resultado = await this.widgetQuery.executar(
            formId,
            {
              ...configBase,
              tipo: widget.kind as WidgetConfig['tipo'],
              // Período do topo, quando escolhido, vale para o painel inteiro.
              periodoDias: periodoDias === undefined ? configBase.periodoDias : periodoDias,
            },
            actorId,
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
      gerado,
      id: dashboard?.id ?? '',
      formId,
      name: dashboard?.name ?? 'Visão geral',
      description: dashboard?.description ?? null,
      widgets: calculados,
      podeEditar: await this.podeEditar(formId, actorId, actorRole),
    };
  }

  /**
   * Cria ou substitui o painel do formulario.
   *
   * A lista de widgets recebida e a verdade: o que nao vier e removido. Isso
   * casa com a tela, que edita o painel inteiro e salva de uma vez, e evita um
   * protocolo de diferencas que a interface nao usaria.
   */
  async salvarPainel(
    formId: string,
    dto: UpsertDashboardDto,
    actorId: string,
    actorRole: string,
  ): Promise<DashboardComDados> {
    await this.assertPodeEditar(formId, actorId, actorRole);
    await this.widgetQuery.listarCamposDisponiveis(formId, actorId);

    // Valida cada widget contra o formulário real antes de gravar — guardar
    // configuração que já nasce inválida só adia o erro para a leitura.
    for (const widget of dto.widgets) {
      await this.widgetQuery.executar(
        formId,
        { ...(widget.configJson as WidgetConfig), tipo: widget.kind },
        actorId,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const dashboardsRepo = manager.getRepository(DashboardEntity);
      const widgetsRepo = manager.getRepository(DashboardWidgetEntity);

      let dashboard = await dashboardsRepo.findOne({ where: { formId } });
      if (dashboard) {
        dashboard.name = dto.name;
        dashboard.description = dto.description ?? null;
        await dashboardsRepo.save(dashboard);
      } else {
        dashboard = await dashboardsRepo.save(
          dashboardsRepo.create({
            formId,
            name: dto.name,
            description: dto.description ?? null,
            createdBy: actorId,
          }),
        );
      }

      const enviados = dto.widgets.map((widget) => widget.id).filter(Boolean) as string[];
      const existentes = await widgetsRepo.find({ where: { dashboardId: dashboard.id } });
      const removidos = existentes
        .filter((widget) => !enviados.includes(widget.id))
        .map((widget) => widget.id);
      if (removidos.length > 0) {
        await widgetsRepo.delete({ id: In(removidos) });
      }

      for (const [indice, widget] of dto.widgets.entries()) {
        const dados = {
          dashboardId: dashboard.id,
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

    return this.obterPainel(formId, actorId, actorRole);
  }

  async removerPainel(formId: string, actorId: string, actorRole: string): Promise<void> {
    await this.assertPodeEditar(formId, actorId, actorRole);
    await this.widgetQuery.listarCamposDisponiveis(formId, actorId);

    const dashboard = await this.dashboardsRepository.findOne({ where: { formId } });
    if (!dashboard) throw new NotFoundException('Este formulário não tem painel.');
    // Os widgets caem junto pelo ON DELETE CASCADE.
    await this.dashboardsRepository.delete({ id: dashboard.id });
  }

  /** Executa uma configuração sem gravar — é o que alimenta a pré-visualização. */
  async previsualizar(
    formId: string,
    config: WidgetConfig,
    actorId: string,
    actorRole: string,
  ): Promise<WidgetResultado> {
    await this.assertPodeEditar(formId, actorId, actorRole);
    return this.widgetQuery.executar(formId, config, actorId);
  }

  /** "Montar o painel do processo" no vínculo (ou acesso total pelo perfil). */
  private async podeEditar(formId: string, actorId: string, actorRole: string): Promise<boolean> {
    return this.processAccess.hasInProcess({ sub: actorId, role: actorRole }, formId, 'analytics.manage');
  }

  private async assertPodeEditar(formId: string, actorId: string, actorRole: string): Promise<void> {
    if (!(await this.podeEditar(formId, actorId, actorRole))) {
      throw new ForbiddenException('Você não pode montar o painel deste processo.');
    }
  }
}
