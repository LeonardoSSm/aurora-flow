import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';

const PRIMARY = 'rgb(var(--color-primary-ch))';
const EDGE_COLOR = '#94a3b8';

/** Cartões que flutuam sobre o canvas: barra de ações, trilha e avisos. */
export const floatingCard =
  'absolute z-10 rounded-[10px] border border-border-strong bg-bg-surface shadow-[0_8px_24px_rgba(13,29,41,.08)]';

// Controles do React Flow em coluna branca de 32px, como no mapa de seções.
const controlsStyle = {
  '--xy-controls-button-background-color': 'var(--bg-surface)',
  '--xy-controls-button-background-color-hover': 'var(--bg-surface-hover)',
  '--xy-controls-button-color': 'var(--text-secondary)',
  '--xy-controls-button-color-hover': PRIMARY,
  '--xy-controls-button-border-color': 'var(--border-default)',
  '--xy-controls-box-shadow': 'none',
} as CSSProperties;

export type ChainItem = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

/** Tipo do arrastar que a biblioteca de nós de fluxo usa (NodeLibrary). */
const FLOW_NODE_MIME = 'application/reactflow';

/** Item (nó do canvas) debaixo do ponto da tela, pelo `data-id` que o React Flow põe no nó. */
function itemAtPoint(x: number, y: number): string | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const node = element.closest('.react-flow__node');
    if (node) return node.getAttribute('data-id');
  }
  return null;
}

/** Posição de cada item numa fileira da esquerda para a direita. */
function chainPosition(index: number, nodeWidth: number, gap: number) {
  return { x: index * (nodeWidth + gap), y: 0 };
}

/**
 * Canvas de uma sequência linear (fases do processo, seções do formulário de uma fase): os itens
 * ficam numa fileira ligada por setas. Arrastar um nó e soltar entre outros muda a ordem — a
 * posição não é guardada, só a ordem resultante.
 */
