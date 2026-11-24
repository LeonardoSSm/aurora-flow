import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type DefaultEdgeOptions,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, GitBranch, MonitorSmartphone, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import { useNavigate } from 'react-router-dom';
import { queryKeys } from '../../../lib/query-keys';
import { fetchFormById } from '../../forms/services/forms-api';
import type { FormDetail } from '../../forms/types';
import type { Flow, FlowExecution, FlowViewport } from '../types/flow.types';
import { ActionNode } from '../nodes/ActionNode';
import { ConditionNode } from '../nodes/ConditionNode';
import { CustomEdge } from '../nodes/CustomEdge';
import { TriggerNode } from '../nodes/TriggerNode';
import { useFlowEditor } from '../hooks/useFlowEditor';
import { NodeConfigPanel } from '../panels/NodeConfigPanel';
import { isCompactNodeType } from '../panels/node-config/node-meta';
import { FlowToolbar } from './FlowToolbar';
import { ExecutionNotifications } from './ExecutionNotifications';
import { FlowHistoryPanel } from './FlowHistoryPanel';
import { NodeLibrary } from './NodeLibrary';
import { useTheme } from '../../../hooks/use-theme';
import { deleteFlow } from '../services/flows-api';
import { FlowCanvasContext } from '../context/FlowCanvasContext';
import { FlowTestModal } from './FlowTestModal';
import { type FlowNodeType } from '../types/flow.types';
import { resolveNodeFormId } from '../lib/flow-entries';
import { NODE_CONFIG_DIALOG_ATTR, NodeConfigModal } from './NodeConfigModal';

// ── Node types (module-scope for referential stability) ───────────────────

const nodeTypes: NodeTypes = {
  trigger_form_submit: TriggerNode,
  trigger_webhook_received: TriggerNode,
  trigger_solicitation_created: TriggerNode,
  trigger_solicitation_moved: TriggerNode,
  trigger_approval_completed: TriggerNode,
  trigger_scheduled: TriggerNode,
  trigger_attachment_uploaded: TriggerNode,
  trigger_phase_field_saved: TriggerNode,
  trigger_phase_entered: TriggerNode,
  condition_field_value: ConditionNode,
  condition_always_true: ConditionNode,
  condition_solicitation_status: ConditionNode,
  condition_solicitation_priority: ConditionNode,
  condition_response_value: ConditionNode,
  condition_approval_result: ConditionNode,
  action_send_email: ActionNode,
  action_webhook: ActionNode,
  action_http_check: ActionNode,
  action_notify_users: ActionNode,
  action_google_sheets: ActionNode,
  action_update_solicitation_status: ActionNode,
  action_move_kanban_card: ActionNode,
  action_create_approval: ActionNode,
  action_create_solicitation_from_payload: ActionNode,
  action_forward_to_process: ActionNode,
  action_assign_responsible: ActionNode,
  action_send_whatsapp: ActionNode,
  action_erp_operation: ActionNode,
  action_ai_agent: ActionNode,
  action_wait_for_phase_fields: ActionNode,
  action_move_phase: ActionNode,
  action_run_flow: ActionNode,
  action_notification: ActionNode,
};

// ── Edge types (module-scope for referential stability) ───────────────────

const edgeTypes: EdgeTypes = {
  default: CustomEdge,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  // CustomEdge handles all visual styling
};

// ── Toast ─────────────────────────────────────────────────────────────────

interface ToastMsg {
  text: string;
  type: 'error' | 'success';
}

