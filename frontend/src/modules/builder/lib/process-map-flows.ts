import type { FlowEdge, FlowNode, FlowNodeData, FlowNodeType } from '../../flows/types/flow.types';

/**
 * Automações desenhadas no mapa de processos. Cada "grupo" é um fluxo (salvo ou rascunho do mapa)
 * com os nós dele soltos no mapa; as linhas fase ↔ nó não são arestas do fluxo, são o filtro de fase
 * guardado no próprio nó (gatilho com `phaseId`, "Mover para fase" com o destino).
 *
 * A posição do nó no mapa fica em `data.mapPosition` — separada de `position`, que é a do editor
 * de fluxos.
 */
export type MapGroup = {
  /** Id do fluxo, ou `rascunho:…` para o que ainda não foi salvo. */
  key: string;
  flowId: string | null;
  name: string;
  isActive: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type MapPoint = { x: number; y: number };

/** Gatilhos com filtro de fase: ligados a uma fase, passam a valer só para ela. */
export const PHASE_FILTER_TRIGGERS = new Set<FlowNodeType>([
  'trigger_phase_entered',
  'trigger_phase_field_saved',
  'trigger_approval_completed',
  'trigger_sla_warning',
  'trigger_sla_breached',
]);

/** Gatilhos que observam um formulário: no mapa, sempre o do processo. */
export const FORM_TRIGGERS = new Set<FlowNodeType>([
  'trigger_form_submit',
  'trigger_solicitation_created',
  'trigger_solicitation_moved',
  'trigger_approval_completed',
  'trigger_attachment_uploaded',
  'trigger_phase_field_saved',
  'trigger_phase_entered',
]);

/** Nós que levam a uma fase: a linha nó → fase é o destino deles. */
export const PHASE_TARGET_NODES = new Set<FlowNodeType>(['action_move_phase', 'action_wait_for_phase_fields']);

/** Cria a solicitação; com a fase de entrada, ela já nasce nessa fase (entrada externa). */
export const ENTRY_NODE: FlowNodeType = 'action_create_solicitation_from_payload';

/**
 * Gatilhos de fora do processo (não trazem solicitação): a linha deles até uma fase é uma entrada
 * externa — põe um "Criar solicitação" no meio, que faz a solicitação nascer na fase.
 */
export const EXTERNAL_ENTRY_TRIGGERS = new Set<FlowNodeType>(['trigger_webhook_received', 'trigger_scheduled']);

const SEP = '::';

export function mapNodeId(groupKey: string, nodeId: string): string {
  return `${groupKey}${SEP}${nodeId}`;
}

export function parseMapNodeId(id: string): { groupKey: string; nodeId: string } | null {
  const at = id.lastIndexOf(SEP);
  if (at <= 0) return null;
  return { groupKey: id.slice(0, at), nodeId: id.slice(at + SEP.length) };
}

export function isTrigger(type: string): boolean {
  return type.startsWith('trigger_');
}

function dataOf(node: FlowNode): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

export function mapPositionOf(node: FlowNode): MapPoint | null {
  const pos = dataOf(node).mapPosition as MapPoint | undefined;
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? pos : null;
}

function withData(node: FlowNode, patch: Record<string, unknown>): FlowNode {
  return { ...node, data: { ...dataOf(node), ...patch } as FlowNodeData };
}

function replaceNode(group: MapGroup, node: FlowNode): MapGroup {
  return { ...group, nodes: group.nodes.map((item) => (item.id === node.id ? node : item)) };
}

export function setNodeMapPosition(group: MapGroup, nodeId: string, position: MapPoint): MapGroup {
  const node = group.nodes.find((item) => item.id === nodeId);
  if (!node) return group;
  return replaceNode(group, withData(node, { mapPosition: { x: Math.round(position.x), y: Math.round(position.y) } }));
}

// ── Linhas fase ↔ nó ─────────────────────────────────────────────────────

export type PhaseLink = {
  groupKey: string;
  nodeId: string;
  phaseId: string;
  /**
   * `entrada`: a fase dispara o nó (gatilho). `destino`: o nó leva à fase. `externa`: "Criar
   * solicitação" — a solicitação nasce nesta fase, vinda de fora (webhook, agendamento).
   */
  kind: 'entrada' | 'destino' | 'externa';
};

export function phaseLinks(groups: readonly MapGroup[], phaseIds: ReadonlySet<string>): PhaseLink[] {
  const links: PhaseLink[] = [];
  for (const group of groups) {
    for (const node of group.nodes) {
      const phaseId = dataOf(node).phaseId;
      if (typeof phaseId !== 'string' || !phaseIds.has(phaseId)) continue;
      if (isTrigger(node.type)) links.push({ groupKey: group.key, nodeId: node.id, phaseId, kind: 'entrada' });
      else if (PHASE_TARGET_NODES.has(node.type)) {
        links.push({ groupKey: group.key, nodeId: node.id, phaseId, kind: 'destino' });
      } else if (node.type === ENTRY_NODE) {
        links.push({ groupKey: group.key, nodeId: node.id, phaseId, kind: 'externa' });
      }
    }
  }
  return links;
}

/** `createdNodeId`: o "Criar solicitação" que a ligação pôs no mapa (para abrir a configuração). */
export type LinkResult = { group: MapGroup; createdNodeId?: string } | { error: string };

/**
 * Linha da fase para o nó. Gatilho com filtro de fase: passa a valer para ela. Ação ou condição:
 * entra antes dela um gatilho "Entrou na fase" (`newTriggerId`), já ligado.
 */
export function linkPhaseToNode(
  group: MapGroup,
  nodeId: string,
  phase: { id: string; label: string },
  formId: string,
  newTriggerId: string,
): LinkResult {
  const node = group.nodes.find((item) => item.id === nodeId);
  if (!node) return { error: 'Nó não encontrado.' };
  if (isTrigger(node.type)) {
    if (!PHASE_FILTER_TRIGGERS.has(node.type)) {
      return { error: 'Este gatilho não tem fase. Use "Entrou na fase", "Aprovação concluída", SLA ou "Campos de fase salvos".' };
    }
    const patch: Record<string, unknown> = { phaseId: phase.id };
    if (FORM_TRIGGERS.has(node.type)) patch.formId = formId;
    if (node.type === 'trigger_sla_warning' || node.type === 'trigger_sla_breached') patch.slaScope = 'phase';
    return { group: replaceNode(group, withData(node, patch)) };
  }
  const at = mapPositionOf(node) ?? { x: 0, y: 0 };
  const trigger: FlowNode = {
    id: newTriggerId,
    type: 'trigger_phase_entered',
    position: { x: node.position.x - 320, y: node.position.y },
    data: { formId, phaseId: phase.id, mapPosition: { x: at.x - 320, y: at.y } } as FlowNodeData,
  };
  return {
    group: {
      ...group,
      nodes: [...group.nodes, trigger],
      edges: [...group.edges, { id: `${newTriggerId}->${nodeId}`, source: newTriggerId, target: nodeId }],
    },
  };
}

/**
 * Linha do nó para a fase: o destino de "Mover para fase" / "Esperar campos da fase", ou a fase em
 * que "Criar solicitação" faz a solicitação nascer. De um gatilho de fora (webhook, agendamento),
 * entra no meio um "Criar solicitação" novo (`entry.newNodeId`) já com o formulário do processo.
 */
export function linkNodeToPhase(
  group: MapGroup,
  nodeId: string,
  phase: { id: string; label: string },
  entry?: { formId: string; newNodeId: string },
): LinkResult {
  const node = group.nodes.find((item) => item.id === nodeId);
  if (!node) return { error: 'Nó não encontrado.' };
  if (node.type === ENTRY_NODE) {
    const patch: Record<string, unknown> = { phaseId: phase.id };
    if (entry && !dataOf(node).formId) patch.formId = entry.formId;
    else if (entry && dataOf(node).formId !== entry.formId) {
      return { error: 'Este "Criar solicitação" é de outro formulário: a solicitação não nasce neste processo.' };
    }
    return { group: replaceNode(group, withData(node, patch)) };
  }
  if (isTrigger(node.type)) {
    if (!EXTERNAL_ENTRY_TRIGGERS.has(node.type) || !entry) {
      return {
        error:
          'Só gatilhos de fora do processo ("Webhook recebido", "Agendado") criam solicitações numa fase. Os outros já têm uma solicitação: ligue a fase ao gatilho.',
      };
    }
    const at = mapPositionOf(node) ?? { x: 0, y: 0 };
    const created: FlowNode = {
      id: entry.newNodeId,
      type: ENTRY_NODE,
      position: { x: node.position.x + 320, y: node.position.y },
      data: {
        stopIfExisting: true,
        titleSourceMode: 'template',
        formId: entry.formId,
        phaseId: phase.id,
        mapPosition: { x: at.x + 320, y: at.y },
      } as FlowNodeData,
    };
    return {
      group: {
        ...group,
        nodes: [...group.nodes, created],
        edges: [...group.edges, { id: `${nodeId}->${entry.newNodeId}`, source: nodeId, target: entry.newNodeId }],
      },
      createdNodeId: entry.newNodeId,
    };
  }
  if (!PHASE_TARGET_NODES.has(node.type)) {
    return {
      error:
        'Só "Mover para fase", "Esperar campos da fase", "Criar solicitação" e gatilhos de fora levam a uma fase. Para avisar alguém, ligue a fase ao nó.',
    };
  }
  const patch: Record<string, unknown> = { phaseId: phase.id };
  if (node.type === 'action_move_phase') patch.phaseLabel = phase.label;
  return { group: replaceNode(group, withData(node, patch)) };
}

/** Desfaz a linha fase ↔ nó (tira o filtro / o destino). */
export function unlinkPhase(group: MapGroup, nodeId: string): MapGroup {
  const node = group.nodes.find((item) => item.id === nodeId);
  if (!node) return group;
  const data = { ...dataOf(node) };
  delete data.phaseId;
  delete data.phaseLabel;
  return replaceNode(group, { ...node, data: data as FlowNodeData });
}

// ── Linhas nó → nó ───────────────────────────────────────────────────────

export type ConnectResult = { groups: MapGroup[]; error?: undefined } | { error: string; groups?: undefined };

/**
 * Liga dois nós. Do mesmo fluxo: vira aresta. Rascunho com outro fluxo: o rascunho entra nele.
 * Dois fluxos já salvos diferentes não se juntam.
 */
export function connectNodes(
  groups: readonly MapGroup[],
  source: { groupKey: string; nodeId: string; handle?: string | null },
  target: { groupKey: string; nodeId: string },
): ConnectResult {
  if (source.groupKey === target.groupKey && source.nodeId === target.nodeId) {
    return { error: 'Um nó não liga nele mesmo.' };
  }
  const from = groups.find((group) => group.key === source.groupKey);
  const to = groups.find((group) => group.key === target.groupKey);
  const targetNode = to?.nodes.find((node) => node.id === target.nodeId);
  if (!from || !to || !targetNode) return { error: 'Nó não encontrado.' };
  if (isTrigger(targetNode.type)) return { error: 'Um gatilho só começa a automação: ele não recebe linha.' };

  let merged: MapGroup;
  let removedKey: string | null = null;
  if (from.key === to.key) {
    merged = from;
  } else if (!to.flowId) {
    merged = { ...from, nodes: [...from.nodes, ...to.nodes], edges: [...from.edges, ...to.edges] };
    removedKey = to.key;
  } else if (!from.flowId) {
    merged = { ...to, nodes: [...to.nodes, ...from.nodes], edges: [...to.edges, ...from.edges] };
    removedKey = from.key;
  } else {
    return { error: 'São duas automações salvas diferentes. Ligue nós da mesma automação.' };
  }

  const handle = source.handle ?? undefined;
  const exists = merged.edges.some(
    (edge) => edge.source === source.nodeId && edge.target === target.nodeId && (edge.sourceHandle ?? undefined) === handle,
  );
  if (!exists) {
    merged = {
      ...merged,
      edges: [
        ...merged.edges,
        {
          id: `${source.nodeId}${handle ? `:${handle}` : ''}->${target.nodeId}`,
          source: source.nodeId,
          target: target.nodeId,
          ...(handle ? { sourceHandle: handle } : {}),
        },
      ],
    };
  }

  const next = groups
    .filter((group) => group.key !== removedKey)
    .map((group) => (group.key === from.key || group.key === to.key ? merged : group));
  // Junção: o grupo que sobrou pode ter vindo pelo `to`; garante que aparece uma vez só.
  return { groups: next.filter((group, index) => next.findIndex((other) => other.key === group.key) === index) };
}

export function removeEdge(group: MapGroup, edgeId: string): MapGroup {
  return { ...group, edges: group.edges.filter((edge) => edge.id !== edgeId) };
}

export function removeNode(group: MapGroup, nodeId: string): MapGroup {
  return {
    ...group,
    nodes: group.nodes.filter((node) => node.id !== nodeId),
    edges: group.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
  };
}

// ── Disposição inicial ────────────────────────────────────────────────────

const COLUMN = 320;
const ROW = 190;

/**
 * Onde desenhar cada nó que ainda não tem posição no mapa: cada automação numa faixa abaixo das
 * fases, começando embaixo da fase do gatilho, com os nós seguintes à direita (profundidade).
 */
export function layoutMapNodes(
  groups: readonly MapGroup[],
  phaseX: ReadonlyMap<string, number>,
  topY: number,
): Map<string, MapPoint> {
  const positions = new Map<string, MapPoint>();
  let lane = 0;
  for (const group of groups) {
    const missing = group.nodes.filter((node) => !mapPositionOf(node));
    if (missing.length === 0) continue;

    const depth = new Map<string, number>();
    const roots = group.nodes.filter((node) => isTrigger(node.type) || !group.edges.some((edge) => edge.target === node.id));
    const queue = roots.map((node) => node.id);
    roots.forEach((node) => depth.set(node.id, 0));
    while (queue.length) {
      const id = queue.shift() as string;
      for (const edge of group.edges) {
        if (edge.source !== id || depth.has(edge.target)) continue;
        depth.set(edge.target, (depth.get(id) ?? 0) + 1);
        queue.push(edge.target);
      }
    }

    const trigger = group.nodes.find((node) => isTrigger(node.type));
    const triggerPhase = trigger ? (dataOf(trigger).phaseId as string | undefined) : undefined;
    const startX = triggerPhase ? (phaseX.get(triggerPhase) ?? 0) : 0;
    const perColumn = new Map<number, number>();
    let rows = 1;
    for (const node of group.nodes) {
      const column = depth.get(node.id) ?? 0;
      const row = perColumn.get(column) ?? 0;
      perColumn.set(column, row + 1);
      rows = Math.max(rows, row + 1);
      if (!mapPositionOf(node)) {
        positions.set(mapNodeId(group.key, node.id), {
          x: startX + column * COLUMN,
          y: topY + (lane + row) * ROW,
        });
      }
    }
    lane += rows;
  }
  return positions;
}
