import { useQueryClient } from '@tanstack/react-query';
import { Hand, Loader2, Workflow, X, Zap } from 'lucide-react';
import { lazy, Suspense, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../../../lib/cn';
import { queryKeys } from '../../../../lib/query-keys';
import {
  AutomationsManager,
  type AutomationPhaseFilter,
} from '../../../experience-mode/components/simple-automations-panel';
import { NodeLibrary } from '../../../flows/components/NodeLibrary';

// O editor de fluxo é grande: só baixa quando alguém abre uma automação com nós.
const FlowCanvas = lazy(() =>
  import('../../../flows/components/FlowCanvas').then((module) => ({ default: module.FlowCanvas })),
);

export type SidebarTab = 'nodes' | 'list';
/** null = lateral nas abas; { id: null } = fluxo novo; { id } = existente. */
export type SidebarEditing = { id: string | null; key: string } | null;

const LIST_WIDTH = 380;
const EDITOR_WIDTH_KEY = 'tf.processMap.flowEditorWidth';
const MIN_EDITOR_WIDTH = 560;
/** O mapa de fases nunca fica mais estreito que isto. */
const MIN_MAP_WIDTH = 320;

function clampEditorWidth(width: number) {
  const max = Math.max(MIN_EDITOR_WIDTH, window.innerWidth - MIN_MAP_WIDTH);
  return Math.round(Math.min(Math.max(width, MIN_EDITOR_WIDTH), max));
}

function readEditorWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(EDITOR_WIDTH_KEY));
    if (stored > 0) return clampEditorWidth(stored);
  } catch {
    // sem storage: usa o padrão
  }
  return clampEditorWidth(window.innerWidth * 0.6);
}

function writeEditorWidth(width: number) {
  try {
    window.localStorage.setItem(EDITOR_WIDTH_KEY, String(width));
  } catch {
    // ignora: vale só nesta sessão
  }
}

/**
 * Lateral direita do mapa de processos.
 * - Aba "Nós": a biblioteca de nós do editor de fluxos — arrastar um nó e soltar numa fase do mapa
 *   cria a automação ligada àquela fase e abre o editor com o nó para configurar.
 * - Aba "Automações": a lista (quando/então), com "Editar nós" e "Nova com nós".
 * - Editando: o editor de fluxo completo, preso ao processo; a lateral alarga e a borda ajusta.
 */
export function ProcessAutomationsSidebar({
  formId,
  open,
  onOpenChange,
  tab,
  onTabChange,
  editing,
  onEditingChange,
  phaseFilter,
  onPhaseFilterChange,
  highlightFlowId,
  flowCount,
}: {
  formId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  editing: SidebarEditing;
  onEditingChange: (editing: SidebarEditing) => void;
  phaseFilter: AutomationPhaseFilter;
  onPhaseFilterChange: (filter: AutomationPhaseFilter) => void;
  highlightFlowId: string | null;
  flowCount: number;
}) {
  const queryClient = useQueryClient();
  const [editorWidth, setEditorWidth] = useState(readEditorWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const backToList = useCallback(() => {
    onEditingChange(null);
    onTabChange('list');
    void queryClient.invalidateQueries({ queryKey: queryKeys.flows.byForm(formId) });
  }, [formId, onEditingChange, onTabChange, queryClient]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: editorWidth };
  }

  function resize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    // A borda fica à esquerda: arrastar para a esquerda alarga.
    setEditorWidth(clampEditorWidth(dragRef.current.startWidth + dragRef.current.startX - event.clientX));
  }

  function endResize() {
    if (!dragRef.current) return;
    dragRef.current = null;
    writeEditorWidth(editorWidth);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Abrir nós e automações"
        title="Nós e automações do processo"
        className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-border-strong bg-bg-surface pt-4 text-tx-secondary hover:bg-bg-hover hover:text-tx-primary max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30"
      >
        <Zap className="h-5 w-5 text-[#3B82F6]" />
        {flowCount ? (
          <span className="rounded-full bg-[#3B82F6]/15 px-1.5 text-[11px] font-bold text-[#3B82F6]">
            {flowCount}
          </span>
        ) : null}
        <span className="text-xs font-bold [writing-mode:vertical-rl]">Nós e automações</span>
      </button>
    );
  }

  const tabClass = (active: boolean) =>
    cn(
      'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors',
      active ? 'bg-bg-surface text-tx-primary shadow-sm' : 'text-tx-secondary hover:text-tx-primary',
    );

  return (
    <aside
      aria-label="Automações do processo"
      className="relative flex max-w-[100vw] shrink-0 flex-col border-l border-border-strong bg-bg-surface max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:!w-full max-md:shadow-2xl"
      style={{ width: editing ? editorWidth : LIST_WIDTH }}
    >
      {editing ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Ajustar a largura do editor"
            title="Arraste para ajustar a largura"
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize hover:bg-[#3B82F6]/30"
          />
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-tx-secondary">
                <Loader2 className="h-4 w-4 animate-spin" /> Abrindo o editor de fluxo…
              </div>
            }
          >
            <div className="min-h-0 flex-1">
              <FlowCanvas
                key={editing.key}
                flowId={editing.id}
                initialFormId={formId}
                onCreated={(flow) => onEditingChange({ id: flow.id, key: flow.id })}
                onDeleted={backToList}
                onBack={backToList}
              />
            </div>
          </Suspense>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-border-default px-3 py-2.5">
            <div role="tablist" aria-label="Lateral do mapa" className="flex flex-1 gap-1 rounded-xl bg-bg-s3 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'nodes'}
                onClick={() => onTabChange('nodes')}
                className={tabClass(tab === 'nodes')}
              >
                <Workflow className="h-4 w-4" />
                Nós
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'list'}
                onClick={() => onTabChange('list')}
                className={tabClass(tab === 'list')}
              >
                <Zap className="h-4 w-4" />
                Automações
                {flowCount ? (
                  <span className="rounded-full bg-[#3B82F6]/15 px-1.5 text-[11px] text-[#3B82F6]">{flowCount}</span>
                ) : null}
              </button>
            </div>
            <button
              type="button"
              aria-label="Recolher"
              onClick={() => onOpenChange(false)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-tx-secondary hover:bg-bg-hover"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {tab === 'nodes' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-xl bg-[#3B82F6]/10 px-3 py-2.5 text-xs font-semibold text-tx-primary">
                <Hand className="mt-0.5 h-4 w-4 shrink-0 text-[#3B82F6]" />
                <span>
                  Arraste um nó para o mapa e solte onde quiser. Para ligar, puxe a linha do{' '}
                  <strong>ponto azul embaixo da fase</strong> até o nó (ou do nó até outro nó). Clique no
                  nó para configurar.
                </span>
              </p>
              <div className="mt-2 min-h-0 flex-1">
                <NodeLibrary fill />
              </div>
            </div>
          ) : (
            <AutomationsManager
              formId={formId}
              narrow
              editorLinks
              hideHeader
              phaseFilter={phaseFilter}
              onPhaseFilterChange={onPhaseFilterChange}
              highlightFlowId={highlightFlowId}
              onOpenFlow={(flowId) => onEditingChange({ id: flowId, key: flowId })}
              onCreateFlow={() => onEditingChange({ id: null, key: `novo-${Date.now()}` })}
            />
          )}
        </>
      )}
    </aside>
  );
}
