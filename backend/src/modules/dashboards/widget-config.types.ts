import { FormFieldType } from '../../common/enums/form-field-type.enum';

/**
 * Contrato de configuracao de um widget.
 *
 * O objeto que a tela monta e que fica guardado em `dashboard_widgets.config_json`
 * (fase 3). O motor nunca recebe SQL nem nome de coluna — recebe isto, valida
 * contra a definicao real do formulario e monta a consulta por conta propria.
 */

/** Formato do resultado, e tambem o que a tela desenha. */
export type WidgetTipo = 'kpi' | 'categorias' | 'serie' | 'ranking';

/**
 * De qual assunto o bloco fala.
 *
 * `respostas` le `submissions`/`submission_items` e a dimensao e um campo do
 * formulario. `solicitacoes` le `solicitations` e a dimensao e uma coluna dela
 * — status, area, responsavel. Sao dois motores distintos por tras, com regras
 * de acesso distintas (`analytics.view` de um formulario contra
 * `solicitations.view`), e e por isso que a fonte e escolhida antes de tudo.
 */
export type WidgetFonte = 'respostas' | 'solicitacoes';

/** Dimensoes de uma solicitacao — o que faz o papel de "campo" nessa fonte. */
export type DimensaoSolicitacao =
  | 'status'
  | 'prioridade'
  | 'area'
  | 'responsavel'
  | 'formulario'
  | 'sla';

export const DIMENSOES_SOLICITACAO: readonly DimensaoSolicitacao[] = [
  'status',
  'prioridade',
  'area',
  'responsavel',
  'formulario',
  'sla',
];

export type Agregacao =
  | 'contagem'
  | 'soma'
  | 'media'
  | 'minimo'
  | 'maximo'
  | 'distintos'
  /**
   * Fracao, em pontos percentuais. O numerador muda com a fonte: em respostas e
   * quem preencheu, em solicitacoes e quem chegou ao fim.
   */
  | 'taxa'
  /** So em solicitacoes: fracao das que tinham prazo e nao o estouraram. */
  | 'sla'
  /** So em solicitacoes: horas medias em aberto das que ainda nao terminaram. */
  | 'idade';

export type Intervalo = 'dia' | 'semana' | 'mes';

export type WidgetConfig = {
  tipo: WidgetTipo;
  /** Ausente = `respostas`, que era a unica fonte antes dos paineis livres. */
  fonte?: WidgetFonte;
  /**
   * Filtro global do painel livre, injetado na leitura por cima do que o bloco
   * guarda — nunca escolhido no editor de bloco, so no topo do painel. Vazio
   * quando o formulario nao esta naquela area: mesmo tratamento que um periodo
   * sem dado nenhum, nao um erro.
   */
  areaId?: string | null;
  /** Mesma ideia que `areaId`, mas so vale para `fonte: 'solicitacoes'`. */
  statusSolicitacao?: string | null;
  /** Dimensao da solicitacao. Usada so quando `fonte` e `solicitacoes`. */
  dimensao?: DimensaoSolicitacao | null;
  /**
   * De qual formulario o bloco le.
   *
   * No painel de formulario e ignorado — o painel inteiro ja e de um so. No
   * painel livre e o que permite cruzar formularios: cada bloco diz o seu, e o
   * acesso e conferido bloco a bloco, nao no painel.
   */
  formId?: string | null;
  /** Codigo do campo. Ausente em KPI de contagem = conta submissoes. */
  campo?: string | null;
  /** Usada por `kpi` e por `serie` com campo. */
  agregacao?: Agregacao;
  /**
   * Segunda metrica opcional, para combinar duas series no mesmo grafico (duas
   * linhas, colunas lado a lado, barra+linha) — igual ao Planilhas Google, so
   * que por cima do mesmo agrupamento da primeira metrica (mesmo dia, mesma
   * categoria). So em `serie`, `categorias` e `ranking`; kpi mostra um numero
   * so, nao ha o que combinar. Sempre numerica: sempre soma, media, minimo ou
   * maximo, nunca contagem/taxa/distintos.
   */
  campo2?: string | null;
  agregacao2?: Agregacao;
  /** Usado por `serie`. */
  intervalo?: Intervalo;
  /** Usado por `categorias` e `ranking`. */
  limite?: number;
  /** Janela em dias contada de hoje. Ausente ou nulo = historico completo. */
  periodoDias?: number | null;
};

