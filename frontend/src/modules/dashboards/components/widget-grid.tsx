import { BarChart3, Plus } from 'lucide-react';
import { useCallback, useMemo, type Ref } from 'react';
import GridLayout, { verticalCompactor, useContainerWidth, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Button } from '../../../components/ui';
import { GRID_COLS, TAMANHO_PADRAO_POR_TIPO, type DashboardWidget, type DraftWidget } from '../types';
import { WidgetCard } from './widget-card';

/** Mesmos números do `gridConfig` abaixo — reaproveitados para medir a pilha do celular. */
const ROW_HEIGHT = 28;
const MARGIN: [number, number] = [16, 16];

/**
 * Abaixo disso a grade de 12 colunas não cabe mais — um bloco largo (minW: 3)
 * fica mais estreito que é legível. Mesmo limiar do `md` do Tailwind, para
 * bater com o resto da tela.
 */
const LARGURA_MINIMA_GRADE = 768;

type WidgetGridProps = {
  /** O que desenhar: o salvo quando só se olha, o rascunho quando se edita. */
  widgets: DraftWidget[];
  /** Resultados calculados pelo backend, por chave de bloco. */
  resultados: Map<string, Pick<DashboardWidget, 'resultado' | 'erro'>>;
  editando: boolean;
  /** Chamado com a lista inteira sempre que alguém move ou redimensiona um bloco. */
  onLayoutChange: (widgets: DraftWidget[]) => void;
  onEditar: (widget: DraftWidget) => void;
  onRemover: (key: string) => void;
  onAdicionar: () => void;
};

/** Tamanho mínimo por formato — kpi cabe pequeno, gráfico precisa de espaço para o eixo. */
function tamanhoMinimo(kind: DraftWidget['kind']): { minW: number; minH: number } {
  return kind === 'kpi' ? { minW: 2, minH: 2 } : { minW: 3, minH: 3 };
}

