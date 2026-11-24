import type { FormFieldType } from '../forms/types';

/**
 * Espelho do contrato do backend (`modules/dashboards/widget-config.types.ts`).
 *
 * Os nomes estão em português porque é assim que a API responde — traduzir na
 * borda criaria duas linguagens para a mesma coisa e um mapeamento a mais para
 * errar.
 */

export type WidgetTipo = 'kpi' | 'categorias' | 'serie' | 'ranking';

/** De qual assunto o bloco fala. Ausente no que foi salvo antes = 'respostas'. */
export type WidgetFonte = 'respostas' | 'solicitacoes';

/** O que faz o papel de "campo" na fonte de solicitações. */
export type DimensaoSolicitacao =
  | 'status'
  | 'prioridade'
  | 'area'
  | 'responsavel'
  | 'formulario'
  | 'sla';

export type Agregacao =
  | 'contagem'
  | 'soma'
  | 'media'
  | 'minimo'
  | 'maximo'
  | 'distintos'
  | 'taxa'
  | 'sla'
  | 'idade';

export type Intervalo = 'dia' | 'semana' | 'mes';

/**
 * Estilo visual do gráfico — independente do `tipo`. `tipo` diz que dado
 * calcular (uma série no tempo, uma distribuição, um ranking); `formatoGrafico`
 * diz só como desenhar o resultado, ao estilo Planilhas Google: a mesma lista
 * de pontos `{rotulo, valor}` rende igual em barra, coluna, linha, área, pizza
 * ou rosca. Puramente de exibição — nunca sai daqui para o backend (ver
 * `FORMATOS_PARA_PREVIA` e o motivo em `widget-editor-modal.tsx`).
 */
export type WidgetFormatoGrafico =
  | 'barra'
  | 'barra_horizontal'
  | 'linha'
  | 'area'
  | 'pizza'
  | 'rosca'
  | 'combinacao';

export type WidgetConfig = {
  tipo: WidgetTipo;
  fonte?: WidgetFonte;
  dimensao?: DimensaoSolicitacao | null;
  /** Filtro global do painel livre — nunca escolhido no editor de bloco. */
  areaId?: string | null;
  statusSolicitacao?: string | null;
  /** De qual formulário o bloco lê. Ignorado no painel de formulário. */
  formId?: string | null;
  campo?: string | null;
  agregacao?: Agregacao;
  /**
   * Segunda métrica opcional, para comparar duas medidas no mesmo gráfico —
   * colunas lado a lado, duas linhas, barra+linha — igual ao Planilhas Google,
   * mas sobre o mesmo agrupamento da primeira (mesmo dia, mesma categoria). Só
   * em `serie`, `categorias` e `ranking`; `kpi` mostra um número só.
   */
  campo2?: string | null;
  agregacao2?: Agregacao;
  /** Rótulo de exibição de cada métrica na legenda, calculado ao salvar. Sem efeito sem `campo2`. */
  tituloSerie1?: string;
  tituloSerie2?: string;
  /**
   * Colunas/área lado a lado (padrão) ou empilhadas. Só faz sentido com
   * `campo2` e formato `barra`, `barra_horizontal` ou `area`.
   */
  empilhado?: boolean;
  intervalo?: Intervalo;
  limite?: number;
  periodoDias?: number | null;
  /** Ausente = usa o padrão do `tipo` (ver `FORMATO_PADRAO_POR_TIPO`). Sem efeito em `kpi`. */
  formatoGrafico?: WidgetFormatoGrafico;
};

export type WidgetResultado = {
  tipo: WidgetTipo;
  valor: number | null;
  /** `valor2` só aparece quando o bloco pediu uma segunda métrica (`campo2`). */
  pontos: Array<{ rotulo: string; valor: number; valor2?: number }>;
  /** Ausente = número puro; 'percentual' sai com "%", 'horas' com "h". */
  unidade?: 'percentual' | 'horas';
};

/** Área para o filtro global do painel — só id e nome, o que a barra do topo mostra. */
export type AreaDoFiltro = { id: string; name: string };

/** Status para o filtro global do painel, com o rótulo que a fila usa. */
export type StatusDoFiltro = { status: string; label: string };

/** Formulário que a pessoa pode usar como fonte de um bloco de painel livre. */
export type FormularioDisponivel = {
  id: string;
  name: string;
  status: string;
};

/** Dimensão de solicitação oferecida pela API, com os formatos que ela rende. */
export type DimensaoDisponivel = {
  dimensao: DimensaoSolicitacao;
  label: string;
  tiposDeWidget: WidgetTipo[];
};

export type CampoDisponivel = {
  code: string;
  label: string;
  fieldType: FormFieldType;
  tiposDeWidget: WidgetTipo[];
  agregacoes: Agregacao[];
};

export type DashboardWidget = {
  id: string;
  title: string;
  kind: WidgetTipo;
  configJson: Omit<WidgetConfig, 'tipo'>;
  position: number;
  x: number;
  y: number;
  w: number;
  h: number;
  resultado: WidgetResultado | null;
  erro: string | null;
};

export type Dashboard = {
  /** true = sugestão montada na hora, ainda não salva por ninguém. */
  gerado: boolean;
  id: string;
  formId: string;
  name: string;
  description: string | null;
  widgets: DashboardWidget[];
  podeEditar: boolean;
};

