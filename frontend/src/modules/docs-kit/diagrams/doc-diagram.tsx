import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Maximize2, X } from 'lucide-react';
import { useTheme } from '../../../hooks/use-theme';
import type { DiagramDef, DiagramNodeKind } from './diagram.types';

/**
 * Paleta por tipo de nó, com um tom por tema. A cor não é só decorativa: ela também
 * pinta o rótulo do tipo dentro do card, em 10px — um tom único para os dois temas
 * reprovaria no contraste de um dos lados (o cinza de "Externo" ficava em 1,6:1
 * sobre o fundo escuro). Tons 700 no claro, 400 no escuro.
 */
const KIND_STYLE: Record<DiagramNodeKind, { light: string; dark: string; label: string }> = {
  entrada: { light: '#0369A1', dark: '#38BDF8', label: 'Entrada' },
  api: { light: '#4338CA', dark: '#818CF8', label: 'API' },
  servico: { light: '#0E7490', dark: '#22D3EE', label: 'Serviço' },
  fila: { light: '#B45309', dark: '#FBBF24', label: 'Fila' },
  banco: { light: '#6D28D9', dark: '#A78BFA', label: 'Dados' },
  externo: { light: '#334155', dark: '#94A3B8', label: 'Externo' },
  evento: { light: '#BE185D', dark: '#F472B6', label: 'Evento' },
  decisao: { light: '#15803D', dark: '#4ADE80', label: 'Decisão' },
  pessoa: { light: '#9333EA', dark: '#C084FC', label: 'Pessoa' },
};

function kindColor(kind: DiagramNodeKind, isDark: boolean): string {
  return isDark ? KIND_STYLE[kind].dark : KIND_STYLE[kind].light;
}

/** Vermelho de falha, também ajustado por tema. */
function failureColor(isDark: boolean): string {
  return isDark ? '#F87171' : '#DC2626';
}

/** Largura fixa do nó e altura típica com subtítulo de duas linhas. */
const NODE_WIDTH = 200;
const NODE_ESTIMATED_HEIGHT = 82;

type DocDiagramNodeData = {
  kind: DiagramNodeKind;
  title: string;
  subtitle?: string;
};