function sobrepoe(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Quem foi a última coisa que a pessoa mexeu na grade — a alça é só 'se', que
 * nunca muda x/y do próprio bloco ao redimensionar (só w/h; quem é empurrado
 * é que ganha um y novo), e arrastar é o oposto (muda x; compactação só mexe
 * no y de quem é empurrado). Comparar contra o estado anterior separa as duas
 * coisas sem precisar de um evento dedicado por tipo de gesto.
 */
function encontrarInteracaoAtiva(
  anterior: DraftWidget[],
  novo: Layout,
): { chave: string; tipo: 'redimensionar' | 'arrastar' } | null {
  const porChave = new Map(anterior.map((widget) => [widget.key, widget]));
  for (const item of novo) {
    const original = porChave.get(item.i);
    if (original && (item.w !== original.w || item.h !== original.h)) {
      return { chave: item.i, tipo: 'redimensionar' };
    }
  }
  for (const item of novo) {
    const original = porChave.get(item.i);
    if (original && item.x !== original.x) {
      return { chave: item.i, tipo: 'arrastar' };
    }
  }
  return null;
}

/**
 * Empurra pra baixo quem ficou no caminho de um redimensionamento.
 *
 * A compactação embutida da lib (`verticalCompactor`) resolve sobreposição
 * ordenando os blocos e empurrando "quem vem depois" — mas "depois" é sobre a
 * ordem (y, x) da grade, não sobre quem a pessoa realmente mexeu. Cresceu a
 * largura por cima de um vizinho que por acaso vem antes nessa ordem (uma
 * barra larga logo acima, por exemplo) e é o PRÓPRIO bloco redimensionado que
 * a lib empurra — a pessoa arrasta a alça, solta, e o card pula de lugar em
 * vez do vizinho sair do caminho. Esta função corrige isso por fora: `chaveFixa`
 * nunca se move (é sempre o bloco que a pessoa está redimensionando), e todo
 * outro que sobreponha alguém com mais prioridade (o fixo, ou quem está mais
 * acima/à esquerda) desce pra logo abaixo dele. Cada passo só aumenta `y`,
 * nunca desfaz um passo anterior, então sempre converge.
 */
function empurrarSobrepostos(widgets: DraftWidget[], chaveFixa: string): DraftWidget[] {
  const ajustado = widgets.map((widget) => ({ ...widget }));
  let mudou = true;
  let voltas = 0;
  while (mudou && voltas < ajustado.length + 20) {
    mudou = false;
    voltas++;
    for (const atual of ajustado) {
      if (atual.key === chaveFixa) continue;
      for (const outro of ajustado) {
        if (outro.key === atual.key || !sobrepoe(atual, outro)) continue;
        const outroTemPrioridade =
          outro.key === chaveFixa || outro.y < atual.y || (outro.y === atual.y && outro.x < atual.x);
        if (!outroTemPrioridade) continue;
        const novoY = outro.y + outro.h;
        if (novoY > atual.y) {
          atual.y = novoY;
          mudou = true;
        }
      }
    }
  }
  return ajustado;
}

/**
 * A grade de blocos, compartilhada pelo painel do formulário e pelos livres.
 *
 * Compactação vertical: depois de qualquer arrastar ou redimensionar, os
 * blocos sobem para fechar buraco vertical, então nunca sobra um vão grande
 * onde um bloco "ficou pra trás" — arrastar um por cima de outro empurra quem
 * está no caminho e a grade inteira se reorganiza pra ficar unida de novo, em
 * vez de deixar o empurrado longe, ilhado. Redimensionar por cima de um
 * vizinho (crescer a largura pra direita ou a altura pra baixo) também
 * empurra quem está no caminho — ver `empurrarSobrepostos`, que corrige os
 * casos em que a compactação embutida da lib empurraria o bloco errado.
 *
 * Abaixo de `LARGURA_MINIMA_GRADE` a grade de 12 colunas não cabe mais: essa
 * mesma disposição vira uma pilha de largura cheia, sem arrastar/redimensionar
 * (as coordenadas só valem para a grade grande).
 */
export function WidgetGrid({
  widgets,
  resultados,
  editando,
  onLayoutChange,
  onEditar,
  onRemover,
  onAdicionar,
}: WidgetGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  // `maxW` só limita o que a grade de 12 colunas comporta a partir de onde o
  // bloco começa — um vizinho no caminho não trava mais o redimensionamento,
  // ele é empurrado (ver `empurrarSobrepostos` em `handleLayoutChange`).
  const layout: Layout = useMemo(
    () =>
      widgets.map((widget) => {
        const { minW, minH } = tamanhoMinimo(widget.kind);
        return {
          i: widget.key,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          minW,
          minH,
          maxW: GRID_COLS - widget.x,
          maxH: Number.POSITIVE_INFINITY,
        };
      }),
    [widgets],
  );

  // Mesma ideia da pilha do celular abaixo: ordem de leitura (y, depois x),
  // recalculada só quando os blocos em si mudam.
  const emOrdem = useMemo(() => [...widgets].sort((a, b) => a.y - b.y || a.x - b.x), [widgets]);

  const handleLayoutChange = useCallback(
    (novoLayout: Layout) => {
      if (!editando) return;
      const interacao = encontrarInteracaoAtiva(widgets, novoLayout);
      const porChave = new Map(novoLayout.map((item) => [item.i, item]));
      let atualizado = widgets.map((widget) => {
        const item = porChave.get(widget.key);
        if (!item) return widget;
        // A alça 'se' nunca deveria mudar x/y do próprio bloco redimensionado
        // — se a compactação embutida da lib empurrou ELE (em vez do vizinho
        // no caminho), devolve pra onde estava; `empurrarSobrepostos` abaixo
        // resolve a sobreposição do jeito certo.
        const eOProprioRedimensionado =
          interacao?.tipo === 'redimensionar' && interacao.chave === widget.key;
        return {
          ...widget,
          x: eOProprioRedimensionado ? widget.x : item.x,
          y: eOProprioRedimensionado ? widget.y : item.y,
          w: item.w,
          h: item.h,
        };
      });
      if (interacao?.tipo === 'redimensionar') {
        atualizado = empurrarSobrepostos(atualizado, interacao.chave);
      }
      // A grade dispara mudança em toda interação; só vale a pena propagar (e
      // recriar o rascunho) quando algo de fato mudou.
      const mudou = atualizado.some(
        (widget, indice) =>
          widget.x !== widgets[indice].x ||
          widget.y !== widgets[indice].y ||
          widget.w !== widgets[indice].w ||
          widget.h !== widgets[indice].h,
      );
      if (mudou) onLayoutChange(atualizado);
    },
    [editando, widgets, onLayoutChange],
  );

  if (widgets.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-[12px] border border-dashed border-border-strong bg-bg-s2 px-6 py-14 text-center">
        <BarChart3 className="h-8 w-8 text-tx-ph" />
        <p className="text-sm font-semibold text-tx-secondary">
          Nenhum indicador ainda. Comece adicionando o primeiro.
        </p>
        {editando ? (
          <Button size="sm" onClick={onAdicionar}>
            <Plus className="mr-1.5 inline h-4 w-4" />
            Adicionar indicador
          </Button>
        ) : null}
      </div>
    );
  }

  function cartao(widget: DraftWidget, arrastavel = true, style?: React.CSSProperties) {
    const salvo = resultados.get(widget.key);
    return (
      <WidgetCard
        key={widget.key}
        title={widget.title}
        resultado={salvo?.resultado ?? null}
        // Bloco recém-adicionado no editor ainda não passou pelo
        // backend, então não tem resultado — o já salvo tem.
        erro={salvo ? salvo.erro : 'Salve o painel para calcular este indicador.'}
        formatoGrafico={widget.configJson.formatoGrafico}
        tituloSerie1={widget.configJson.tituloSerie1}
        tituloSerie2={widget.configJson.tituloSerie2}
        empilhado={widget.configJson.empilhado}
        onEditar={editando ? () => onEditar(widget) : undefined}
        onRemover={editando ? () => onRemover(widget.key) : undefined}
        arrastavel={arrastavel}
        style={style}
      />
    );
  }

  // Abaixo do limiar a grade de 12 colunas não cabe — em vez de espremer x/y/w/h
  // autorados para desktop num container estreito (o que deixava bloco largo
  // órfão, sobrando espaço vazio do lado), empilha um por linha, largura
  // cheia, na ordem em que foram colocados (y, depois x — ver `emOrdem`
  // acima). Arrastar/redimensionar fica fora daqui: as posições continuam em
  // unidades da grade de 12 colunas, que só fazem sentido acima do limiar.
  const empilhado = mounted && width < LARGURA_MINIMA_GRADE;

  return (
    // A lib tipa a ref como aceitando nulo mesmo depois de montada (React 19);
    // o @types/react 18 deste projeto não modela essa nulidade tardia — o cast
    // é só isso, o valor em si nunca muda.
    <div ref={containerRef as Ref<HTMLDivElement>} className="min-w-0">
      {!mounted ? null : empilhado ? (
        <div className="flex flex-col gap-4">
          {emOrdem.map((widget) =>
            cartao(widget, false, { height: widget.h * ROW_HEIGHT + (widget.h - 1) * MARGIN[1] }),
          )}
        </div>
      ) : (
        <GridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
          dragConfig={{ enabled: editando, handle: '.widget-drag-handle' }}
          resizeConfig={{ enabled: editando, handles: ['se'] }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((widget) => cartao(widget))}
        </GridLayout>
      )}
    </div>
  );
}