/**
 * Painel livre — o que cruza formulários e pertence a uma pessoa.
 *
 * `publicado` diz se os outros conseguem abri-lo, não se conseguem ver os
 * números: cada bloco continua sendo calculado com a identidade de quem abre,
 * então um painel publicado mostra a cada um só o que ele já podia ver.
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

export type PainelLivre = {
  id: string;
  name: string;
  description: string | null;
  publicado: boolean;
  widgets: DashboardWidget[];
  ehDono: boolean;
  podeEditar: boolean;
};

/** Widget em edição — ainda sem id enquanto não foi salvo. */
export type DraftWidget = {
  id?: string;
  /** Chave estável no cliente, para o react-grid-layout não perder o rastro antes de salvar. */
  key: string;
  title: string;
  kind: WidgetTipo;
  configJson: Omit<WidgetConfig, 'tipo'>;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const ROTULO_TIPO: Record<WidgetTipo, string> = {
  kpi: 'Número',
  categorias: 'Distribuição',
  serie: 'Evolução no tempo',
  ranking: 'Ranking',
};

export const DESCRICAO_TIPO: Record<WidgetTipo, string> = {
  kpi: 'Um número só, em destaque',
  categorias: 'Quanto cada opção representa',
  serie: 'Como o valor muda ao longo do tempo',
  ranking: 'Os valores que mais se repetem',
};

export const ROTULO_FORMATO_GRAFICO: Record<WidgetFormatoGrafico, string> = {
  barra: 'Colunas',
  barra_horizontal: 'Barras',
  linha: 'Linhas',
  area: 'Área',
  pizza: 'Pizza',
  rosca: 'Rosca',
  combinacao: 'Combinação',
};

/** Formato inicial de cada `tipo` — o visual de sempre, para quem nunca escolheu um. */
export const FORMATO_PADRAO_POR_TIPO: Record<Exclude<WidgetTipo, 'kpi'>, WidgetFormatoGrafico> = {
  serie: 'linha',
  categorias: 'barra_horizontal',
  ranking: 'barra_horizontal',
};

/**
 * Todo `tipo` não-kpi produz a mesma lista `{rotulo, valor}` (ver `WidgetResultado`),
 * então qualquer um dos seis formatos desenha sem problema — a escolha é só de
 * gosto/legibilidade, igual ao seletor de gráfico do Planilhas Google.
 */
export const FORMATOS_DISPONIVEIS: readonly WidgetFormatoGrafico[] = [
  'barra',
  'barra_horizontal',
  'linha',
  'area',
  'pizza',
  'rosca',
];

/**
 * Formatos onde uma segunda métrica tem leitura direta — colunas/barras lado a
 * lado, duas linhas, área sobreposta. Pizza e rosca ficam de fora: uma fatia é
 * sempre parte de um todo, e duas métricas não somam a um único todo.
 * `combinacao` só existe quando há `campo2` — sem uma segunda métrica não há o
 * que combinar.
 */
export const FORMATOS_COM_SEGUNDA_METRICA: readonly WidgetFormatoGrafico[] = [
  'barra',
  'barra_horizontal',
  'linha',
  'area',
  'combinacao',
];

/** Formatos onde a escolha "lado a lado" vs. "empilhado" faz sentido. */
export const FORMATOS_EMPILHAVEIS: readonly WidgetFormatoGrafico[] = ['barra', 'barra_horizontal', 'area'];

export const ROTULO_AGREGACAO: Record<Agregacao, string> = {
  contagem: 'Quantidade de respostas',
  soma: 'Soma',
  media: 'Média',
  minimo: 'Menor valor',
  maximo: 'Maior valor',
  distintos: 'Valores diferentes',
  taxa: 'Taxa de preenchimento',
  sla: 'Prazo cumprido',
  idade: 'Tempo médio em aberto',
};

/** Sem campo escolhido a taxa é outra coisa: quantas submissões vieram preenchidas. */
export const ROTULO_AGREGACAO_SEM_CAMPO: Partial<Record<Agregacao, string>> = {
  contagem: 'Quantidade de respostas',
  taxa: 'Taxa de conclusão',
};

/** Na fonte de solicitações as mesmas chaves querem dizer outra coisa. */
export const ROTULO_AGREGACAO_SOLICITACAO: Partial<Record<Agregacao, string>> = {
  contagem: 'Quantidade de solicitações',
  taxa: 'Taxa de conclusão',
  sla: 'Prazo cumprido',
  idade: 'Tempo médio em aberto',
};

export const ROTULO_FONTE: Record<WidgetFonte, string> = {
  respostas: 'Respostas de formulário',
  solicitacoes: 'Solicitações',
};

export const DESCRICAO_FONTE: Record<WidgetFonte, string> = {
  respostas: 'O que as pessoas preencheram',
  solicitacoes: 'A fila de trabalho: status, prazo, responsável',
};

export const ROTULO_INTERVALO: Record<Intervalo, string> = {
  dia: 'Por dia',
  semana: 'Por semana',
  mes: 'Por mês',
};

/** Colunas da grade livre — mesma unidade que o backend usa no backfill e na sugestão. */
export const GRID_COLS = 12;

/** kpi é compacto (quatro por linha); os outros três formatos são gráfico, mais largos. */
export const TAMANHO_PADRAO_POR_TIPO: Record<WidgetTipo, { w: number; h: number }> = {
  kpi: { w: 3, h: 3 },
  categorias: { w: 6, h: 5 },
  serie: { w: 6, h: 5 },
  ranking: { w: 6, h: 5 },
};

export const OPCOES_PERIODO: Array<{ valor: number | null; rotulo: string }> = [
  { valor: null, rotulo: 'Todo o histórico' },
  { valor: 7, rotulo: 'Últimos 7 dias' },
  { valor: 30, rotulo: 'Últimos 30 dias' },
  { valor: 90, rotulo: 'Últimos 90 dias' },
  { valor: 365, rotulo: 'Último ano' },
];
