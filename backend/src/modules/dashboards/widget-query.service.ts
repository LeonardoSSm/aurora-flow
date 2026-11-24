import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormEntity, FormVersionEntity, SubmissionEntity, UserEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import {
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  PERIODO_MAXIMO_DIAS,
  TIPOS_ESCOLHA,
  TIPOS_NUMERICOS,
  agregacoesDoTipo,
  tiposDeWidgetDoCampo,
  type Agregacao,
  type Intervalo,
  type WidgetConfig,
  type WidgetTipo,
  type WidgetResultado,
} from './widget-config.types';

/**
 * Traduz a configuracao de um widget em consulta agregada.
 *
 * A pessoa nunca escreve consulta: escolhe campo, agregacao e formato na tela, e
 * isso chega aqui como objeto. O motor confere cada escolha contra a definicao
 * real do formulario, monta SQL parametrizado e devolve os pontos.
 *
 * Duas regras que nao se negociam:
 *
 * - **Nada vindo do cliente entra na consulta como texto.** `campo` vai como
 *   parametro; funcao de agregacao e intervalo saem de mapas fechados. Nao ha
 *   caminho em que um valor recebido vire fragmento de SQL.
 * - **Acesso e o mesmo do formulario.** Quem nao enxerga o formulario nao
 *   enxerga indicador dele, pela mesma regra de escopo e atribuicao usada na
 *   listagem, nas respostas e no kanban.
 */

/** Funcoes de agregacao permitidas — a chave e o unico caminho ate o SQL. */
const FUNCAO_SQL: Record<
  Exclude<Agregacao, 'contagem' | 'distintos' | 'taxa' | 'sla' | 'idade'>,
  string
> = {
  soma: 'SUM',
  media: 'AVG',
  minimo: 'MIN',
  maximo: 'MAX',
};

/**
 * O que conta como resposta de fato.
 *
 * A validacao de envio ja recusa valor vazio, entao na pratica a linha existir
 * basta; o predicado protege contra linha importada ou legada, e evita que uma
 * string em branco infle a taxa.
 */
const PREENCHIDO = `(
  (si.value_text IS NOT NULL AND btrim(si.value_text) <> '')
  OR si.value_number IS NOT NULL
  OR si.value_boolean IS NOT NULL
  OR (si.value_json IS NOT NULL AND si.value_json <> '[]'::jsonb)
)`;

const INTERVALO_SQL: Record<Intervalo, string> = {
  dia: 'day',
  semana: 'week',
  mes: 'month',
};

type CampoDoFormulario = { code: string; label: string; fieldType: FormFieldType };

/** Formulario que a pessoa pode usar como fonte de um bloco. */
export type FormularioDisponivel = { id: string; name: string; status: string };

/** Campo do formulario com os formatos e agregacoes que ele suporta. */
export type CampoDisponivel = {
  code: string;
  label: string;
  fieldType: FormFieldType;
  tiposDeWidget: WidgetTipo[];
  agregacoes: Agregacao[];
};

type LinhaValor = { valor: string | number | null };
type LinhaTaxa = { total: string | number; respondidas: string | number };
type LinhaPonto = {
  rotulo: string | Date | null;
  valor: string | number | null;
  valor2?: string | number | null;
};

/** Pedaço de SQL pronto pra colar numa consulta: junta `si2` e soma/media/etc por cima. */
type SegundaMetricaSql = { join: string; expressao: string };