function DocDiagramNode({ data }: NodeProps) {
  const { kind, title, subtitle } = data as unknown as DocDiagramNodeData;
  const { isDark } = useTheme();
  const color = kindColor(kind, isDark);

  return (
    <div
      className="w-[200px] overflow-hidden rounded-xl bg-surface-container-lowest shadow-soft ring-1 ring-border-default/60"
      style={{ borderLeft: `5px solid ${color}` }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} isConnectable={false} />
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-bold uppercase leading-none tracking-wider" style={{ color }}>
          {KIND_STYLE[kind].label}
        </p>
        <p className="mt-1 text-[15px] font-bold leading-tight text-tx-primary">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-[11.5px] leading-snug text-tx-secondary">{subtitle}</p>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { docNode: DocDiagramNode };

/**
 * O ReactFlow precisa estar sob um ReactFlowProvider: sem ele, o duplo mount do
 * React.StrictMode descarta o store criado internamente. Mesmo padrão já usado por
 * FlowCanvas e SectionFlowCanvas.
 */
export function DocDiagram({ def, caption }: { def: DiagramDef; caption?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  return (
    <>
      {/* min-w-0: dentro de um grid, o canvas nao pode alargar a coluna do artigo. */}
      <figure className="grid min-w-0 grid-cols-1 gap-2">
        <div className="relative">
          <div
            className="overflow-hidden rounded-2xl bg-surface-container-low ring-1 ring-border-default/40"
            style={{ height: def.height }}
          >
            <ReactFlowProvider>
              {/* key: trocar de diagrama remonta o canvas, já que os nós viram estado interno. */}
              <DocDiagramCanvas key={def.title} def={def} />
            </ReactFlowProvider>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-xl bg-surface-container-lowest px-2.5 py-1.5 text-xs font-semibold text-tx-secondary shadow-soft transition-colors hover:text-tx-primary"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ampliar
          </button>
        </div>

        <DiagramLegend def={def} />

        <figcaption className="text-sm text-tx-secondary">
          <span className="font-semibold text-tx-primary">{def.title}.</span>{' '}
          {caption ?? def.description}
        </figcaption>
      </figure>

      {isExpanded ? (
        <div
          // z-[60]: acima do modal de Administracao (z-[51]), onde a doc tecnica abre.
          className="fixed inset-0 z-[60] flex flex-col gap-3 bg-surface p-4"
          role="dialog"
          aria-modal="true"
          aria-label={def.title}
        >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-extrabold tracking-tight text-tx-primary">{def.title}</p>
              <p className="text-sm text-tx-secondary">{caption ?? def.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2 text-sm font-semibold text-tx-primary transition-colors hover:bg-surface-container-high"
            >
              <X className="h-4 w-4" />
              Fechar
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface-container-low">
            <ReactFlowProvider>
              <DocDiagramCanvas key={`${def.title}-expandido`} def={def} />
            </ReactFlowProvider>
          </div>

          <DiagramLegend def={def} />
        </div>
      ) : null}
    </>
  );
}

function DiagramLegend({ def }: { def: DiagramDef }) {
    const { isDark } = useTheme();
  const kinds = useMemo(() => [...new Set(def.nodes.map((n) => n.kind))], [def]);
  const temFalha = def.edges.some((e) => e.failure);
  const temVolta = def.edges.some((e) => e.dashed);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {kinds.map((kind) => (
        <span key={kind} className="flex items-center gap-1.5 text-[11px] text-tx-secondary">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: kindColor(kind, isDark) }}
          />
          {KIND_STYLE[kind].label}
        </span>
      ))}
      {temVolta ? (
        <span className="flex items-center gap-1.5 text-[11px] text-tx-secondary">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-tx-muted" />
          Caminho de volta
        </span>
      ) : null}
      {temFalha ? (
        <span className="flex items-center gap-1.5 text-[11px] text-tx-secondary">
          <span
            className="inline-block h-0 w-5 border-t-2 border-dashed"
            style={{ borderColor: failureColor(isDark) }}
          />
          Falha
        </span>
      ) : null}
    </div>
  );
}

/**
 * O `fitView` do ReactFlow só roda na montagem. Num carregamento direto da página o
 * container ainda não tem a largura final nesse instante, e o zoom fica travado num
 * valor pequeno demais (medimos 0,6 contra os 0,96 da navegação interna) — o texto
 * dos cards fica ilegível. Este hook reenquadra sempre que o container muda de
 * tamanho, o que também cobre a troca para o modo ampliado e o redimensionamento
 * da janela.
 */
function useRefitOnResize(wrapperRef: React.RefObject<HTMLElement>) {
  const { fitView } = useReactFlow();

  const refit = useCallback(() => {
    requestAnimationFrame(() => void fitView({ padding: 0.05, duration: 0 }));
  }, [fitView]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [wrapperRef, refit]);
}

function DocDiagramCanvas({ def }: { def: DiagramDef }) {
  const { isDark } = useTheme();
    const wrapperRef = useRef<HTMLDivElement>(null);
  useRefitOnResize(wrapperRef);

  const initialNodes = useMemo<Node[]>(
    () =>
      def.nodes.map((n) => ({
        id: n.id,
        type: 'docNode',
        position: { x: n.x, y: n.y },
        data: { kind: n.kind, title: n.title, subtitle: n.subtitle },
        draggable: false,
        selectable: false,
        connectable: false,
        // O ReactFlow esconde o nó e não desenha aresta alguma enquanto não tiver as
        // dimensões medidas, e a medição depende de ResizeObserver — que não dispara
        // em aba oculta. Dimensões e handles declarados (receita de SSR do ReactFlow)
        // fazem o diagrama nascer desenhado; a medição real apenas refina depois.
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_ESTIMATED_HEIGHT,
        handles: [
          {
            type: 'target',
            position: Position.Left,
            x: 0,
            y: NODE_ESTIMATED_HEIGHT / 2,
            width: 1,
            height: 1,
          },
          {
            type: 'source',
            position: Position.Right,
            x: NODE_WIDTH,
            y: NODE_ESTIMATED_HEIGHT / 2,
            width: 1,
            height: 1,
          },
        ],
      })),
    [def],
  );

  // `nodes` precisa ser estado com onNodesChange: é por esse canal que o ReactFlow
  // devolve as dimensões medidas de cada nó.
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  const edges = useMemo<Edge[]>(() => {
    const neutro = isDark ? 'rgba(226,232,240,0.62)' : 'rgba(30,41,59,0.55)';
    const fundoRotulo = isDark ? '#111a3d' : '#ffffff';

    return def.edges.map((e) => {
      const color = e.failure ? failureColor(isDark) : neutro;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        // smoothstep: rotas ortogonais não se confundem com as bordas dos cards,
        // ao contrário das bezier diagonais que cruzavam o meio do diagrama.
        type: 'smoothstep',
        pathOptions: { borderRadius: 12 },
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: e.failure || e.dashed ? '7 5' : undefined,
        },
        labelShowBg: true,
        labelStyle: {
          fill: isDark ? '#e2e8f0' : '#1e293b',
          fontSize: 12,
          fontWeight: 700,
        },
        labelBgStyle: { fill: fundoRotulo, fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 20, height: 20 },
      };
    });
  }, [def, isDark]);

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.05 }}
        minZoom={0.3}
        // Sem o teto, um diagrama pequeno seria ampliado a ponto de estourar o card.
        maxZoom={1.15}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        colorMode={isDark ? 'dark' : 'light'}
        className="h-full w-full"
        style={{ background: 'transparent' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1.2}
          color={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)'}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
