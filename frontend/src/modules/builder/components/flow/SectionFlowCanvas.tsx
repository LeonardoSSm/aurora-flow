import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  MarkerType,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, LayoutGrid, Play, Plus } from 'lucide-react';
import { useEffect, useMemo, type CSSProperties } from 'react';
import {
  countOrphanedRules,
  buildSectionFlowGraph,
  SECTION_EDGE_COLORS,
  TERMINAL_NODE_ID,
  type SectionFlowNode,
} from '../../lib/section-flow-layout';
import { SectionFlowActionsContext, type SectionFlowActions } from './section-flow-actions';
import type { DraftSection } from '../../types';
import { SectionNode } from './SectionNode';
import { SectionFlowEdge } from './SectionFlowEdge';
import { TerminalNode } from './TerminalNode';

function mergeNodePositions(
  prevNodes: SectionFlowNode[],
  nextNodes: SectionFlowNode[],
): SectionFlowNode[] {
  const prevById = new Map(prevNodes.map((node) => [node.id, node]));
  return nextNodes.map((next) => {
    const prev = prevById.get(next.id);
    return prev ? { ...next, position: prev.position } : next;
  });
}

const nodeTypes: NodeTypes = {
  section: SectionNode,
  terminal: TerminalNode,
};

const edgeTypes: EdgeTypes = {
  sectionEdge: SectionFlowEdge,
};

const PRIMARY = 'rgb(var(--color-primary-ch))';

/** Cartões que flutuam sobre o canvas: legenda e ações. */
const floatingCard =
  'absolute z-10 rounded-[10px] border border-border-strong bg-bg-surface shadow-[0_8px_24px_rgba(13,29,41,.08)]';

// Controles do React Flow em coluna branca de 32px, botões de 30px.
const controlsStyle = {
  '--xy-controls-button-background-color': 'var(--bg-surface)',
  '--xy-controls-button-background-color-hover': 'var(--bg-surface-hover)',
  '--xy-controls-button-color': 'var(--text-secondary)',
  '--xy-controls-button-color-hover': PRIMARY,
  '--xy-controls-button-border-color': 'var(--border-default)',
  '--xy-controls-box-shadow': 'none',
} as CSSProperties;

function minimapNodeColor(node: Node): string {
  if (node.id === TERMINAL_NODE_ID) return '#bbf7d0';
  return (node.data as { selected?: boolean } | undefined)?.selected || node.selected
    ? PRIMARY
    : 'var(--border-strong)';
}

type SectionFlowCanvasProps = {
  sections: DraftSection[];
  /** Seção aberta no modal: o nó dela fica destacado. */
  selectedSectionId?: string | null;
  /** Regras de automação por seção (id local), para o chip do rodapé do nó. */
  automationCountBySectionId?: Record<string, number>;
  onAddSection: () => void;
  onSelectSection: (sectionId: string) => void;
  /** Remover pelo menu do nó. Ausente quando só existe uma seção. */
  onRemoveSection?: (sectionId: string) => void;
  onTestFlow?: () => void;
  /**
   * Botão "Organizar": reposiciona as seções pelo caminho (desfaz as que ficaram uma em cima da
   * outra). Ausente onde a posição não é guardada — lá o mapa já abre organizado.
   */
  onOrganize?: () => void;
  /** Chamado quando o usuário solta uma seção arrastada, com a posição final. */
  onSectionPositionChange: (sectionId: string, x: number, y: number) => void;
  /** Texto do nó final (formulário da fase: "Fim do formulário"). */
  terminalLabel?: string;
  /** Até quando corrigir regra órfã (formulário da fase: "antes de salvar"). */
  orphanDeadline?: string;
};