@Injectable()
export class WidgetQueryService {
  constructor(
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly versionsRepository: Repository<FormVersionEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepository: Repository<SubmissionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  /** Campos que podem virar indicador, com os formatos e agregações válidos de cada um. */
  async listarCamposDisponiveis(formId: string, actorId: string): Promise<CampoDisponivel[]> {
    await this.assertFormAccess(formId, actorId);
    const campos = await this.carregarCampos(formId);

    return [...campos.values()]
      .map((campo) => ({
        code: campo.code,
        label: campo.label,
        fieldType: campo.fieldType,
        tiposDeWidget: tiposDeWidgetDoCampo(campo.fieldType),
        agregacoes: agregacoesDoTipo(campo.fieldType),
      }))
      .filter((campo) => campo.tiposDeWidget.length > 0);
  }

  /**
   * Formularios que a pessoa pode usar como fonte num painel livre.
   *
   * Mesma regra de `assertFormAccess`, so que em lista: atribuicao vence
   * escopo. Se um formulario aparece aqui, executar um bloco sobre ele passa —
   * e se some daqui, o bloco ja salvo passa a falhar sozinho, sem derrubar o
   * painel.
   */
  async listarFormulariosDisponiveis(
    actorId: string,
    actorRole: string,
  ): Promise<FormularioDisponivel[]> {
    const actor = await this.usersRepository.findOne({ where: { id: actorId } });
    if (!actor) throw new NotFoundException('Usuário não encontrado.');

    const qb = this.formsRepository
      .createQueryBuilder('form')
      .select(['form.id', 'form.name', 'form.status'])
      .orderBy('form.name', 'ASC');

    const grants = await this.processAccess.grantsOf({ sub: actor.id, role: actorRole });
    this.processAccess.applyFormScope(qb, grants, 'form.id', 'analytics.view');

    const forms = await qb.getMany();
    return forms.map((form) => ({ id: form.id, name: form.name, status: form.status }));
  }

  async executar(
    formId: string,
    config: WidgetConfig,
    actorId: string,
  ): Promise<WidgetResultado> {
    const form = await this.assertFormAccess(formId, actorId);
    const campos = await this.carregarCampos(formId);
    const validada = this.validarConfig(config, campos);

    // Filtro global de área do painel livre: o bloco é de um formulário só, e
    // não bater com a área escolhida significa que ele não contribui nada —
    // mesmo tratamento que um período sem dado algum, não um erro.
    if (validada.areaId && form.areaId !== validada.areaId) {
      return { tipo: validada.tipo, valor: null, pontos: [] };
    }

    switch (validada.tipo) {
      case 'kpi':
        return this.executarKpi(formId, validada, campos);
      case 'categorias':
        return this.executarCategorias(formId, validada, campos);
      case 'serie':
        return this.executarSerie(formId, validada, campos);
      case 'ranking':
        return this.executarRanking(formId, validada);
    }
  }

  // ─── Validação ──────────────────────────────────────────────────────────────

  /**
   * Recusa qualquer combinação que produziria número sem significado — média de
   * CPF, distribuição de campo de texto livre, série sem intervalo. A tela só
   * oferece combinações válidas; isto existe porque a API não pode confiar nisso.
   */
  private validarConfig(
    config: WidgetConfig,
    campos: Map<string, CampoDoFormulario>,
  ): Required<Pick<WidgetConfig, 'tipo'>> & WidgetConfig {
    const tiposConhecidos = ['kpi', 'categorias', 'serie', 'ranking'];
    if (!tiposConhecidos.includes(config.tipo)) {
      throw new BadRequestException(`Tipo de widget desconhecido: "${String(config.tipo)}".`);
    }

    const periodoDias = this.normalizarPeriodo(config.periodoDias);
    const limite = this.normalizarLimite(config.limite);
    const segundaMetrica = this.validarSegundaMetrica(config, campos);

    // KPI de contagem sem campo conta submissões — único caso sem campo.
    const semCampo = !config.campo;
    if (semCampo) {
      if (config.tipo !== 'kpi' && config.tipo !== 'serie') {
        throw new BadRequestException(`O widget "${config.tipo}" exige um campo.`);
      }
      const agregacaoSemCampo = config.agregacao ?? 'contagem';
      // Sem campo so ha duas leituras possiveis: quantas submissoes chegaram, e
      // que fracao delas chegou com alguma resposta — a taxa de conclusao.
      if (config.tipo === 'kpi' && agregacaoSemCampo !== 'contagem' && agregacaoSemCampo !== 'taxa') {
        throw new BadRequestException(
          'Sem campo, as únicas agregações possíveis são a contagem e a taxa de conclusão.',
        );
      }
      if (config.tipo === 'serie' && agregacaoSemCampo === 'taxa') {
        throw new BadRequestException('A taxa de conclusão só existe como indicador único.');
      }
      return {
        ...config,
        periodoDias,
        limite,
        agregacao: config.tipo === 'kpi' ? agregacaoSemCampo : 'contagem',
        ...segundaMetrica,
      };
    }

    const campo = campos.get(config.campo as string);
    if (!campo) {
      throw new BadRequestException(`Campo "${config.campo}" não existe neste formulário.`);
    }

    const formatos = tiposDeWidgetDoCampo(campo.fieldType);
    if (!formatos.includes(config.tipo)) {
      throw new BadRequestException(
        `O campo "${campo.label}" não pode ser exibido como "${config.tipo}".`,
      );
    }

    const agregacao = config.agregacao ?? 'contagem';
    if (agregacao === 'taxa' && config.tipo !== 'kpi') {
      throw new BadRequestException('A taxa de preenchimento só existe como indicador único.');
    }
    if (config.tipo === 'kpi' || config.tipo === 'serie') {
      const permitidas = agregacoesDoTipo(campo.fieldType);
      if (!permitidas.includes(agregacao)) {
        throw new BadRequestException(
          `A agregação "${agregacao}" não se aplica ao campo "${campo.label}".`,
        );
      }
    }

    return { ...config, agregacao, periodoDias, limite, ...segundaMetrica };
  }

  /**
   * Segunda métrica: sempre numérica, sempre soma/média/mínimo/máximo por cima
   * do mesmo agrupamento da primeira — não existe em kpi, que já é um número
   * só, nada para combinar.
   */
  private validarSegundaMetrica(
    config: WidgetConfig,
    campos: Map<string, CampoDoFormulario>,
  ): { campo2?: string | null; agregacao2?: Agregacao } {
    if (!config.campo2) return {};
    if (config.tipo === 'kpi') {
      throw new BadRequestException('Uma segunda métrica não se aplica a um número único.');
    }
    const campo2 = campos.get(config.campo2);
    if (!campo2) {
      throw new BadRequestException(`Campo "${config.campo2}" não existe neste formulário.`);
    }
    if (!TIPOS_NUMERICOS.has(campo2.fieldType)) {
      throw new BadRequestException(`O campo "${campo2.label}" não é numérico.`);
    }
    const agregacao2 = config.agregacao2 ?? 'soma';
    if (!FUNCAO_SQL[agregacao2 as keyof typeof FUNCAO_SQL]) {
      throw new BadRequestException(
        `A segunda métrica só aceita soma, média, mínimo ou máximo — "${agregacao2}" não vale aqui.`,
      );
    }
    return { campo2: config.campo2, agregacao2 };
  }

  /** Monta o JOIN e a expressão de agregação da segunda métrica, parametrizados. */
  private montarSegundaMetricaSql(
    params: unknown[],
    campo2: string,
    agregacao2: Agregacao,
  ): SegundaMetricaSql {
    const funcao = FUNCAO_SQL[agregacao2 as keyof typeof FUNCAO_SQL] ?? 'SUM';
    const paramCampo2 = `$${params.push(campo2)}`;
    return {
      join: `LEFT JOIN submission_items si2 ON si2.submission_id = s.id AND si2.field_code = ${paramCampo2} AND si2.value_number IS NOT NULL`,
      expressao: `${funcao}(si2.value_number)`,
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

  private desde(periodoDias: number | null): Date | null {
    if (periodoDias === null) return null;
    const desde = new Date();
    desde.setUTCHours(0, 0, 0, 0);
    desde.setUTCDate(desde.getUTCDate() - (periodoDias - 1));
    return desde;
  }

  // ─── Execução ───────────────────────────────────────────────────────────────

  private async executarKpi(
    formId: string,
    config: WidgetConfig,
    campos: Map<string, CampoDoFormulario>,
  ): Promise<WidgetResultado> {
    const desde = this.desde(config.periodoDias ?? null);
    const params: unknown[] = [formId];
    const filtroPeriodo = desde ? ` AND s.submitted_at >= $${params.push(desde)}` : '';

    // Sem campo: quantas submissões o formulário recebeu — ou que fração delas
    // chegou preenchida, que é a taxa de conclusão herdada do analytics antigo.
    if (!config.campo) {
      if ((config.agregacao ?? 'contagem') === 'taxa') {
        const linhas = await this.submissionsRepository.manager.query<LinhaTaxa[]>(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM submission_items si
                    WHERE si.submission_id = s.id AND ${PREENCHIDO}
                  ))::int AS respondidas
           FROM submissions s
           WHERE s.form_id = $1${filtroPeriodo}`,
          params,
        );
        return { tipo: 'kpi', valor: this.percentual(linhas[0]), pontos: [], unidade: 'percentual' };
      }

      const linhas = await this.submissionsRepository.manager.query<LinhaValor[]>(
        `SELECT COUNT(*)::int AS valor FROM submissions s WHERE s.form_id = $1${filtroPeriodo}`,
        params,
      );
      return { tipo: 'kpi', valor: Number(linhas[0]?.valor ?? 0), pontos: [] };
    }

    const campo = campos.get(config.campo) as CampoDoFormulario;
    const paramCampo = `$${params.push(config.campo)}`;
    const agregacao = config.agregacao ?? 'contagem';

    // Denominador é toda submissão do formulário no período, não só as que têm
    // o campo — senão a taxa daria 100% sempre.
    if (agregacao === 'taxa') {
      const linhas = await this.submissionsRepository.manager.query<LinhaTaxa[]>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM submission_items si
                  WHERE si.submission_id = s.id
                    AND si.field_code = ${paramCampo}
                    AND ${PREENCHIDO}
                ))::int AS respondidas
         FROM submissions s
         WHERE s.form_id = $1${filtroPeriodo}`,
        params,
      );
      return { tipo: 'kpi', valor: this.percentual(linhas[0]), pontos: [], unidade: 'percentual' };
    }

    if (agregacao === 'contagem') {
      const linhas = await this.submissionsRepository.manager.query<LinhaValor[]>(
        `SELECT COUNT(*)::int AS valor
         FROM submission_items si
         INNER JOIN submissions s ON s.id = si.submission_id
         WHERE s.form_id = $1 AND si.field_code = ${paramCampo}${filtroPeriodo}`,
        params,
      );
      return { tipo: 'kpi', valor: Number(linhas[0]?.valor ?? 0), pontos: [] };
    }

    if (agregacao === 'distintos') {
      const linhas = await this.submissionsRepository.manager.query<LinhaValor[]>(
        `SELECT COUNT(DISTINCT si.value_text)::int AS valor
         FROM submission_items si
         INNER JOIN submissions s ON s.id = si.submission_id
         WHERE s.form_id = $1 AND si.field_code = ${paramCampo}
           AND si.value_text IS NOT NULL${filtroPeriodo}`,
        params,
      );
      return { tipo: 'kpi', valor: Number(linhas[0]?.valor ?? 0), pontos: [] };
    }

    // Numérico: a coluna é sempre `value_number` — inclusive para moeda, que
    // passou a gravar as duas colunas (migração 1786900000000).
    if (!TIPOS_NUMERICOS.has(campo.fieldType)) {
      throw new BadRequestException(`O campo "${campo.label}" não é numérico.`);
    }
    // `sla` e `idade` existem no catálogo, mas só na fonte de solicitações —
    // aqui não há função de agregação correspondente, e o mapa é o único
    // caminho até o SQL.
    const funcao = FUNCAO_SQL[agregacao as keyof typeof FUNCAO_SQL];
    if (!funcao) {
      throw new BadRequestException(`A agregação "${agregacao}" não vale sobre respostas.`);
    }
    const linhas = await this.submissionsRepository.manager.query<LinhaValor[]>(
      `SELECT ${funcao}(si.value_number) AS valor
       FROM submission_items si
       INNER JOIN submissions s ON s.id = si.submission_id
       WHERE s.form_id = $1 AND si.field_code = ${paramCampo}
         AND si.value_number IS NOT NULL${filtroPeriodo}`,
      params,
    );

    const bruto = linhas[0]?.valor;
    return {
      tipo: 'kpi',
      valor: bruto === null || bruto === undefined ? null : this.arredondar(Number(bruto)),
      pontos: [],
    };
  }

  private async executarCategorias(
    formId: string,
    config: WidgetConfig,
    campos: Map<string, CampoDoFormulario>,
  ): Promise<WidgetResultado> {
    const campo = campos.get(config.campo as string) as CampoDoFormulario;
    if (!TIPOS_ESCOLHA.has(campo.fieldType)) {
      throw new BadRequestException(`O campo "${campo.label}" não é de escolha.`);
    }

    const desde = this.desde(config.periodoDias ?? null);
    const params: unknown[] = [formId, config.campo];
    const filtroPeriodo = desde ? ` AND s.submitted_at >= $${params.push(desde)}` : '';
    const paramLimite = `$${params.push(config.limite ?? LIMITE_PADRAO)}`;
    const campo2Sql = config.campo2
      ? this.montarSegundaMetricaSql(params, config.campo2, config.agregacao2 ?? 'soma')
      : null;
    const colunaValor2 = campo2Sql ? `, ${campo2Sql.expressao} AS valor2` : '';
    const joinValor2 = campo2Sql?.join ?? '';

    // Múltipla escolha guarda um array: cada opção marcada conta uma vez.
    const sql =
      campo.fieldType === FormFieldType.MULTI_SELECT
        ? `SELECT opt.value AS rotulo, COUNT(*)::int AS valor${colunaValor2}
           FROM submission_items si
           INNER JOIN submissions s ON s.id = si.submission_id
           CROSS JOIN LATERAL jsonb_array_elements_text(si.value_json) AS opt(value)
           ${joinValor2}
           WHERE s.form_id = $1 AND si.field_code = $2
             AND jsonb_typeof(si.value_json) = 'array'${filtroPeriodo}
           GROUP BY opt.value
           ORDER BY COUNT(*) DESC, opt.value ASC
           LIMIT ${paramLimite}`
        : `SELECT COALESCE(si.value_text, CASE WHEN si.value_boolean THEN 'true' ELSE 'false' END) AS rotulo,
                  COUNT(*)::int AS valor${colunaValor2}
           FROM submission_items si
           INNER JOIN submissions s ON s.id = si.submission_id
           ${joinValor2}
           WHERE s.form_id = $1 AND si.field_code = $2
             AND (si.value_text IS NOT NULL OR si.value_boolean IS NOT NULL)${filtroPeriodo}
           GROUP BY rotulo
           ORDER BY COUNT(*) DESC, rotulo ASC
           LIMIT ${paramLimite}`;

    const linhas = await this.submissionsRepository.manager.query<LinhaPonto[]>(sql, params);
    return { tipo: 'categorias', valor: null, pontos: this.mapearPontos(linhas) };
  }

  private async executarSerie(
    formId: string,
    config: WidgetConfig,
    campos: Map<string, CampoDoFormulario>,
  ): Promise<WidgetResultado> {
    const intervalo = INTERVALO_SQL[config.intervalo ?? 'dia'];
    if (!intervalo) {
      throw new BadRequestException(`Intervalo desconhecido: "${String(config.intervalo)}".`);
    }

    const desde = this.desde(config.periodoDias ?? null);
    const params: unknown[] = [formId];
    const filtroPeriodo = desde ? ` AND s.submitted_at >= $${params.push(desde)}` : '';
    const campo2Sql = config.campo2
      ? this.montarSegundaMetricaSql(params, config.campo2, config.agregacao2 ?? 'soma')
      : null;
    const colunaValor2 = campo2Sql ? `, ${campo2Sql.expressao} AS valor2` : '';
    const joinValor2 = campo2Sql?.join ?? '';

    // Sem campo: volume de submissões ao longo do tempo.
    if (!config.campo) {
      const linhas = await this.submissionsRepository.manager.query<LinhaPonto[]>(
        `SELECT DATE_TRUNC('${intervalo}', s.submitted_at) AS rotulo, COUNT(*)::int AS valor${colunaValor2}
         FROM submissions s
         ${joinValor2}
         WHERE s.form_id = $1 AND s.submitted_at IS NOT NULL${filtroPeriodo}
         GROUP BY 1
         ORDER BY 1 ASC`,
        params,
      );
      return { tipo: 'serie', valor: null, pontos: this.mapearPontos(linhas, true) };
    }

    const campo = campos.get(config.campo) as CampoDoFormulario;
    if (!TIPOS_NUMERICOS.has(campo.fieldType)) {
      throw new BadRequestException(
        `Série com campo exige campo numérico; "${campo.label}" não é.`,
      );
    }

    const agregacao = config.agregacao ?? 'soma';
    const funcao =
      agregacao === 'contagem'
        ? 'COUNT'
        : FUNCAO_SQL[agregacao as keyof typeof FUNCAO_SQL];
    if (!funcao) {
      throw new BadRequestException(`A agregação "${agregacao}" não vale em série temporal.`);
    }
    const paramCampo = `$${params.push(config.campo)}`;
    const expressao = agregacao === 'contagem' ? 'COUNT(*)::int' : `${funcao}(si.value_number)`;

    const linhas = await this.submissionsRepository.manager.query<LinhaPonto[]>(
      `SELECT DATE_TRUNC('${intervalo}', s.submitted_at) AS rotulo, ${expressao} AS valor${colunaValor2}
       FROM submission_items si
       INNER JOIN submissions s ON s.id = si.submission_id
       ${joinValor2}
       WHERE s.form_id = $1 AND si.field_code = ${paramCampo}
         AND s.submitted_at IS NOT NULL
         AND si.value_number IS NOT NULL${filtroPeriodo}
       GROUP BY 1
       ORDER BY 1 ASC`,
      params,
    );
    return { tipo: 'serie', valor: null, pontos: this.mapearPontos(linhas, true) };
  }

  private async executarRanking(formId: string, config: WidgetConfig): Promise<WidgetResultado> {
    const desde = this.desde(config.periodoDias ?? null);
    const params: unknown[] = [formId, config.campo];
    const filtroPeriodo = desde ? ` AND s.submitted_at >= $${params.push(desde)}` : '';
    const paramLimite = `$${params.push(config.limite ?? LIMITE_PADRAO)}`;
    const campo2Sql = config.campo2
      ? this.montarSegundaMetricaSql(params, config.campo2, config.agregacao2 ?? 'soma')
      : null;
    const colunaValor2 = campo2Sql ? `, ${campo2Sql.expressao} AS valor2` : '';
    const joinValor2 = campo2Sql?.join ?? '';

    const linhas = await this.submissionsRepository.manager.query<LinhaPonto[]>(
      `SELECT btrim(si.value_text) AS rotulo, COUNT(*)::int AS valor${colunaValor2}
       FROM submission_items si
       INNER JOIN submissions s ON s.id = si.submission_id
       ${joinValor2}
       WHERE s.form_id = $1 AND si.field_code = $2
         AND si.value_text IS NOT NULL AND btrim(si.value_text) <> ''${filtroPeriodo}
       GROUP BY btrim(si.value_text)
       ORDER BY COUNT(*) DESC, btrim(si.value_text) ASC
       LIMIT ${paramLimite}`,
      params,
    );
    return { tipo: 'ranking', valor: null, pontos: this.mapearPontos(linhas) };
  }

  // ─── Apoio ──────────────────────────────────────────────────────────────────

  private mapearPontos(
    linhas: LinhaPonto[],
    rotuloEhData = false,
  ): Array<{ rotulo: string; valor: number; valor2?: number }> {
    return linhas.map((linha) => ({
      rotulo: rotuloEhData
        ? new Date(linha.rotulo as string | Date).toISOString().slice(0, 10)
        : String(linha.rotulo ?? ''),
      valor: this.arredondar(Number(linha.valor ?? 0)),
      ...(linha.valor2 !== undefined && linha.valor2 !== null
        ? { valor2: this.arredondar(Number(linha.valor2)) }
        : {}),
    }));
  }

  /** Fracao respondida/total em pontos percentuais; sem submissao, nao ha taxa. */
  private percentual(linha: LinhaTaxa | undefined): number | null {
    const total = Number(linha?.total ?? 0);
    if (!total) return null;
    return this.arredondar((Number(linha?.respondidas ?? 0) / total) * 100);
  }

  private arredondar(valor: number): number {
    return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0;
  }

  private async carregarCampos(formId: string): Promise<Map<string, CampoDoFormulario>> {
    const versao = await this.versionsRepository.findOne({
      where: { formId },
      order: { versionNumber: 'DESC' },
      relations: ['sections', 'sections.fields'],
    });

    const campos = new Map<string, CampoDoFormulario>();
    for (const secao of versao?.sections ?? []) {
      for (const campo of secao.fields ?? []) {
        campos.set(campo.code, {
          code: campo.code,
          label: campo.label,
          fieldType: campo.fieldType,
        });
      }
    }
    return campos;
  }

  /** Mesma regra do formulário: atribuição vence escopo, escopo vence o resto. */
  private async assertFormAccess(formId: string, actorId: string): Promise<FormEntity> {
    const [form, actor] = await Promise.all([
      this.formsRepository.findOne({ where: { id: formId } }),
      this.usersRepository.findOne({ where: { id: actorId } }),
    ]);

    if (!form) throw new NotFoundException('Formulário não encontrado.');
    if (!actor) throw new NotFoundException('Usuário não encontrado.');

    // "Ver o painel do processo" no vínculo (ou acesso total pelo perfil).
    if (!(await this.processAccess.hasInProcess({ sub: actor.id, role: actor.role }, form.id, 'analytics.view'))) {
      throw new ForbiddenException('Acesso negado.');
    }

    return form;
  }
}