/** Converte os blocos que vieram do backend no formato que a grade edita. */
export function paraRascunho(widgets: DashboardWidget[]): DraftWidget[] {
  return widgets.map((widget, indice) => ({
    // Widget de sugestão não existe no banco: entra sem id, para nascer ao salvar.
    id: widget.id || undefined,
    key: widget.id || `sugestao_${indice}`,
    title: widget.title,
    kind: widget.kind,
    configJson: widget.configJson,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
  }));
}

/** Resultados por chave — a sugestão vem com id vazio, daí o casamento por posição. */
export function resultadosPorChave(
  widgets: DashboardWidget[],
): Map<string, Pick<DashboardWidget, 'resultado' | 'erro'>> {
  return new Map(
    widgets.map((widget, indice) => [
      widget.id || `sugestao_${indice}`,
      { resultado: widget.resultado, erro: widget.erro },
    ]),
  );
}

/** Posição livre para um bloco novo: abaixo de tudo que já existe, encostado à esquerda. */
export function proximaPosicao(
  existentes: DraftWidget[],
  kind: DraftWidget['kind'],
): { x: number; y: number; w: number; h: number } {
  const { w, h } = TAMANHO_PADRAO_POR_TIPO[kind];
  const y = existentes.reduce((maior, widget) => Math.max(maior, widget.y + widget.h), 0);
  return { x: 0, y, w, h };
}