/**
 * Resultado normalizado.
 *
 * `kpi` preenche `valor`; os outros tres preenchem `pontos`. Uma forma so, em
 * vez de uniao discriminada, porque a tela precisa renderizar widget de tipo
 * variavel numa mesma grade sem estreitar tipo a cada celula.
 */
export type WidgetResultado = {
  tipo: WidgetTipo;
  valor: number | null;
  /** `valor2` so aparece quando o bloco pediu uma segunda metrica (`campo2`). */
  pontos: Array<{ rotulo: string; valor: number; valor2?: number }>;
  /**
   * Ausente = numero puro. Quem desenha nao precisa conhecer a agregacao para
   * saber que 82 ali significa 82%, ou que 31 significa 31 horas.
   */
  unidade?: 'percentual' | 'horas';
};

// ─── Compatibilidade entre tipo de campo e agregacao ──────────────────────────

export const TIPOS_NUMERICOS: ReadonlySet<FormFieldType> = new Set([
  FormFieldType.NUMBER,
  FormFieldType.CURRENCY,
  FormFieldType.CALCULATED,
  FormFieldType.SCALE,
  FormFieldType.RATING,
]);

export const TIPOS_ESCOLHA: ReadonlySet<FormFieldType> = new Set([
  FormFieldType.SINGLE_SELECT,
  FormFieldType.MULTI_SELECT,
  FormFieldType.CHECKBOX,
]);

export const TIPOS_TEXTO: ReadonlySet<FormFieldType> = new Set([
  FormFieldType.SHORT_TEXT,
  FormFieldType.LONG_TEXT,
  FormFieldType.EMAIL,
  FormFieldType.PHONE,
  FormFieldType.CPF,
  FormFieldType.CNPJ,
  FormFieldType.CEP,
  FormFieldType.DATE,
  FormFieldType.TIME,
  FormFieldType.DATETIME,
]);

export const TIPOS_DECORATIVOS: ReadonlySet<FormFieldType> = new Set([
  FormFieldType.TITLE,
  FormFieldType.DESCRIPTION,
  FormFieldType.DIVIDER,
  FormFieldType.FILE_DOWNLOAD,
]);

/** Agregacoes que fazem sentido para o tipo — e so estas aparecem no seletor. */
export function agregacoesDoTipo(fieldType: FormFieldType): Agregacao[] {
  if (TIPOS_NUMERICOS.has(fieldType)) {
    return ['soma', 'media', 'minimo', 'maximo', 'contagem', 'taxa'];
  }
  if (TIPOS_ESCOLHA.has(fieldType)) {
    return ['contagem', 'distintos', 'taxa'];
  }
  if (TIPOS_TEXTO.has(fieldType)) {
    return ['contagem', 'distintos', 'taxa'];
  }
  // Upload e decorativos: so contar que houve resposta.
  return TIPOS_DECORATIVOS.has(fieldType) ? [] : ['contagem', 'taxa'];
}

/** Formatos de widget que o tipo de campo suporta — base do seletor da tela. */
export function tiposDeWidgetDoCampo(fieldType: FormFieldType): WidgetTipo[] {
  if (TIPOS_DECORATIVOS.has(fieldType)) return [];
  if (TIPOS_NUMERICOS.has(fieldType)) return ['kpi', 'serie'];
  if (TIPOS_ESCOLHA.has(fieldType)) return ['kpi', 'categorias'];
  return ['kpi', 'ranking'];
}

/** Agregacoes que uma solicitacao suporta — as mesmas para toda dimensao. */
export const AGREGACOES_SOLICITACAO: readonly Agregacao[] = ['contagem', 'taxa', 'sla', 'idade'];

/**
 * Formatos que cada dimensao de solicitacao rende.
 *
 * Sem dimensao sobra o conjunto todo menos os que precisam de rotulo: um numero
 * unico ou a evolucao no tempo. Com dimensao, escolha fechada (status,
 * prioridade, SLA) vira distribuicao; nome livre (area, responsavel,
 * formulario) vira ranking, que ordena e corta pelo limite.
 */
export function tiposDeWidgetDaDimensao(dimensao: DimensaoSolicitacao | null): WidgetTipo[] {
  if (!dimensao) return ['kpi', 'serie'];
  if (dimensao === 'status' || dimensao === 'prioridade' || dimensao === 'sla') {
    return ['categorias', 'kpi'];
  }
  return ['ranking', 'categorias', 'kpi'];
}

export const LIMITE_PADRAO = 10;
export const LIMITE_MAXIMO = 50;
export const PERIODO_MAXIMO_DIAS = 3650;
