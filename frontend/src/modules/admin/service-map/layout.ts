import type { EdgeKind, ServiceDef, ServiceEdge, ServiceState } from './topology';

/**
 * Posição dos nós e desenho das arestas do Mapa de serviços. Função pura, porte
 * do `svcVals()` do protótipo (design_handoff_mapa_servicos): a grade e as regras
 * de caminho estão descritas no README do handoff, seção "Arestas".
 */

export const NODE_W = 150;
export const NODE_H = 60;
/** Uma coluna a cada 214px (vão de 64px entre nós). */
export const COL_STEP = 214;
/** Uma linha a cada 84px (vão de 24px entre nós). */
export const ROW_STEP = 84;
/** Faixa do topo com os títulos das colunas. */
export const TOP = 26;

export const EDGE_COLORS = {
  app: '#1A3C8F',
  metrics: '#F5A623',
  tools: '#9aaabb',
  idle: '#9aaabb',
  fail: '#f43f5e',
} as const;

/** Separa linhas que dividem o mesmo vão: métricas para a direita, ferramentas para a esquerda. */
const KIND_OFFSET: Record<EdgeKind, number> = { app: 0, metrics: 10, tools: -10 };

const DASH = '5 4';

export type NodeLayout = {
  id: string;
  x: number;
  y: number;
  state: ServiceState | undefined;
  selected: boolean;
  /** Há seleção e este nó não é ela nem está ligado a ela. */
  dimmed: boolean;
  opacity: number;
};

export type EdgeLayout = {
  source: string;
  target: string;
  kind: EdgeKind;
  /** Caminho SVG da linha. */
  d: string;
  /** Triângulo da seta, na ponta do destino. */
  arrow: string;
  stroke: string;
  strokeWidth: number;
  /** `stroke-dasharray`, ou null para linha sólida. */
  dash: string | null;
  /** Mostra o fluxo animado por cima (só nas sólidas e destacadas). */
  flow: boolean;
  opacity: number;
  /** Toca o nó selecionado. */
  highlighted: boolean;
};

export type ServiceMapLayout = {
  width: number;
  height: number;
  columns: Array<{ label: string; x: number }>;
  nodes: NodeLayout[];
  edges: EdgeLayout[];
};

export function computeLayout(
  services: readonly ServiceDef[],
  edges: readonly ServiceEdge[],
  statusById: Readonly<Record<string, ServiceState | undefined>>,
  selectedId: string | null,
  columns: readonly string[] = [],
): ServiceMapLayout {
  const maxCol = Math.max(0, ...services.map((s) => s.col));
  const maxRow = Math.max(0, ...services.map((s) => s.row));
  const width = maxCol * COL_STEP + NODE_W;
  const height = TOP + maxRow * ROW_STEP + NODE_H;

  const place = (s: ServiceDef) => ({ x: s.col * COL_STEP, y: TOP + s.row * ROW_STEP, col: s.col });
  const pos = new Map(services.map((s) => [s.id, place(s)]));

  // Com seleção, o que fica aceso: o próprio nó e quem tem aresta com ele.
  const lit = selectedId
    ? new Set([
        selectedId,
        ...edges
          .filter(([a, b]) => a === selectedId || b === selectedId)
          .flatMap(([a, b]) => [a, b]),
      ])
    : null;

  const nodes: NodeLayout[] = services.map((s) => {
    const p = place(s);
    const dimmed = lit !== null && !lit.has(s.id);
    return {
      id: s.id,
      x: p.x,
      y: p.y,
      state: statusById[s.id],
      selected: selectedId === s.id,
      dimmed,
      opacity: dimmed ? 0.4 : 1,
    };
  });

  const edgeLayouts = edges.flatMap<EdgeLayout>(([a, b, kind]) => {
    const s = pos.get(a);
    const t = pos.get(b);
    if (!s || !t) return [];
    const off = KIND_OFFSET[kind];

    let d: string;
    let arrow: string;
    if (s.col === t.col) {
      // Mesma coluna (prometheus → backend): vertical, do topo da origem à base do alvo.
      const cx = s.x + NODE_W / 2;
      const sy = s.y;
      const ty = t.y + NODE_H;
      d = `M${cx} ${sy} V${ty}`;
      arrow = `M${cx - 5} ${ty + 8} L${cx} ${ty} L${cx + 5} ${ty + 8} Z`;
    } else {
      const sx = s.x + NODE_W;
      const sy = s.y + NODE_H / 2;
      const tx = t.x;
      const ty = t.y + NODE_H / 2;
      if (t.col === s.col + 1) {
        d = sy === ty ? `M${sx} ${sy} H${tx}` : `M${sx} ${sy} H${sx + 32 + off} V${ty} H${tx}`;
      } else {
        // Pulando colunas: faixa horizontal no vão entre linhas, logo acima do alvo.
        const lane = t.y - 12 + off / 2;
        d = `M${sx} ${sy} H${sx + 32 + off} V${lane} H${tx - 32 + off} V${ty} H${tx}`;
      }
      arrow = `M${tx - 8} ${ty - 4.5} L${tx} ${ty} L${tx - 8} ${ty + 4.5} Z`;
    }

    const sa = statusById[a];
    const sb = statusById[b];
    const fail = sa === 'falha' || sb === 'falha';
    const idle = sa === 'demanda' || sb === 'demanda';
    const stroke = fail ? EDGE_COLORS.fail : idle ? EDGE_COLORS.idle : EDGE_COLORS[kind];
    const highlighted = selectedId !== null && (a === selectedId || b === selectedId);
    const visible = selectedId === null || highlighted;

    return [
      {
        source: a,
        target: b,
        kind,
        d,
        arrow,
        stroke,
        strokeWidth: highlighted ? 2 : 1.5,
        dash: fail || idle ? DASH : null,
        flow: !fail && !idle && visible,
        opacity: visible ? 1 : 0.18,
        highlighted,
      },
    ];
  });

  return {
    width,
    height,
    columns: columns.map((label, i) => ({ label, x: i * COL_STEP })),
    nodes,
    edges: edgeLayouts,
  };
}
