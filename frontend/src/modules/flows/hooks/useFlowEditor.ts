import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { createFlow, fetchFlow, updateFlow } from '../services/flows-api';
import type { Flow, FlowEdge, FlowNode, FlowNodeType, FlowViewport } from '../types/flow.types';
import { validateFlow, type ValidationError } from '../lib/flow-validation';

// ── Conversion helpers ────────────────────────────────────────────────

function toRfNode(n: FlowNode): Node {
  return { id: n.id, type: n.type, position: n.position, data: { ...n.data } };
}

function toRfEdge(e: FlowEdge): Edge {
  return { id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? null, target: e.target };
}

function fromRfNode(n: Node): FlowNode {
  return {
    id: n.id,
    type: n.type as FlowNodeType,
    position: n.position,
    data: n.data as FlowNode['data'],
  };
}

function fromRfEdge(e: Edge): FlowEdge {
  return {
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? undefined,
    target: e.target,
  };
}

/**
 * Retrato do que vai para o servidor. Medição de tamanho, seleção e afins do React Flow
 * mudam `nodes` sem mudar nada disto — e não podem disparar o salvamento automático.
 */
export function persistedFlowKey(
  name: string,
  isActive: boolean,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string {
  return JSON.stringify({ name, isActive, nodes, edges });
}

type SavePayload = {
  name: string;
  isActive: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: FlowViewport | null;
};

let nodeCounter = 0;
function genId(): string {
  return `node_${Date.now()}_${++nodeCounter}`;
}

const MAX_UNDO = 20;

export function defaultNodeData(type: FlowNodeType): FlowNode['data'] {
  if (type === 'condition_field_value') return { operator: 'equals' };
  if (type === 'condition_solicitation_status') return { operator: 'equals' };
  if (type === 'condition_solicitation_priority') return { operator: 'equals' };
  if (type === 'trigger_approval_completed') return { result: 'any' };
  if (type === 'action_webhook') return { method: 'POST' };
  if (type === 'action_send_whatsapp') return { recipientType: 'requester', message: '' };
  if (type === 'action_run_flow') return { mode: 'sync', passContext: true };
  if (type === 'trigger_scheduled') return { mode: 'interval', intervalUnit: 'minutes' };
  if (type === 'action_http_check') return { method: 'GET' };
  if (type === 'condition_response_value') return { operator: 'equals' };
  if (type === 'action_ai_agent') return { message: 'Analise essa imagem.' };
  // Nó novo já para no reenvio do mesmo item; nós antigos (sem o campo) seguem como antes.
  if (type === 'action_create_solicitation_from_payload') return { stopIfExisting: true };
  if (type === 'action_notification') {
    return {
      channel: 'email',
      recipients: [],
      title: '',
      content: '',
      priority: 'normal',
      deliveryMode: 'immediate',
      continueOnFailure: false,
    };
  }
  if (type === 'condition_approval_result') return { operator: 'equals', value: 'approved' };
  return {};
}

// ── Hook ──────────────────────────────────────────────────────────────

/** Gatilhos que observam um formulário: no editor preso a um processo, já nascem com ele. */
const FORM_SCOPED_TRIGGERS = new Set<FlowNodeType>([
  'trigger_form_submit',
  'trigger_solicitation_created',
  'trigger_solicitation_moved',
  'trigger_approval_completed',
  'trigger_attachment_uploaded',
  'trigger_phase_field_saved',
  'trigger_phase_entered',
]);

/**
 * `processFormId`: editor aberto dentro de um processo (mapa de processos). Fluxo novo é criado
 * já ligado a ele e os gatilhos de formulário arrastados vêm com ele escolhido.
 */
export function useFlowEditor(flowId: string | null, processFormId: string | null = null) {
  const qc = useQueryClient();

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Flow metadata
  const [flowName, setFlowName] = useState('Novo fluxo');
  const [isActive, setIsActive] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Persistence state
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Viewport restoration
  const [initialViewport, setInitialViewport] = useState<FlowViewport | null>(null);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  // Refs that survive renders
  const mountedRef = useRef(false);
  const isLoadingDataRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Retrato do último estado carregado/salvo; igual a ele = nada a salvar. */
  const lastPersistedKeyRef = useRef<string | null>(null);
  const validationErrorsRef = useRef<ValidationError[]>([]);

  // Live viewport capture
  const getCurrentViewportRef = useRef<(() => FlowViewport | null) | null>(null);
  const viewportRef = useRef<FlowViewport | null>(null);

  // Undo stack: snapshots pushed before destructive operations
  const undoStackRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  // Keep refs of current state for snapshotting (updated inline each render)
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // ── Remote data ───────────────────────────────────────────────────

  const { data: flowData } = useQuery({
    queryKey: queryKeys.flows.byId(flowId ?? ''),
    queryFn: () => fetchFlow(flowId ?? ''),
    enabled: !!flowId,
  });

  useEffect(() => {
    // Trocou de fluxo: salvamento pendente do anterior não pode cair no novo (o save usa o
    // flowId atual), e até o GET voltar não há retrato para comparar.
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (flowId) {
      lastPersistedKeyRef.current = null;
      return;
    }
    isLoadingDataRef.current = true;
    setFlowName('Novo fluxo');
    setIsActive(true);
    setNodes([]);
    setEdges([]);
    setInitialViewport(null);
    setHasLoadedData(true);
    viewportRef.current = null;
    setSelectedNodeId(null);
    setLastSavedAt(null);
    setIsDirty(false);
    lastPersistedKeyRef.current = persistedFlowKey('Novo fluxo', true, [], []);
    const t = setTimeout(() => {
      isLoadingDataRef.current = false;
    }, 200);
    return () => clearTimeout(t);
  }, [flowId, setNodes, setEdges]);

  useEffect(() => {
    if (!flowData) return;
    isLoadingDataRef.current = true;
    setFlowName(flowData.name);
    setIsActive(flowData.isActive);
    setNodes(flowData.nodes.map(toRfNode));
    setEdges(flowData.edges.map(toRfEdge));
    setInitialViewport(flowData.viewport);
    setHasLoadedData(true);
    viewportRef.current = flowData.viewport;
    setIsDirty(false);
    // Salvamento agendado antes da carga não pode disparar sobre o fluxo recém-carregado.
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    lastPersistedKeyRef.current = persistedFlowKey(
      flowData.name,
      flowData.isActive,
      flowData.nodes.map(toRfNode).map(fromRfNode),
      flowData.edges.map(toRfEdge).map(fromRfEdge),
    );
    const t = setTimeout(() => {
      isLoadingDataRef.current = false;
    }, 200);
    return () => clearTimeout(t);
  }, [flowData, setNodes, setEdges]);

  // ── Mutations ─────────────────────────────────────────────────────

  const onSaveSuccess = useCallback(
    (savedFlow: Flow, saved: SavePayload) => {
      lastPersistedKeyRef.current = persistedFlowKey(
        saved.name,
        saved.isActive,
        saved.nodes,
        saved.edges,
      );
      setLastSavedAt(new Date());
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: queryKeys.flows.all() });
      qc.invalidateQueries({ queryKey: queryKeys.flows.byId(savedFlow.id) });
      if (savedFlow.formId) {
        qc.invalidateQueries({ queryKey: queryKeys.flows.byForm(savedFlow.formId) });
      }
    },
    [qc],
  );

  const createMutation = useMutation({
    mutationFn: (vars: SavePayload) =>
      createFlow({
        name: vars.name,
        ...(processFormId ? { formId: processFormId } : {}),
        isActive: vars.isActive,
        nodes: vars.nodes,
        edges: vars.edges,
        viewport: vars.viewport,
      }),
    onSuccess: (flow, vars) => onSaveSuccess(flow, vars),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: SavePayload) =>
      updateFlow(flowId ?? '', {
        name: vars.name,
        isActive: vars.isActive,
        nodes: vars.nodes,
        edges: vars.edges,
        viewport: vars.viewport,
      }),
    onSuccess: (flow, vars) => onSaveSuccess(flow, vars),
  });

  // ── Save ──────────────────────────────────────────────────────────

  const save = useCallback(async (): Promise<Flow | null> => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const viewport = getCurrentViewportRef.current?.() ?? viewportRef.current;
    const flowNodes = nodes.map(fromRfNode);
    const flowEdges = edges.map(fromRfEdge);

    if (flowId) {
      return updateMutation.mutateAsync({
        name: flowName,
        isActive,
        nodes: flowNodes,
        edges: flowEdges,
        viewport,
      });
    }

    return createMutation.mutateAsync({
      name: flowName,
      isActive,
      nodes: flowNodes,
      edges: flowEdges,
      viewport,
    });
  }, [nodes, edges, flowId, flowName, isActive, updateMutation, createMutation]);

  const saveRef = useRef(save);
  saveRef.current = save;

  // ── Dirty tracking + auto-save ────────────────────────────────────

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isLoadingDataRef.current) return;
    // Fluxo existente ainda sem dados: não há o que comparar nem salvar (no StrictMode o efeito
    // roda de novo antes de o GET voltar, e o salvamento agendado aqui gravava o fluxo recém-aberto).
    if (lastPersistedKeyRef.current === null) return;
    const currentKey = persistedFlowKey(
      flowName,
      isActive,
      nodes.map(fromRfNode),
      edges.map(fromRfEdge),
    );
    if (currentKey === lastPersistedKeyRef.current) {
      // Nada mudou no que é gravado (só medição/seleção, ou a edição foi desfeita).
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      setIsDirty(false);
      return;
    }
    setIsDirty(true);
    if (!flowId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      if (validationErrorsRef.current.length === 0) void saveRef.current();
    }, 3000);
  }, [nodes, edges, flowName, isActive, flowId]);

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    },
    [],
  );

  // ── Undo stack ────────────────────────────────────────────────────

  function pushUndo() {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_UNDO - 1)),
      { nodes: [...nodesRef.current], edges: [...edgesRef.current] },
    ];
  }

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSelectedNodeId(null);
  }, [setNodes, setEdges]);

  // ── Validation ────────────────────────────────────────────────────

  const validationResult = useMemo(() => {
    const flowNodes = nodes.map(fromRfNode);
    const flowEdges = edges.map(fromRfEdge);
    return validateFlow(flowNodes, flowEdges);
  }, [nodes, edges]);

  validationErrorsRef.current = validationResult;

  const validationErrors = useMemo(
    () => validationResult.map((e) => e.message),
    [validationResult],
  );

  // Node IDs with structural problems (disconnected) for canvas highlighting
  const problematicNodeIds = useMemo(
    () =>
      new Set(
        validationResult
          .filter((e) => e.nodeId && e.type === 'disconnected_node')
          .map((e) => e.nodeId as string),
      ),
    [validationResult],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ── Node manipulation ─────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      pushUndo();
      setEdges((eds) => addEdge({ ...connection, id: `edge_${Date.now()}` }, eds));
    },
    [setEdges],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      pushUndo();
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const addNodeAtPosition = useCallback(
    (type: FlowNodeType, position: { x: number; y: number }) => {
      pushUndo();
      const id = genId();
      const base = defaultNodeData(type);
      const data =
        processFormId && FORM_SCOPED_TRIGGERS.has(type) ? { ...base, formId: processFormId } : base;
      setNodes((nds) => [...nds, { id, type, position, data }]);
      setSelectedNodeId(id);
    },
    [setNodes, processFormId],
  );

  const addNode = useCallback(
    (type: FlowNodeType) => {
      addNodeAtPosition(type, { x: 200, y: 100 + nodes.length * 130 });
    },
    [addNodeAtPosition, nodes.length],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      pushUndo();
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges],
  );

  return {
    // React Flow state
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,

    // Flow metadata
    flowName,
    isActive,
    setFlowName,
    setIsActive,

    // Selection
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,

    // Persistence
    isDirty,
    isSaving,
    lastSavedAt,
    save,

    // Viewport
    initialViewport,
    hasLoadedData,
    getCurrentViewportRef,

    // Validation
    validationErrors,
    validationResult,
    isFlowValid: validationResult.length === 0,
    problematicNodeIds,

    // Undo
    undo,
    undoable: undoStackRef.current.length > 0,

    // Node manipulation
    updateNodeData,
    addNode,
    addNodeAtPosition,
    deleteNode,

    // Raw server data (for legacy migration warning)
    flowServerData: flowData ?? null,
  };
}