export function ProcessChainCanvas({
  items,
  nodeTypes,
  nodeWidth,
  gap = 90,
  onReorder,
  onItemClick,
  extraEdges,
  edgeTypes,
  onEdgeClick,
  onExternalDragOver,
  onExternalDrop,
  extraNodes,
  onExtraNodeClick,
  onExtraNodeDragStop,
  onConnect,
  children,
}: {
  items: ChainItem[];
  nodeTypes: NodeTypes;
  nodeWidth: number;
  gap?: number;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onItemClick?: (id: string) => void;
  /** Ligações além da fileira (ex.: setas de automação entre fases). */
  extraEdges?: Edge[];
  edgeTypes?: EdgeTypes;
  onEdgeClick?: (edgeId: string) => void;
  /**
   * Arrastar de fora (nó da biblioteca de fluxos, `application/reactflow`): avisa sobre qual item
   * está o cursor (null = nenhum) e, ao soltar, o item e o tipo do nó.
   */
  onExternalDragOver?: (itemId: string | null) => void;
  /** Soltou: o item debaixo do cursor (ou null) e o ponto no espaço do canvas. */
  onExternalDrop?: (itemId: string | null, nodeType: string, position: { x: number; y: number }) => void;
  /** Nós soltos além da fileira (automações no mapa): posição livre, arrastáveis, ligáveis. */
  extraNodes?: Node[];
  onExtraNodeClick?: (id: string) => void;
  onExtraNodeDragStop?: (id: string, position: { x: number; y: number }) => void;
  /** Liga com linha (só quando informado: o canvas passa a aceitar ligações). */
  onConnect?: (connection: Connection) => void;
  /** Cartões flutuantes por cima do canvas. */
  children?: ReactNode;
}) {
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const itemIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const layoutNodes = useMemo<Node[]>(
    () => [
      ...items.map((item, index) => ({
        id: item.id,
        type: item.type,
        data: item.data,
        position: chainPosition(index, nodeWidth, gap),
        draggable: Boolean(onReorder),
      })),
      ...(extraNodes ?? []),
    ],
    [items, nodeWidth, gap, onReorder, extraNodes],
  );
  const edges = useMemo<Edge[]>(
    () => [
      ...items.slice(1).map((item, index) => ({
        id: `${items[index].id}->${item.id}`,
        source: items[index].id,
        target: item.id,
        type: 'smoothstep',
        style: { stroke: EDGE_COLOR, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 },
      })),
      ...(extraEdges ?? []),
    ],
    [items, extraEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  useEffect(() => setNodes(layoutNodes), [layoutNodes, setNodes]);

  // Os nós soltos chegam depois das fases (vêm do servidor): reenquadra uma vez quando aparecem,
  // para o mapa não abrir mostrando só as fases.
  const hasExtraNodes = (extraNodes?.length ?? 0) > 0;
  const refittedRef = useRef(false);
  useEffect(() => {
    if (!hasExtraNodes || refittedRef.current) return;
    refittedRef.current = true;
    const timer = setTimeout(() => void flowRef.current?.fitView({ padding: 0.2, maxZoom: 1 }), 80);
    return () => clearTimeout(timer);
  }, [hasExtraNodes]);

  const acceptsDrop = Boolean(onExternalDrop);

  return (
    <div
      className="relative h-full w-full bg-bg-base"
      onDragOver={
        acceptsDrop
          ? (event) => {
              if (!event.dataTransfer.types.includes(FLOW_NODE_MIME)) return;
              event.preventDefault();
              // Tem de casar com o effectAllowed da biblioteca ('move'): senão o navegador mostra o
              // cursor de bloqueado e não deixa soltar.
              event.dataTransfer.dropEffect = 'move';
              onExternalDragOver?.(itemAtPoint(event.clientX, event.clientY));
            }
          : undefined
      }
      onDragLeave={
        acceptsDrop
          ? (event) => {
              // Saiu do canvas (não só passou de um filho para outro).
              if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
                onExternalDragOver?.(null);
              }
            }
          : undefined
      }
      onDrop={
        acceptsDrop
          ? (event) => {
              const nodeType = event.dataTransfer.getData(FLOW_NODE_MIME);
              if (!nodeType) return;
              event.preventDefault();
              onExternalDragOver?.(null);
              const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? {
                x: 0,
                y: 0,
              };
              onExternalDrop?.(itemAtPoint(event.clientX, event.clientY), nodeType, position);
            }
          : undefined
      }
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          nodesConnectable={Boolean(onConnect)}
          onConnect={onConnect}
          // Apagar só pelos menus (configuração do nó, clique na linha): Delete não some com nada.
          deleteKeyCode={null}
          onNodeClick={(_, node) => (itemIds.has(node.id) ? onItemClick?.(node.id) : onExtraNodeClick?.(node.id))}
          onEdgeClick={(_, edge) => onEdgeClick?.(edge.id)}
          onNodeDragStop={(_, node) => {
            if (!itemIds.has(node.id)) {
              onExtraNodeDragStop?.(node.id, node.position);
              return;
            }
            const fromIndex = items.findIndex((item) => item.id === node.id);
            // Nova posição = quantos outros nós ficaram com o centro à esquerda do centro dele.
            const center = node.position.x + nodeWidth / 2;
            const toIndex = items.filter(
              (item, index) =>
                item.id !== node.id && chainPosition(index, nodeWidth, gap).x + nodeWidth / 2 < center,
            ).length;
            if (fromIndex >= 0 && toIndex !== fromIndex) onReorder?.(fromIndex, toIndex);
            else setNodes(layoutNodes);
          }}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.3}
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
            nodeColor={() => 'var(--border-strong)'}
            nodeStrokeWidth={0}
            nodeBorderRadius={6}
            bgColor="var(--bg-surface)"
            maskColor="rgb(var(--color-primary-ch) / 0.04)"
            maskStrokeColor={PRIMARY}
            maskStrokeWidth={1.5}
            style={{ width: 200, height: 132 }}
            className="!m-4 hidden overflow-hidden rounded-[8px] border border-border-strong md:block"
          />
        </ReactFlow>
      </ReactFlowProvider>
      {children}
    </div>
  );
}
