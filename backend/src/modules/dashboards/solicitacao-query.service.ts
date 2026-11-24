import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Repository } from 'typeorm';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { SolicitationEntity, UserEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import {
  KANBAN_COLUMNS,
  TERMINAL_SOLICITATION_STATUSES,
} from '../solicitations/solicitation-transitions';
import {
  AGREGACOES_SOLICITACAO,
  DIMENSOES_SOLICITACAO,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  PERIODO_MAXIMO_DIAS,
  tiposDeWidgetDaDimensao,
  type Agregacao,
  type DimensaoSolicitacao,
  type Intervalo,
  type WidgetConfig,
  type WidgetResultado,
} from './widget-config.types';

/**
 * Traduz a configuracao de um widget em consulta agregada sobre solicitacoes.
 *
 * Motor irmao do de respostas, e separado dele de proposito: o assunto e outro
 * (uma solicitacao nao tem campos, tem colunas), e sobretudo a **regra de
 * acesso e outra**. Respostas passam por \`analytics.view\` de um formulario;
 * solicitacoes passam por \`solicitations.view\` com o mesmo filtro de escopo da
 * lista e do kanban — quem enxerga tres solicitacoes na tela ve indicador de
 * tres, nao da empresa toda.
 *
 * As duas regras que valem aqui tambem:
 *
 * - **Nada vindo do cliente entra na consulta como texto.** Dimensao, medida e
 *   intervalo saem de mapas fechados; valores viajam como parametro.
 * - **O filtro de escopo e o mesmo helper** usado pelo servico de solicitacoes,
 *   nao uma reimplementacao — divergencia entre os dois vazaria dado.
 */

/** Coluna de cada dimensao. Chave fechada: e o unico caminho ate o SQL. */
const COLUNA_DIMENSAO: Record<DimensaoSolicitacao, string> = {
  status: 'solicitation.status',
  prioridade: 'solicitation.priority',
  area: 'area.name',
  // `users` guarda o nome em `full_name`; o mapa e o unico caminho ate o SQL,
  // e foi aqui que o banco real pegou o erro que o teste mockado nao pegaria.
  responsavel: 'assignee.full_name',
  formulario: 'form.name',
  sla: 'solicitation.sla_status',
};

const INTERVALO_SQL: Record<Intervalo, string> = {
  dia: 'day',
  semana: 'week',
  mes: 'month',
};

const ROTULO_STATUS = new Map(KANBAN_COLUMNS.map((coluna) => [coluna.status as string, coluna.label]));

const ROTULO_PRIORIDADE: Record<string, string> = {
  [SolicitationPriority.LOW]: 'Baixa',
  [SolicitationPriority.MEDIUM]: 'Média',
  [SolicitationPriority.HIGH]: 'Alta',
  [SolicitationPriority.URGENT]: 'Urgente',
};

const ROTULO_SLA: Record<string, string> = {
  [SolicitationSlaStatus.ON_TRACK]: 'No prazo',
  [SolicitationSlaStatus.WARNING]: 'Perto do limite',
  [SolicitationSlaStatus.BREACHED]: 'Prazo estourado',
  [SolicitationSlaStatus.PAUSED]: 'Pausado',
  [SolicitationSlaStatus.COMPLETED]: 'Concluído no prazo',
};

export const ROTULO_DIMENSAO: Record<DimensaoSolicitacao, string> = {
  status: 'Status',
  prioridade: 'Prioridade',
  area: 'Área',
  responsavel: 'Responsável',
  formulario: 'Formulário de origem',
  sla: 'Situação do prazo',
};

/** Dimensao oferecida a tela, com os formatos que ela rende. */
export type DimensaoDisponivel = {
  dimensao: DimensaoSolicitacao;
  label: string;
  tiposDeWidget: ReturnType<typeof tiposDeWidgetDaDimensao>;
};

type LinhaValor = { valor: string | number | null };
type LinhaTaxa = { total: string | number; parte: string | number };
type LinhaPonto = { rotulo: string | Date | null; valor: string | number | null };

@Injectable()
export class SolicitacaoQueryService {
  constructor(
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  /** Dimensões e medidas que a tela pode oferecer nesta fonte. */
  listarDimensoes(): { dimensoes: DimensaoDisponivel[]; agregacoes: Agregacao[] } {
    return {
      dimensoes: DIMENSOES_SOLICITACAO.map((dimensao) => ({
        dimensao,
        label: ROTULO_DIMENSAO[dimensao],
        tiposDeWidget: tiposDeWidgetDaDimensao(dimensao),
      })),
      agregacoes: [...AGREGACOES_SOLICITACAO],
    };
  }

  async executar(
    config: WidgetConfig,
    actorId: string,
    actorRole: string,
  ): Promise<WidgetResultado> {
    const validada = this.validarConfig(config);

    switch (validada.tipo) {
      case 'kpi':
        return this.executarKpi(validada, actorId, actorRole);
      case 'serie':
        return this.executarSerie(validada, actorId, actorRole);
      case 'categorias':
      case 'ranking':
        return this.executarPorDimensao(validada, actorId, actorRole);
    }
  }

  // ─── Validação ──────────────────────────────────────────────────────────────

  private validarConfig(config: WidgetConfig): WidgetConfig {
    const dimensao = config.dimensao ?? null;
    if (dimensao && !DIMENSOES_SOLICITACAO.includes(dimensao)) {
      throw new BadRequestException(`Dimensão desconhecida: "${String(dimensao)}".`);
    }

    const formatos = tiposDeWidgetDaDimensao(dimensao);
    if (!formatos.includes(config.tipo)) {
      throw new BadRequestException(
        dimensao
          ? `"${ROTULO_DIMENSAO[dimensao]}" não pode ser exibida como "${config.tipo}".`
          : `Sem dimensão, o widget "${config.tipo}" não tem o que agrupar.`,
      );
    }

    const agregacao = config.agregacao ?? 'contagem';
    if (!AGREGACOES_SOLICITACAO.includes(agregacao)) {
      throw new BadRequestException(
        `A medida "${agregacao}" não se aplica a solicitações.`,
      );
    }
    // Distribuição e ranking contam ocorrências; taxa e idade são números
    // únicos, que num gráfico de barras não diriam nada por categoria.
    if (config.tipo !== 'kpi' && agregacao !== 'contagem') {
      throw new BadRequestException('Distribuição e ranking só contam solicitações.');
    }
    if (config.tipo === 'serie' && agregacao !== 'contagem') {
      throw new BadRequestException('A evolução no tempo só conta solicitações.');
    }

    if (
      config.statusSolicitacao &&
      !Object.values(SolicitationStatus).includes(config.statusSolicitacao as SolicitationStatus)
    ) {
      throw new BadRequestException(`Status desconhecido: "${config.statusSolicitacao}".`);
    }

    return {
      ...config,
      dimensao,
      agregacao,
      periodoDias: this.normalizarPeriodo(config.periodoDias),
      limite: this.normalizarLimite(config.limite),
    };
  }

  private normalizarPeriodo(dias: number | null | undefined): number | null {
    if (dias === null || dias === undefined) return null;
    if (!Number.isFinite(dias) || dias <= 0) {
      throw new BadRequestException('O período em dias deve ser um número positivo.');
    }
    return Math.min(Math.trunc(dias), PERIODO_MAXIMO_DIAS);
  }

  private normalizarLimite(limite: number | undefined): number {
    if (limite === undefined) return LIMITE_PADRAO;
    if (!Number.isFinite(limite) || limite <= 0) {
      throw new BadRequestException('O limite deve ser um número positivo.');
    }
    return Math.min(Math.trunc(limite), LIMITE_MAXIMO);
  }

  // ─── Execução ───────────────────────────────────────────────────────────────

  private async executarKpi(
    config: WidgetConfig,
    actorId: string,
    actorRole: string,
  ): Promise<WidgetResultado> {
    const agregacao = config.agregacao ?? 'contagem';

    if (agregacao === 'contagem') {
      const qb = await this.baseQuery(
        actorId,
        actorRole,
        config.periodoDias ?? null,
        config.areaId,
        config.statusSolicitacao,
      );
      const linha = await qb.select('COUNT(*)::int', 'valor').getRawOne<LinhaValor>();
      return { tipo: 'kpi', valor: Number(linha?.valor ?? 0), pontos: [] };
    }

    if (agregacao === 'idade') {
      // Só as que ainda não terminaram: a média de idade de uma solicitação
      // concluída não é "tempo de fila", é história.
      const qb = await this.baseQuery(
        actorId,
        actorRole,
        config.periodoDias ?? null,
        config.areaId,
        config.statusSolicitacao,
      );
      const linha = await qb
        .andWhere('solicitation.status NOT IN (:...terminais)', {
          terminais: TERMINAL_SOLICITATION_STATUSES,
        })
        .select(
          'AVG(EXTRACT(EPOCH FROM (now() - solicitation.created_at)) / 3600.0)',
          'valor',
        )
        .getRawOne<LinhaValor>();
      const bruto = linha?.valor;
      return {
        tipo: 'kpi',
        valor: bruto === null || bruto === undefined ? null : this.arredondar(Number(bruto)),
        pontos: [],
        unidade: 'horas',
      };
    }

    // `taxa` e `sla` são frações; o que muda é o par numerador/denominador.
    const qb = await this.baseQuery(
      actorId,
      actorRole,
      config.periodoDias ?? null,
      config.areaId,
      config.statusSolicitacao,
    );
    const linha =
      agregacao === 'taxa'
        ? await qb
            .select('COUNT(*)::int', 'total')
            .addSelect(
              'COUNT(*) FILTER (WHERE solicitation.status = :concluido)::int',
              'parte',
            )
            .setParameter('concluido', 'completed')
            .getRawOne<LinhaTaxa>()
        : // Só as que tinham prazo entram na conta do SLA — sem prazo não há o
          // que cumprir, e incluí-las inflaria o indicador.
          await qb
            .andWhere('solicitation.sla_due_at IS NOT NULL')
            .select('COUNT(*)::int', 'total')
            .addSelect(
              'COUNT(*) FILTER (WHERE solicitation.sla_breached_at IS NULL)::int',
              'parte',
            )
            .getRawOne<LinhaTaxa>();

    return { tipo: 'kpi', valor: this.percentual(linha), pontos: [], unidade: 'percentual' };
  }

  private async executarSerie(
    config: WidgetConfig,
    actorId: string,
    actorRole: string,
  ): Promise<WidgetResultado> {
    const intervalo = INTERVALO_SQL[config.intervalo ?? 'dia'];
    if (!intervalo) {
      throw new BadRequestException(`Intervalo desconhecido: "${String(config.intervalo)}".`);
    }

    const qb = await this.baseQuery(
      actorId,
      actorRole,
      config.periodoDias ?? null,
      config.areaId,
      config.statusSolicitacao,
    );
    const linhas = await qb
      .select(`DATE_TRUNC('${intervalo}', solicitation.created_at)`, 'rotulo')
      .addSelect('COUNT(*)::int', 'valor')
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany<LinhaPonto>();

    return { tipo: 'serie', valor: null, pontos: this.mapearPontos(linhas, null, true) };
  }

  private async executarPorDimensao(
    config: WidgetConfig,
    actorId: string,
    actorRole: string,
  ): Promise<WidgetResultado> {
    const dimensao = config.dimensao as DimensaoSolicitacao;
    const coluna = COLUNA_DIMENSAO[dimensao];

    const qb = await this.baseQuery(
      actorId,
      actorRole,
      config.periodoDias ?? null,
      config.areaId,
      config.statusSolicitacao,
    );
    const linhas = await qb
      .select(coluna, 'rotulo')
      .addSelect('COUNT(*)::int', 'valor')
      .groupBy(coluna)
      .orderBy('2', 'DESC')
      .addOrderBy('1', 'ASC')
      .limit(config.limite ?? LIMITE_PADRAO)
      .getRawMany<LinhaPonto>();

    return {
      tipo: config.tipo,
      valor: null,
      pontos: this.mapearPontos(linhas, dimensao),
    };
  }

  // ─── Apoio ──────────────────────────────────────────────────────────────────

  /**
   * Consulta base com os joins e o filtro de escopo já aplicados.
   *
   * Os três `LEFT JOIN` entram sempre, não só quando a dimensão os usa: o
   * filtro de escopo referencia `form.created_by`, então `form` é obrigatório
   * de todo modo, e alternar os outros dois pela dimensão trocaria duas linhas
   * de SQL por um caminho a mais para errar.
   */
  private async baseQuery(
    actorId: string,
    actorRole: string,
    periodoDias: number | null,
    areaId?: string | null,
    status?: string | null,
  ): Promise<SelectQueryBuilder<SolicitationEntity>> {
    const actor = await this.usersRepository.findOne({ where: { id: actorId } });
    if (!actor) throw new NotFoundException('Usuário não encontrado.');

    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoin('forms', 'form', 'form.id = solicitation.form_id')
      .leftJoin('areas', 'area', 'area.id = solicitation.area_id')
      .leftJoin('users', 'assignee', 'assignee.id = solicitation.assignee_id');

    if (periodoDias !== null) {
      const desde = new Date();
      desde.setUTCHours(0, 0, 0, 0);
      desde.setUTCDate(desde.getUTCDate() - (periodoDias - 1));
      qb.andWhere('solicitation.created_at >= :desde', { desde });
    }
    if (areaId) {
      qb.andWhere('solicitation.area_id = :areaId', { areaId });
    }
    if (status) {
      qb.andWhere('solicitation.status = :status', { status });
    }

    // Os mesmos cards que a pessoa vê no quadro: pelo vínculo com cada processo.
    this.processAccess.applySolicitationScopeWith(
      qb as unknown as SelectQueryBuilder<ObjectLiteral>,
      await this.processAccess.grantsOf({ sub: actor.id, role: actorRole }),
      'solicitation',
    );

    return qb;
  }

  /** Traduz o código guardado no banco para o nome que a pessoa reconhece. */
  private rotular(dimensao: DimensaoSolicitacao | null, bruto: string): string {
    if (!bruto) return 'Sem definição';
    if (dimensao === 'status') return ROTULO_STATUS.get(bruto) ?? bruto;
    if (dimensao === 'prioridade') return ROTULO_PRIORIDADE[bruto] ?? bruto;
    if (dimensao === 'sla') return ROTULO_SLA[bruto] ?? bruto;
    return bruto;
  }

  private mapearPontos(
    linhas: LinhaPonto[],
    dimensao: DimensaoSolicitacao | null,
    rotuloEhData = false,
  ): Array<{ rotulo: string; valor: number }> {
    return linhas.map((linha) => ({
      rotulo: rotuloEhData
        ? new Date(linha.rotulo as string | Date).toISOString().slice(0, 10)
        : this.rotular(dimensao, String(linha.rotulo ?? '')),
      valor: this.arredondar(Number(linha.valor ?? 0)),
    }));
  }

  /** Fração parte/total em pontos percentuais; sem denominador, não há taxa. */
  private percentual(linha: LinhaTaxa | undefined): number | null {
    const total = Number(linha?.total ?? 0);
    if (!total) return null;
    return this.arredondar((Number(linha?.parte ?? 0) / total) * 100);
  }

  private arredondar(valor: number): number {
    return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0;
  }
}