function Toast({ msg, onDismiss }: { msg: ToastMsg; onDismiss: () => void }) {
  const Icon = msg.type === 'error' ? XCircle : CheckCircle2;
  return (
    <div
      className={[
        'pointer-events-auto flex items-start gap-3 rounded-[10px] border px-4 py-3 shadow-lg',
        msg.type === 'error'
          ? 'border-[#fecaca] bg-[#fef2f2] text-[#dc2626]'
          : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]',
      ].join(' ')}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm font-bold leading-snug">{msg.text}</p>
      <button type="button" onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Execution detail panel ────────────────────────────────────────────────

function ExecutionDetailPanel({
  execution,
  nodes,
  onClose,
}: {
  execution: FlowExecution;
  nodes: Node[];
  onClose: () => void;
}) {
  const nodeLabel = (nodeId: string) => {
    const n = nodes.find((n) => n.id === nodeId);
    return (n?.data as Record<string, unknown>)?.label
      ? String((n?.data as Record<string, unknown>).label)
      : (n?.type ?? nodeId);
  };

  const statusIcon =
    execution.status === 'success' ? (
      <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
    ) : (
      <XCircle className="h-4 w-4 text-[#ef4444]" />
    );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-default bg-bg-s2 px-4 py-3">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-tx-secondary">Execução</p>
          <p className="truncate text-sm font-bold text-tx-primary capitalize">
            {execution.status}
            {!execution.submissionId && (
              <span className="ml-2 rounded bg-[#f0fdf4] px-1.5 text-[10px] text-[#16a34a]">
                teste
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-bg-s2"
        >
          <X className="h-4 w-4 text-tx-secondary" />
        </button>
      </div>

      {/* Node results */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {execution.errorMessage && (
          <div className="mb-3 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#dc2626]">
            {execution.errorMessage}
          </div>
        )}

        {(execution.nodeResults ?? []).length === 0 && (
          <p className="text-sm text-tx-muted">Nenhum nó executado.</p>
        )}

        <div className="grid gap-2">
          {(execution.nodeResults ?? []).map((r) => (
            <div
              key={r.nodeId}
              className={[
                'flex items-start gap-3 rounded-[8px] border p-3',
                r.status === 'success'
                  ? 'border-[#bbf7d0] bg-[#f0fdf4]'
                  : r.status === 'failed'
                    ? 'border-[#fecaca] bg-[#fef2f2]'
                    : 'border-border-default bg-bg-s2',
              ].join(' ')}
            >
              {r.status === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
              ) : r.status === 'failed' ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#ef4444]" />
              ) : (
                <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[#94a3b8]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-tx-primary">{nodeLabel(r.nodeId)}</p>
                {r.error && <p className="mt-0.5 text-[11px] text-[#ef4444]">{r.error}</p>}
              </div>
              <span className="shrink-0 text-[11px] text-tx-muted">{r.durationMs}ms</span>
            </div>
          ))}
        </div>

        <ExecutionNotifications
          flowId={execution.flowId}
          executionId={execution.id}
          nodeLabel={nodeLabel}
        />
      </div>
    </div>
  );
}

// ── Empty canvas state ────────────────────────────────────────────────────

function CanvasEmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(79,110,247,0.1)',
          border: '1px solid rgba(79,110,247,0.2)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <GitBranch className="h-8 w-8" style={{ color: 'rgba(79,110,247,0.7)' }} />
      </div>
      <div className="text-center">
        <p className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Canvas vazio
        </p>
        <p className="mt-1 max-w-[260px] text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Comece arrastando um{' '}
          <strong style={{ color: 'rgba(255,255,255,0.45)' }}>Gatilho</strong> da barra acima
          para o canvas.
        </p>
      </div>
      {/* Arrow pointing up toward the toolbar */}
      <div
        className="flex flex-col items-center gap-1"
        style={{ color: 'rgba(255,255,255,0.15)' }}
      >
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" className="-scale-y-100">
          <path
            d="M12 2 L12 28 M4 20 L12 28 L20 20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[11px] font-bold uppercase tracking-wide">toolbar acima</span>
      </div>
    </div>
  );
}

// ── Inner component (inside ReactFlowProvider) ────────────────────────────

type EditorState = ReturnType<typeof useFlowEditor>;

interface DropZoneProps {
  editor: EditorState;
  onDropBlocked: (message: string) => void;
}

function FlowDropZone({ editor, onDropBlocked }: DropZoneProps) {
  const { screenToFlowPosition, setViewport, fitView, getViewport } = useReactFlow();
  const { isDark } = useTheme();

  editor.getCurrentViewportRef.current = () => getViewport() as FlowViewport;

  useEffect(() => {
    if (!editor.hasLoadedData) return;
    if (editor.initialViewport) {
      setViewport(editor.initialViewport);
    } else {
      void fitView({ padding: 0.15 });
    }
  }, [editor.hasLoadedData]); // setViewport/fitView refs are stable

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow') as FlowNodeType;
      if (!type) return;

      // Vários gatilhos = várias entradas no fluxo. Só o agendado é um por fluxo (o backend
      // guarda uma única próxima execução).
      if (type === 'trigger_scheduled' && editor.nodes.some((n) => n.type === 'trigger_scheduled')) {
        onDropBlocked('Já existe um gatilho agendado neste fluxo.');
        return;
      }

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      editor.addNodeAtPosition(type, position);
    },
    [screenToFlowPosition, editor, onDropBlocked],
  );

  return (
    <div
      className={`absolute inset-0 ${isDark ? 'flow-editor-dark' : 'flow-editor-light'}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {editor.nodes.length === 0 && <CanvasEmptyState />}
      <ReactFlow
        nodes={editor.nodes}
        edges={editor.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={editor.onNodesChange}
        onEdgesChange={editor.onEdgesChange}
        onConnect={editor.onConnect}
        onNodeDoubleClick={(_, node) => editor.setSelectedNodeId(node.id)}
        onNodeClick={(_, node) => editor.setSelectedNodeId(node.id)}
        onPaneClick={() => editor.setSelectedNodeId(null)}
        fitView
        colorMode={isDark ? 'dark' : 'light'}
        className="h-full w-full"
        style={{ background: 'transparent' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1.5}
          color={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'}
        />
        <Controls />
        <MiniMap
          nodeColor={isDark ? 'rgba(79,110,247,0.6)' : 'rgba(26,60,143,0.5)'}
          maskColor={isDark ? 'rgba(4,6,15,0.85)' : 'rgba(248,249,252,0.85)'}
          zoomable
          pannable
          style={isDark ? {
            background: 'rgba(13,21,53,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
          } : {
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        />
      </ReactFlow>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────

interface Props {
  flowId: string | null;
  /** Editor dentro de um processo: fluxo novo nasce ligado a ele e os gatilhos já vêm com ele. */
  initialFormId?: string | null;
  onCreated?: (flow: Flow) => void;
  onDeleted?: () => void;
  /** Mostra "← Automações" na barra (editor embutido no mapa de processos). */
  onBack?: () => void;
}

function isEditingText(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function getSaveErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }

  return 'Erro ao salvar o fluxo. Tente novamente.';
}

function formStatusLabel(status: FormDetail['status']): string {
  if (status === 'published') return 'Publicado';
  if (status === 'paused') return 'Pausado';
  if (status === 'archived') return 'Arquivado';
  if (status === 'expired') return 'Expirado';
  return 'Rascunho';
}

function FormPreviewModal({
  formId,
  onClose,
  onEdit,
}: {
  formId: string;
  onClose: () => void;
  onEdit: (formId: string) => void;
}) {
  const {
    data: form,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.forms.byId(formId),
    queryFn: () => fetchFormById(formId),
  });
  const version = form?.versions[0] ?? null;
  const fieldCount =
    version?.sections.reduce((total, section) => total + section.fields.length, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#071a38]/45 px-4 py-6">
      <section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[10px] bg-bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">
              Formulário do gatilho
            </p>
            <h2 className="mt-1 truncate text-xl font-extrabold text-tx-primary">
              {form?.name ?? 'Carregando...'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-bg-hover"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? <p className="text-sm text-tx-secondary">Carregando formulário...</p> : null}
          {isError ? (
            <p className="text-sm font-bold text-[#ef4444]">
              Não foi possível carregar o formulário.
            </p>
          ) : null}

          {form && version ? (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-4 md:grid-cols-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-bold text-tx-primary">
                    {formStatusLabel(form.status)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
                    Seções
                  </p>
                  <p className="mt-1 text-sm font-bold text-tx-primary">{version.sections.length}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
                    Campos
                  </p>
                  <p className="mt-1 text-sm font-bold text-tx-primary">{fieldCount}</p>
                </div>
              </div>

              {form.description ? (
                <p className="rounded-[10px] border border-border-default p-4 text-sm text-tx-secondary">
                  {form.description}
                </p>
              ) : null}

              <div className="grid gap-3">
                {version.sections.map((section) => (
                  <article
                    key={section.id}
                    className="rounded-[10px] border border-border-default bg-bg-surface p-4"
                  >
                    <h3 className="text-sm font-bold text-tx-primary">{section.title}</h3>
                    {section.description ? (
                      <p className="mt-1 text-xs text-tx-secondary">{section.description}</p>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      {section.fields.length === 0 ? (
                        <p className="text-xs text-tx-muted">Sem campos nesta seção.</p>
                      ) : (
                        section.fields.map((field) => (
                          <div
                            key={field.id}
                            className="flex items-center justify-between gap-3 rounded-[8px] bg-bg-s2 px-3 py-2"
                          >
                            <span className="truncate text-sm font-semibold text-tx-primary">
                              {field.label}
                            </span>
                            <span className="shrink-0 text-[11px] font-bold text-tx-secondary">
                              {field.fieldType}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border-default px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={!form}
            onClick={() => {
              if (form) onEdit(form.id);
            }}
            className="h-10 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Editar formulário
          </button>
        </footer>
      </section>
    </div>
  );
}

export function FlowCanvas({ flowId, initialFormId = null, onCreated, onDeleted, onBack }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const editor = useFlowEditor(flowId, initialFormId);
  const [previewFormId, setPreviewFormId] = useState<string | null>(null);
  const availableForms: never[] = [];
  const isLoadingForms = false;

  // Legacy migration warning: flow has a DB-level formId but trigger node has no data.formId
  const hasLegacyFormId = useMemo(() => {
    if (!editor.flowServerData?.formId) return false;
    const triggerNode = editor.nodes.find((n) => n.type === 'trigger_form_submit');
    if (!triggerNode) return false;
    return !(triggerNode.data as { formId?: string | null }).formId;
  }, [editor.flowServerData, editor.nodes]);

  // Test modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Execution history selection
  const [selectedExecution, setSelectedExecution] = useState<FlowExecution | null>(null);
  const deleteMutation = useMutation({
    mutationFn: deleteFlow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows.all() });
      onDeleted?.();
    },
    onError: () => {
      showToast('Erro ao excluir o fluxo. Tente novamente.', 'error');
    },
  });

  // Nó em configuração (modal). Com uma execução aberta no histórico, o painel dela tem a vez.
  const panelNode = selectedExecution ? null : editor.selectedNode;
  const { setSelectedNodeId } = editor;
  const closeNodeConfig = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);
  // Formulário que o nó aberto enxerga: com várias entradas, o do gatilho (ou do "Criar
  // solicitação") que chega nele — ver resolveNodeFormId.
  const panelNodeId = panelNode?.id ?? null;
  const panelFormId = useMemo(
    () => resolveNodeFormId(panelNodeId, editor.nodes, editor.edges),
    [panelNodeId, editor.nodes, editor.edges],
  );

  // Execution context for node colorization
  const executionStatusMap = useMemo(() => {
    if (!selectedExecution) return null;
    const map: Record<string, 'success' | 'failed' | 'skipped'> = {};
    for (const r of selectedExecution.nodeResults ?? []) {
      map[r.nodeId] = r.status;
    }
    return map;
  }, [selectedExecution]);

  const ctxValue = useMemo(
    () => ({
      executionStatus: executionStatusMap,
      problematicNodeIds: editor.problematicNodeIds,
      availableForms,
      isLoadingForms,
      onOpenLinkedForm: setPreviewFormId,
    }),
    [executionStatusMap, editor.problematicNodeIds, availableForms, isLoadingForms],
  );

  // ── Toast helpers ───────────────────────────────────────────────────

  function showToast(text: string, type: 'error' | 'success', durationMs = 5000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, type });
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // ── Save with validation ────────────────────────────────────────────

  async function handleSave() {
    if (editor.validationErrors.length > 0) {
      showToast(editor.validationErrors[0], 'error');
      return;
    }
    try {
      const savedFlow = await editor.save();
      if (!flowId && savedFlow) {
        onCreated?.(savedFlow);
      }
      showToast('Fluxo salvo com sucesso.', 'success', 3000);
    } catch (error) {
      showToast(getSaveErrorMessage(error), 'error');
    }
  }

  // ── Test run ────────────────────────────────────────────────────────

  function handleRunTest() {
    if (!flowId) return;
    setIsTestModalOpen(true);
  }

  function handleDeleteFlow() {
    if (!flowId || deleteMutation.isPending) return;
    if (window.confirm(`Excluir fluxo "${editor.flowName}"?`)) {
      deleteMutation.mutate(flowId);
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ctrl+S / Cmd+S — save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
        return;
      }
      // Ctrl+Z / Cmd+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        editor.undo();
        return;
      }
      // Don't intercept when typing in inputs
      if (isEditingText(e)) return;
      // Com o modal de configuração aberto o canvas fica coberto: Esc é do modal e Delete/Backspace
      // não pode apagar um nó que não está à vista (para isso há o botão "Excluir nó").
      if (document.querySelector(`[${NODE_CONFIG_DIALOG_ATTR}]`)) return;
      // Escape — close panel / deselect
      if (e.key === 'Escape') {
        editor.setSelectedNodeId(null);
        setSelectedExecution(null);
        return;
      }
      // Delete / Backspace — delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedNodeId) {
        const nodeId = editor.selectedNodeId;
        const hasEdges = editor.edges.some((e) => e.source === nodeId || e.target === nodeId);
        if (hasEdges) {
          if (window.confirm('Este nó tem conexões. Deseja removê-lo e suas conexões?')) {
            editor.deleteNode(nodeId);
          }
        } else {
          editor.deleteNode(nodeId);
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor.selectedNodeId, editor.edges, editor.validationErrors, editor.undo]);

  return (
    <FlowCanvasContext.Provider value={ctxValue}>
      <div className="flex h-full flex-col">
        {/* Responsive warning (hidden on ≥1024px) */}
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 lg:hidden">
          <MonitorSmartphone className="h-4 w-4 shrink-0" />
          Para melhor experiência, use o editor em uma tela maior (1024px+).
        </div>

        {/* Legacy formId migration warning */}
        {hasLegacyFormId && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Este fluxo usa um formulário vinculado legado. Abra o nó gatilho e selecione o formulário para atualizar a configuração.
          </div>
        )}

        <FlowToolbar
          onBack={onBack}
          flowName={editor.flowName}
          isActive={editor.isActive}
          isSaving={editor.isSaving}
          isDirty={editor.isDirty}
          lastSavedAt={editor.lastSavedAt}
          validationErrors={editor.validationErrors}
          canRunTest={!!flowId}
          canDelete={!!flowId}
          isRunningTest={false}
          isDeleting={deleteMutation.isPending}
          testResult={null}
          onNameChange={editor.setFlowName}
          onToggleActive={editor.setIsActive}
          onSave={() => void handleSave()}
          onRunTest={handleRunTest}
          onDelete={handleDeleteFlow}
        />

        {/* Main row: [NodeLibrary] [canvas + side panels] */}
        <div className="flex flex-1 overflow-hidden">
          <NodeLibrary />

          {/* Canvas area — adapts to theme */}
          <div
            className="relative flex flex-1 overflow-hidden"
            style={isDark ? {
              background: `
                radial-gradient(ellipse 80% 60% at 50% 40%, rgba(26,60,143,0.12) 0%, transparent 70%),
                #04060F
              `,
            } : {
              background: `
                radial-gradient(ellipse 80% 60% at 50% 40%, rgba(26,60,143,0.06) 0%, transparent 70%),
                #f8f9fc
              `,
            }}
          >
            <ReactFlowProvider>
              <FlowDropZone editor={editor} onDropBlocked={(msg) => showToast(msg, 'error')} />
            </ReactFlowProvider>

            {/* Node configuration — modal centralizado (como o das fases do formulário) */}
            {panelNode && (
              <NodeConfigModal
                variant={isCompactNodeType(panelNode.type) ? 'compact' : 'full'}
                onClose={closeNodeConfig}
              >
                <NodeConfigPanel
                  key={panelNode.id}
                  node={panelNode}
                  nodes={editor.nodes}
                  edges={editor.edges}
                  formId={panelFormId}
                  currentFlowId={flowId}
                  saveState={{ isSaving: editor.isSaving, isDirty: editor.isDirty }}
                  onClose={closeNodeConfig}
                  onUpdate={editor.updateNodeData}
                  onDelete={editor.deleteNode}
                />
              </NodeConfigModal>
            )}

            {/* Execution detail panel */}
            <aside
              className={[
                'absolute bottom-0 right-0 top-0 z-20',
                'flex w-[360px] flex-col',
                'border-l border-border-strong bg-bg-surface shadow-2xl',
                'transition-transform duration-200 ease-in-out',
                selectedExecution ? 'translate-x-0' : 'translate-x-full',
              ].join(' ')}
              aria-hidden={!selectedExecution}
            >
              {selectedExecution && (
                <ExecutionDetailPanel
                  execution={selectedExecution}
                  nodes={editor.nodes}
                  onClose={() => setSelectedExecution(null)}
                />
              )}
            </aside>

            {/* Toast */}
            {toast && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4">
                <Toast msg={toast} onDismiss={() => setToast(null)} />
              </div>
            )}
          </div>
        </div>

        {/* Execution history panel at the bottom */}
        {flowId && (
          <FlowHistoryPanel
            flowId={flowId}
            selectedExecutionId={selectedExecution?.id ?? null}
            onSelectExecution={(exec) => {
              setSelectedExecution(exec);
              editor.setSelectedNodeId(null);
            }}
          />
        )}

        {previewFormId ? (
          <FormPreviewModal
            formId={previewFormId}
            onClose={() => setPreviewFormId(null)}
            onEdit={(formId) => navigate(`/builder?formId=${formId}`)}
          />
        ) : null}

        {isTestModalOpen && flowId ? (
          <FlowTestModal
            flowId={flowId}
            nodes={editor.nodes}
            onClose={() => setIsTestModalOpen(false)}
          />
        ) : null}
      </div>
    </FlowCanvasContext.Provider>
  );
}