export function SectionFlowCanvas({
  sections,
  selectedSectionId = null,
  automationCountBySectionId,
  onAddSection,
  onSelectSection,
  onRemoveSection,
  onTestFlow,
  onOrganize,
  onSectionPositionChange,
  terminalLabel,
  orphanDeadline = 'antes de publicar',
}: SectionFlowCanvasProps) {
  const computedGraph = useMemo(() => {
    const graph = buildSectionFlowGraph(sections, automationCountBySectionId, selectedSectionId);
    // Seta na ponta, na cor da aresta.
    const edges = graph.edges.map((edge) => ({
      ...edge,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: SECTION_EDGE_COLORS[edge.data.kind],
        width: 16,
        height: 16,
      },
    }));
    return { nodes: graph.nodes, edges };
  }, [sections, automationCountBySectionId, selectedSectionId]);
  const actions = useMemo<SectionFlowActions>(
    () => ({ onEditSection: onSelectSection, onRemoveSection, terminalLabel }),
    [onSelectSection, onRemoveSection, terminalLabel],
  );
  const orphanCount = useMemo(() => countOrphanedRules(sections), [sections]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedGraph.nodes);
  const [edges, setEdges] = useEdgesState(computedGraph.edges);

  useEffect(() => {
    setNodes((prev) => mergeNodePositions(prev, computedGraph.nodes));
    setEdges(computedGraph.edges);
  }, [computedGraph, setNodes, setEdges]);

  return (
    <div className="relative h-full w-full bg-bg-base">
      <SectionFlowActionsContext.Provider value={actions}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => {
              if (node.type === 'section') onSelectSection(node.id);
            }}
            onNodeDragStop={(_, node) => {
              if (node.type === 'section') {
                onSectionPositionChange(node.id, node.position.x, node.position.y);
              }
            }}
            fitView
            minZoom={0.5}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            className="h-full w-full"
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#dbe4f2" />
            <Controls
              showInteractive={false}
              position="bottom-left"
              style={controlsStyle}
              className="!m-4 w-8 overflow-hidden rounded-[8px] border border-border-strong [&_.react-flow__controls-button]:h-[30px] [&_.react-flow__controls-button]:w-8"
            />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={minimapNodeColor}
              nodeStrokeWidth={0}
              nodeBorderRadius={6}
              bgColor="var(--bg-surface)"
              maskColor="rgb(var(--color-primary-ch) / 0.04)"
              maskStrokeColor={PRIMARY}
              maskStrokeWidth={1.5}
              style={{ width: 200, height: 132 }}
              className="!m-4 overflow-hidden rounded-[8px] border border-border-strong"
            />
          </ReactFlow>
        </ReactFlowProvider>
      </SectionFlowActionsContext.Provider>

      <div className={`${floatingCard} left-4 top-4 flex gap-1.5 p-1.5`}>
        <button
          type="button"
          onClick={onAddSection}
          className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-container"
        >
          <Plus className="h-[15px] w-[15px]" />
          Adicionar seção
        </button>
        {onTestFlow ? (
          <button
            type="button"
            onClick={onTestFlow}
            className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-border-strong px-3 text-[13px] font-bold text-tx-primary hover:bg-bg-hover"
          >
            <Play className="h-3.5 w-3.5" />
            Testar fluxo
          </button>
        ) : null}
        {onOrganize ? (
          <button
            type="button"
            onClick={onOrganize}
            title="Reposiciona as seções pelo caminho: o padrão em cima, as ramificações abaixo"
            className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-border-strong px-3 text-[13px] font-bold text-tx-primary hover:bg-bg-hover"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Organizar
          </button>
        ) : null}
      </div>

      <div
        className={`${floatingCard} right-4 top-4 hidden items-center gap-3.5 px-3.5 py-[9px] text-xs font-semibold text-tx-secondary md:flex`}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-[18px] rounded-full bg-[#94a3b8]" />
          Caminho padrão
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-[18px] rounded-full bg-[#F0A500]" />
          Regra de ramificação
        </span>
      </div>

      {orphanCount > 0 ? (
        <div
          role="status"
          className="absolute left-1/2 top-4 z-10 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 shadow-[0_8px_24px_rgba(13,29,41,.08)] max-lg:top-20"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {orphanCount} regra{orphanCount > 1 ? 's' : ''} órfã{orphanCount > 1 ? 's' : ''}{' '}
          encontrada{orphanCount > 1 ? 's' : ''} — corrija ou remova {orphanDeadline}.
        </div>
      ) : null}
    </div>
  );
}
