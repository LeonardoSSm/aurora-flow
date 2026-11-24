import { useQuery } from '@tanstack/react-query';
import {
  AreaChart as IconeArea,
  BarChart3 as IconeBarra,
  BarChartHorizontal as IconeBarraHorizontal,
  ChartNoAxesCombined as IconeCombinacao,
  Donut as IconeRosca,
  Hash as IconeNumero,
  LineChart as IconeLinha,
  Loader2,
  PieChart as IconePizza,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui';
import { previsualizarWidget } from '../services/dashboards-api';
import {
  fetchCamposDoFormulario,
  fetchDimensoesSolicitacao,
  previsualizarWidgetLivre,
} from '../services/paineis-api';
import {
  DESCRICAO_FONTE,
  DESCRICAO_TIPO,
  FORMATOS_COM_SEGUNDA_METRICA,
  FORMATOS_DISPONIVEIS,
  FORMATOS_EMPILHAVEIS,
  FORMATO_PADRAO_POR_TIPO,
  OPCOES_PERIODO,
  ROTULO_AGREGACAO,
  ROTULO_AGREGACAO_SEM_CAMPO,
  ROTULO_AGREGACAO_SOLICITACAO,
  ROTULO_FONTE,
  ROTULO_FORMATO_GRAFICO,
  ROTULO_INTERVALO,
  ROTULO_TIPO,
  type Agregacao,
  type CampoDisponivel,
  type DimensaoSolicitacao,
  type DraftWidget,
  type FormularioDisponivel,
  type Intervalo,
  type WidgetFonte,
  type WidgetFormatoGrafico,
  type WidgetResultado,
  type WidgetTipo,
} from '../types';
import { WidgetChart } from './widget-chart';
import { proximaPosicao } from './widget-grid';

/** Um ícone por formato — só para o seletor visual, não faz sentido em `types.ts`. */
const ICONE_FORMATO_GRAFICO: Record<WidgetFormatoGrafico, LucideIcon> = {
  barra: IconeBarra,
  barra_horizontal: IconeBarraHorizontal,
  linha: IconeLinha,
  area: IconeArea,
  pizza: IconePizza,
  rosca: IconeRosca,
  combinacao: IconeCombinacao,
};

/** A segunda métrica só aceita agregações numéricas — contagem/taxa/etc. não combinam. */
const AGREGACOES_SEGUNDA_METRICA: Agregacao[] = ['soma', 'media', 'minimo', 'maximo'];

/**
 * De onde o bloco lê — a única diferença real entre os dois tipos de painel.
 *
 * No painel de formulário o formulário é fixo e a tela já carregou os campos.
 * No painel livre a pessoa escolhe o formulário aqui dentro, e o modal busca os
 * campos do que ela escolher: manter isso no pai obrigaria a tela a carregar
 * campos de um formulário que ainda não foi escolhido.
 */
type FonteDoWidget =
  | { modo: 'formulario'; formId: string; campos: CampoDisponivel[] }
  | { modo: 'livre'; formularios: FormularioDisponivel[] };

type WidgetEditorModalProps = {
  fonte: FonteDoWidget;
  /** Widget sendo editado; ausente = criando um novo. */
  inicial?: DraftWidget | null;
  /** O rascunho atual — só usado para posicionar um bloco novo abaixo do resto. */
  existentes: DraftWidget[];
  onSalvar: (widget: DraftWidget) => void;
  onFechar: () => void;
};

/** Widget sem campo: conta submissões. Sempre disponível, não depende do formulário. */
const SEM_CAMPO = '__submissoes__';

const rotuloCampo = (campos: CampoDisponivel[], code: string | null | undefined): string =>
  campos.find((campo) => campo.code === code)?.label ?? 'Respostas do formulário';

/**
 * Monta um indicador escolhendo campo, formato, agregação e período — com o
 * gráfico ao lado atualizando a cada mudança.
 *
 * A pré-visualização é o que faz o construtor parecer simples: sem ela a pessoa
 * salva no escuro e só descobre o que montou depois de fechar o editor.
 */
export function WidgetEditorModal({
  fonte,
  inicial,
  existentes,
  onSalvar,
  onFechar,
}: WidgetEditorModalProps) {
  const livre = fonte.modo === 'livre';
  // Só o painel livre tem duas fontes; o do formulário é sempre sobre respostas.
  const [assunto, setAssunto] = useState<WidgetFonte>(
    livre ? (inicial?.configJson.fonte ?? 'respostas') : 'respostas',
  );
  const [dimensao, setDimensao] = useState<DimensaoSolicitacao | null>(
    inicial?.configJson.dimensao ?? null,
  );
  const solicitacoes = assunto === 'solicitacoes';
  const [formId, setFormId] = useState<string>(
    fonte.modo === 'livre'
      ? (inicial?.configJson.formId ?? fonte.formularios[0]?.id ?? '')
      : fonte.formId,
  );
  const [campo, setCampo] = useState<string>(inicial?.configJson.campo ?? SEM_CAMPO);
  const [tipo, setTipo] = useState<WidgetTipo>(inicial?.kind ?? 'kpi');
  const [agregacao, setAgregacao] = useState<Agregacao>(
    inicial?.configJson.agregacao ?? 'contagem',
  );
  // Nulo = sem segunda métrica — o gráfico mostra uma medida só.
  const [campo2, setCampo2] = useState<string | null>(inicial?.configJson.campo2 ?? null);
  const [agregacao2, setAgregacao2] = useState<Agregacao>(
    inicial?.configJson.agregacao2 ?? 'soma',
  );
  const [empilhado, setEmpilhado] = useState<boolean>(inicial?.configJson.empilhado ?? false);
  const [intervalo, setIntervalo] = useState<Intervalo>(inicial?.configJson.intervalo ?? 'mes');
  // Nulo = segue o padrão do `tipo` (ver FORMATO_PADRAO_POR_TIPO) — só vira
  // fixo quando a pessoa mexe no seletor "Tipo de gráfico".
  const [formatoGrafico, setFormatoGrafico] = useState<WidgetFormatoGrafico | null>(
    inicial?.configJson.formatoGrafico ?? null,
  );
  const [periodoDias, setPeriodoDias] = useState<number | null>(
    inicial?.configJson.periodoDias ?? null,
  );
  const [titulo, setTitulo] = useState(inicial?.title ?? '');
  const [tituloTocado, setTituloTocado] = useState(Boolean(inicial));

  const [previa, setPrevia] = useState<WidgetResultado | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Só no painel livre: os campos dependem do formulário escolhido aqui dentro.
  const camposQuery = useQuery({
    queryKey: ['painel-campos', formId],
    queryFn: () => fetchCamposDoFormulario(formId),
    enabled: livre && Boolean(formId),
    staleTime: 5 * 60_000,
  });
  const campos = fonte.modo === 'formulario' ? fonte.campos : (camposQuery.data ?? []);

  const dimensoesQuery = useQuery({
    queryKey: ['painel-dimensoes-solicitacao'],
    queryFn: fetchDimensoesSolicitacao,
    enabled: solicitacoes,
    staleTime: 30 * 60_000,
  });
  const dimensoes = dimensoesQuery.data?.dimensoes ?? [];
  const dimensaoSelecionada = dimensoes.find((item) => item.dimensao === dimensao) ?? null;

  const campoSelecionado = campos.find((item) => item.code === campo) ?? null;

  /**
   * Só dá pra confiar em `tiposPermitidos`/`agregacoesPermitidas` depois que o
   * dado do qual elas dependem chega de verdade — campos do formulário livre,
   * ou dimensões de solicitação. Enquanto isso, `campoSelecionado`/
   * `dimensaoSelecionada` ficam nulos só porque a busca não voltou ainda, e as
   * duas listas caem numa lista provisória genérica (`['kpi', 'serie']`,
   * `['contagem', 'taxa']`) — sem isso, os efeitos de correção logo abaixo
   * julgavam o que foi salvo (ex.: 'média') contra essa lista de mentira e
   * derrubavam a escolha pro padrão antes do dado real provar que ela era
   * válida. No painel do formulário os campos já chegam prontos (nunca tem
   * busca própria aqui), então não há o que esperar.
   */
  const opcoesProntas = solicitacoes
    ? dimensoesQuery.isSuccess
    : fonte.modo === 'formulario' || camposQuery.isSuccess;

  // Trocar de formulário quase sempre invalida o campo escolhido antes.
  useEffect(() => {
    if (campo !== SEM_CAMPO && camposQuery.isSuccess && !campoSelecionado) setCampo(SEM_CAMPO);
  }, [campo, camposQuery.isSuccess, campoSelecionado]);

  // Sem campo (ou sem dimensão) escolhido, só os dois formatos que funcionam
  // sobre o registro inteiro.
  const tiposPermitidos: WidgetTipo[] = solicitacoes
    ? (dimensaoSelecionada?.tiposDeWidget ?? ['kpi', 'serie'])
    : (campoSelecionado?.tiposDeWidget ?? ['kpi', 'serie']);

  // A única forma não-número que existe pra montar o gráfico unificado abaixo.
  // Só solicitações agrupadas por área/responsável/formulário chegam a admitir
  // duas (ranking e categorias) — nesse caso raro a primeira da lista já é
  // ranking, que é a leitura mais natural pra um nome de pessoa/área/formulário.
  const tipoGrafico = tiposPermitidos.find((item) => item !== 'kpi') ?? null;

  // Campos numéricos disponíveis pra segunda métrica — mesmo critério do motor
  // no backend (`TIPOS_NUMERICOS`), aproximado aqui por quem já lista soma
  // entre as agregações aceitas. O campo da primeira métrica fica de fora:
  // combinar um campo com ele mesmo não compara nada. Só existe em respostas
  // de formulário — solicitações não têm campo, só dimensão.
  const camposNumericos = solicitacoes
    ? []
    : campos.filter((item) => item.agregacoes.includes('soma') && item.code !== campo);

  // Formato "combinação" só existe com duas métricas; pizza/rosca deixam de
  // valer porque uma fatia é sempre parte de um todo, e duas métricas não
  // somam a um único todo (ver comentário de `FORMATOS_COM_SEGUNDA_METRICA`).
  const formatosParaEscolher = campo2 ? FORMATOS_COM_SEGUNDA_METRICA : FORMATOS_DISPONIVEIS;
  const formatoResolvido = tipoGrafico ? (formatoGrafico ?? FORMATO_PADRAO_POR_TIPO[tipoGrafico]) : null;
  const podeEmpilhar = Boolean(
    campo2 && formatoResolvido && FORMATOS_EMPILHAVEIS.includes(formatoResolvido),
  );

  // Taxa, prazo e tempo médio são frações ou médias do conjunto: num gráfico de
  // barras por categoria não diriam nada, então só valem como número único.
  const SO_NUMERO_UNICO: Agregacao[] = ['taxa', 'sla', 'idade'];
  const agregacoesPermitidas: Agregacao[] = (
    solicitacoes
      ? (dimensoesQuery.data?.agregacoes ?? (['contagem'] as Agregacao[]))
      : (campoSelecionado?.agregacoes ?? (['contagem', 'taxa'] as Agregacao[]))
  ).filter((opcao) => !SO_NUMERO_UNICO.includes(opcao) || tipo === 'kpi');

  // Trocar de campo pode invalidar o formato e a agregação escolhidos antes —
  // mas só depois que `opcoesProntas` garante que a lista é a de verdade.
  useEffect(() => {
    if (!opcoesProntas) return;
    if (!tiposPermitidos.includes(tipo)) setTipo(tiposPermitidos[0]);
  }, [opcoesProntas, tiposPermitidos, tipo]);

  useEffect(() => {
    if (!opcoesProntas) return;
    if (!agregacoesPermitidas.includes(agregacao)) setAgregacao(agregacoesPermitidas[0]);
  }, [opcoesProntas, agregacoesPermitidas, agregacao]);

  // Segunda métrica só existe em respostas de formulário, sobre um campo
  // numérico que não seja o da primeira, e nunca com `tipo` kpi (um número só
  // não tem o que combinar) — trocar qualquer uma dessas escolhas pode
  // invalidar o que já estava selecionado.
  useEffect(() => {
    if (!opcoesProntas || !campo2) return;
    const aindaValido = !solicitacoes && tipo !== 'kpi' && camposNumericos.some((item) => item.code === campo2);
    if (!aindaValido) setCampo2(null);
  }, [opcoesProntas, solicitacoes, tipo, campo2, camposNumericos]);

  // "Combinação" só faz sentido com duas métricas; pizza/rosca deixam de valer
  // assim que uma segunda métrica entra em cena (ver `formatosParaEscolher`).
  useEffect(() => {
    if (!campo2 && formatoGrafico === 'combinacao') setFormatoGrafico(null);
    if (campo2 && (formatoGrafico === 'pizza' || formatoGrafico === 'rosca')) setFormatoGrafico(null);
  }, [campo2, formatoGrafico]);

  // "Empilhado" só tem efeito com duas métricas — sem elas, guardar o estado
  // seria uma escolha invisível esperando pra reaparecer sem aviso.
  useEffect(() => {
    if (!campo2 && empilhado) setEmpilhado(false);
  }, [campo2, empilhado]);

  /**
   * Nome legível da medida.
   *
   * A mesma chave quer dizer coisas diferentes conforme o contexto: `taxa` é
   * preenchimento sobre um campo, conclusão sobre o formulário todo, e conclusão
   * da fila sobre solicitações. O rótulo segue esse sentido, não a chave.
   */
  const rotuloDaAgregacao = (opcao: Agregacao): string => {
    if (solicitacoes) return ROTULO_AGREGACAO_SOLICITACAO[opcao] ?? ROTULO_AGREGACAO[opcao];
    return (campoSelecionado ? undefined : ROTULO_AGREGACAO_SEM_CAMPO[opcao]) ?? ROTULO_AGREGACAO[opcao];
  };

  const config = useMemo(
    () => ({
      tipo,
      fonte: assunto,
      dimensao: solicitacoes ? dimensao : undefined,
      campo: solicitacoes || campo === SEM_CAMPO ? null : campo,
      agregacao,
      // Ao contrário de `formatoGrafico` (só de exibição, nunca sai daqui pro
      // backend), a segunda métrica precisa chegar na prévia: é o backend
      // quem calcula `valor2`, não o cliente.
      campo2: solicitacoes ? null : campo2,
      agregacao2: solicitacoes || !campo2 ? undefined : agregacao2,
      intervalo: tipo === 'serie' ? intervalo : undefined,
      periodoDias,
    }),
    [tipo, assunto, solicitacoes, dimensao, campo, agregacao, campo2, agregacao2, intervalo, periodoDias],
  );

  // Título sugerido a partir das escolhas, até a pessoa escrever o dela.
  useEffect(() => {
    if (tituloTocado) return;
    if (solicitacoes) {
      setTitulo(
        dimensaoSelecionada
          ? `Solicitações por ${dimensaoSelecionada.label.toLowerCase()}`
          : rotuloDaAgregacao(agregacao),
      );
      return;
    }
    // Sem campo, a agregação já é o título inteiro: "Taxa de conclusão de
    // Respostas" não diz mais do que "Taxa de conclusão".
    if (!config.campo && tipo === 'kpi' && agregacao !== 'contagem') {
      setTitulo(rotuloDaAgregacao(agregacao));
      return;
    }
    const nomeCampo = rotuloCampo(campos, config.campo);
    const prefixo =
      tipo === 'kpi' && agregacao !== 'contagem' ? `${ROTULO_AGREGACAO[agregacao]} de ` : '';
    setTitulo(`${prefixo}${nomeCampo}`);
  }, [config.campo, tipo, agregacao, campos, tituloTocado, solicitacoes, dimensaoSelecionada]);

  useEffect(() => {
    if (!solicitacoes && !formId) return;
    let cancelado = false;
    setCarregando(true);
    setErroPrevia(null);

    const previsualizar = livre
      ? () => previsualizarWidgetLivre(solicitacoes ? null : formId, config)
      : () => previsualizarWidget(formId, config);
    previsualizar()
      .then((resultado) => {
        if (!cancelado) setPrevia(resultado);
      })
      .catch((falha: unknown) => {
        if (cancelado) return;
        setPrevia(null);
        const mensagem =
          (falha as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Não foi possível calcular este indicador.';
        setErroPrevia(mensagem);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [formId, config, livre, solicitacoes]);

  function handleSalvar() {
    // Editar preserva onde o bloco já estava; novo entra abaixo do resto, para
    // não nascer empilhado em cima de algo que já existe.
    const layout = inicial
      ? { x: inicial.x, y: inicial.y, w: inicial.w, h: inicial.h }
      : proximaPosicao(existentes, tipo);

    onSalvar({
      id: inicial?.id,
      key: inicial?.key ?? `w_${Math.random().toString(36).slice(2, 9)}`,
      title:
        titulo.trim() ||
        (solicitacoes ? 'Solicitações' : rotuloCampo(campos, config.campo)),
      kind: tipo,
      configJson: {
        // Só o painel livre precisa guardar de onde o bloco lê; no painel de
        // formulário isso viria do próprio painel e seria ruído no jsonb.
        fonte: livre ? assunto : undefined,
        dimensao: solicitacoes ? dimensao : undefined,
        formId: livre && !solicitacoes ? formId : undefined,
        campo: config.campo,
        agregacao,
        campo2: config.campo2,
        agregacao2: config.agregacao2,
        // Nome de cada métrica pra legenda — calculado aqui, e não no
        // widget-chart, porque só o editor tem a lista de campos à mão; o
        // card do painel só recebe o `configJson` já salvo.
        tituloSerie1: config.campo2 ? rotuloCampo(campos, config.campo) : undefined,
        tituloSerie2: config.campo2 ? rotuloCampo(campos, config.campo2) : undefined,
        empilhado: config.campo2 ? empilhado : undefined,
        intervalo: config.intervalo,
        periodoDias,
        formatoGrafico: tipo === 'kpi' ? undefined : (formatoGrafico ?? undefined),
      },
      ...layout,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="grid max-h-[92vh] w-full max-w-4xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-[14px] bg-bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border-default px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-tx-primary">
              {inicial ? 'Editar indicador' : 'Novo indicador'}
            </h2>
            <p className="text-xs text-tx-secondary">
              Escolha o que medir; o gráfico ao lado mostra o resultado real.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-tx-secondary hover:bg-bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 gap-6 overflow-y-auto p-6 md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-4">
            {fonte.modo === 'livre' ? (
              <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
                Fonte
                <select
                  value={assunto}
                  onChange={(event) => setAssunto(event.target.value as WidgetFonte)}
                  className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                >
                  {(Object.keys(ROTULO_FONTE) as WidgetFonte[]).map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {ROTULO_FONTE[opcao]}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] font-medium normal-case text-tx-ph">
                  {DESCRICAO_FONTE[assunto]}
                </span>
              </label>
            ) : null}

            {fonte.modo === 'livre' && !solicitacoes ? (
              <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
                Formulário
                <select
                  value={formId}
                  onChange={(event) => setFormId(event.target.value)}
                  className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                >
                  {fonte.formularios.length === 0 ? (
                    <option value="">Nenhum formulário disponível</option>
                  ) : null}
                  {fonte.formularios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {solicitacoes ? (
              <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
                Agrupar por
                <select
                  value={dimensao ?? ''}
                  onChange={(event) => {
                    const escolhida =
                      event.target.value === ''
                        ? null
                        : (event.target.value as DimensaoSolicitacao);
                    setDimensao(escolhida);
                    // Quem pede "agrupar por status" quer ver a distribuição, não
                    // a contagem total. O KPI continua na lista para quem o
                    // queira, mas não é o que a escolha acabou de pedir.
                    const preferido = escolhida
                      ? dimensoes.find((item) => item.dimensao === escolhida)?.tiposDeWidget[0]
                      : 'kpi';
                    if (preferido) setTipo(preferido);
                  }}
                  className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                >
                  <option value="">Nada — a fila inteira</option>
                  {dimensoes.map((item) => (
                    <option key={item.dimensao} value={item.dimensao}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
                O que medir
                <select
                  value={campo}
                  onChange={(event) => setCampo(event.target.value)}
                  className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                >
                  <option value={SEM_CAMPO}>Respostas do formulário</option>
                  {campos.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!solicitacoes && tipo !== 'kpi' && (campo2 || camposNumericos.length > 0) ? (
              <div className="grid min-w-0 gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-tx-secondary">Segunda métrica</span>
                  {campo2 ? (
                    <button
                      type="button"
                      onClick={() => setCampo2(null)}
                      className="text-[11px] font-semibold text-tx-secondary hover:text-error"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                {campo2 ? (
                  <>
                    <select
                      value={campo2}
                      onChange={(event) => setCampo2(event.target.value)}
                      className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                    >
                      {camposNumericos.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={agregacao2}
                      onChange={(event) => setAgregacao2(event.target.value as Agregacao)}
                      className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                    >
                      {AGREGACOES_SEGUNDA_METRICA.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {ROTULO_AGREGACAO[opcao]}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCampo2(camposNumericos[0].code)}
                    className="flex items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong px-3 py-2 text-xs font-semibold text-tx-secondary hover:bg-bg-hover"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Comparar com outro campo
                  </button>
                )}
              </div>
            ) : null}

            <div className="grid min-w-0 gap-2">
              <span className="text-xs font-bold text-tx-secondary">Como mostrar</span>
              <div className="grid grid-cols-3 gap-1.5">
                {tiposPermitidos.includes('kpi') ? (
                  <button
                    type="button"
                    onClick={() => setTipo('kpi')}
                    title={DESCRICAO_TIPO.kpi}
                    className={[
                      'grid min-w-0 justify-items-center gap-1 rounded-[8px] border px-2 py-2.5 transition-colors',
                      tipo === 'kpi'
                        ? 'border-primary bg-primary/10'
                        : 'border-border-default hover:bg-bg-hover',
                    ].join(' ')}
                  >
                    <IconeNumero className="h-4 w-4 text-tx-primary" />
                    <span className="truncate text-[11px] font-semibold text-tx-primary">
                      {ROTULO_TIPO.kpi}
                    </span>
                  </button>
                ) : null}

                {/*
                 * Série, categorias e ranking rendem a mesma lista {rótulo, valor}
                 * (ver widget-chart.tsx), então não faz sentido escolher a forma
                 * dos dados e DEPOIS o desenho em dois passos — um campo só tem
                 * uma forma não-número aplicável na prática (a única exceção rara,
                 * solicitações por área/responsável/formulário, cai de volta pra
                 * ranking em vez de perguntar de novo). "Número" e os seis
                 * formatos de gráfico entram juntos na mesma grade, igual ao
                 * seletor do Planilhas Google.
                 */}
                {tipoGrafico
                  ? formatosParaEscolher.map((opcao) => {
                      const Icone = ICONE_FORMATO_GRAFICO[opcao];
                      const ativo =
                        tipo === tipoGrafico &&
                        (formatoGrafico ?? FORMATO_PADRAO_POR_TIPO[tipoGrafico]) === opcao;
                      return (
                        <button
                          key={opcao}
                          type="button"
                          onClick={() => {
                            setTipo(tipoGrafico);
                            setFormatoGrafico(opcao);
                          }}
                          title={ROTULO_FORMATO_GRAFICO[opcao]}
                          className={[
                            'grid min-w-0 justify-items-center gap-1 rounded-[8px] border px-2 py-2.5 transition-colors',
                            ativo
                              ? 'border-primary bg-primary/10'
                              : 'border-border-default hover:bg-bg-hover',
                          ].join(' ')}
                        >
                          <Icone className="h-4 w-4 text-tx-primary" />
                          <span className="truncate text-[11px] font-semibold text-tx-primary">
                            {ROTULO_FORMATO_GRAFICO[opcao]}
                          </span>
                        </button>
                      );
                    })
                  : null}
              </div>
              {podeEmpilhar ? (
                <label className="flex items-center gap-2 text-xs font-semibold text-tx-secondary">
                  <input
                    type="checkbox"
                    checked={empilhado}
                    onChange={(event) => setEmpilhado(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border-strong"
                  />
                  Empilhado, em vez de lado a lado
                </label>
              ) : null}
            </div>

            {(tipo === 'kpi' || tipo === 'serie') && agregacoesPermitidas.length > 1 ? (
              <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
                Cálculo
                <select
                  value={agregacao}
                  onChange={(event) => setAgregacao(event.target.value as Agregacao)}
                  className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                >
                  {agregacoesPermitidas.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {rotuloDaAgregacao(opcao)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {tipo === 'serie' ? (
              <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
                Agrupar
                <select
                  value={intervalo}
                  onChange={(event) => setIntervalo(event.target.value as Intervalo)}
                  className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
                >
                  {(Object.keys(ROTULO_INTERVALO) as Intervalo[]).map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {ROTULO_INTERVALO[opcao]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
              Período
              <select
                value={periodoDias === null ? '' : String(periodoDias)}
                onChange={(event) =>
                  setPeriodoDias(event.target.value === '' ? null : Number(event.target.value))
                }
                className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
              >
                {OPCOES_PERIODO.map((opcao) => (
                  <option key={opcao.rotulo} value={opcao.valor === null ? '' : String(opcao.valor)}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2 text-xs font-bold text-tx-secondary">
              Título do bloco
              <input
                value={titulo}
                onChange={(event) => {
                  setTituloTocado(true);
                  setTitulo(event.target.value);
                }}
                className="h-10 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="grid min-w-0 content-start gap-2">
            <span className="text-xs font-bold text-tx-secondary">Pré-visualização</span>
            <div className="relative min-h-[260px] rounded-[10px] border border-border-default bg-bg-s2 p-4">
              {carregando ? (
                <div className="absolute right-3 top-3">
                  <Loader2 className="h-4 w-4 animate-spin text-tx-secondary" />
                </div>
              ) : null}
              <p className="mb-2 truncate text-sm font-bold text-tx-primary">
                {titulo || 'Sem título'}
              </p>
              <WidgetChart
                resultado={previa}
                erro={erroPrevia}
                altura={200}
                formatoGrafico={tipo === 'kpi' ? undefined : (formatoGrafico ?? undefined)}
                tituloSerie1={config.campo2 ? rotuloCampo(campos, config.campo) : undefined}
                tituloSerie2={config.campo2 ? rotuloCampo(campos, config.campo2) : undefined}
                empilhado={empilhado}
              />
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border-default px-6 py-4">
          <Button variant="subtle" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={Boolean(erroPrevia) || (!solicitacoes && !formId)}
          >
            {inicial ? 'Salvar alterações' : 'Adicionar ao painel'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
