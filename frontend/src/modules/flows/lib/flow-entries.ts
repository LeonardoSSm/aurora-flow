import { isFlowTriggerNodeType } from '../types/flow.types';

type GraphNode = { id: string; type?: string; data?: unknown };
type GraphEdge = { source: string; target: string };

/** Gatilhos do fluxo, na ordem do fluxo: cada um é uma entrada. */
export function getEntryNodes<T extends GraphNode>(nodes: readonly T[]): T[] {
  return nodes.filter((node) => isFlowTriggerNodeType(node.type));
}

/**
 * Formulário que um nó "define": o do gatilho e o da solicitação criada por "Criar solicitação" —
 * dali em diante os campos são os dele.
 */
export function ownFormId(node: GraphNode): string | null {
  if (!isFlowTriggerNodeType(node.type) && node.type !== 'action_create_solicitation_from_payload') {
    return null;
  }
  const formId = (node.data as { formId?: unknown } | undefined)?.formId;
  return typeof formId === 'string' && formId ? formId : null;
}

/**
 * Formulário cujos campos o nó enxerga, num fluxo que pode ter várias entradas: o mais próximo
 * subindo pelas conexões (o próprio nó, um "Criar solicitação" no caminho, ou o gatilho que chega
 * nele). Nó solto ou sem formulário no caminho: o primeiro gatilho que tiver um — o comportamento
 * de quando o fluxo tinha um gatilho só.
 */
export function resolveNodeFormId(
  nodeId: string | null,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (nodeId && byId.has(nodeId)) {
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];
    while (frontier.length > 0) {
      for (const id of frontier) {
        const formId = ownFormId(byId.get(id) as GraphNode);
        if (formId) return formId;
      }
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of edges) {
          if (edge.target === id && !visited.has(edge.source) && byId.has(edge.source)) {
            visited.add(edge.source);
            next.push(edge.source);
          }
        }
      }
      frontier = next;
    }
  }
  for (const entry of getEntryNodes(nodes)) {
    const formId = ownFormId(entry);
    if (formId) return formId;
  }
  return null;
}
