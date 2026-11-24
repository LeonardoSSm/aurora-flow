import { ArrowLeft, ChevronRight, Info, Plus } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { MarkerType, type Connection, type Edge, type Node, type NodeTypes } from '@xyflow/react';
import { useAuth } from '../../../../app/auth-context';
import { useToast } from '../../../../components/ui';
import type { AutomationPhaseFilter } from '../../../experience-mode/components/simple-automations-panel';
import { NodeConfigModal } from '../../../flows/components/NodeConfigModal';
import { FlowCanvasContext } from '../../../flows/context/FlowCanvasContext';
import { getNodeIssues } from '../../../flows/lib/node-issues';
import { isCompactNodeType } from '../../../flows/panels/node-config/node-meta';
import type { FlowNodeData, FlowNodeType } from '../../../flows/types/flow.types';
import { newMapNodeId, useProcessMapFlows } from '../../hooks/use-process-map-flows';
import { processAutomationMap } from '../../lib/process-automation-map';
import {
  connectNodes,
  isTrigger,
  layoutMapNodes,
  linkNodeToPhase,
  linkPhaseToNode,
  mapNodeId,
  mapPositionOf,
  parseMapNodeId,
  phaseLinks,
  removeEdge,
  removeNode,
  setNodeMapPosition,
  unlinkPhase,
} from '../../lib/process-map-flows';
import { mapFlowNodeTypes } from './MapFlowNode';
import { ProcessAutomationsSidebar, type SidebarEditing, type SidebarTab } from './ProcessAutomationsSidebar';

// A configuração de nó é grande: só baixa quando alguém abre um nó no mapa.
const NodeConfigPanel = lazy(() =>
  import('../../../flows/panels/NodeConfigPanel').then((module) => ({ default: module.NodeConfigPanel })),
);
import { AutomationsView } from '../../../automations/views/automations-view';
import { KanbanCardValueSetting } from '../../../kanban-phases/components/kanban-card-value-setting';
import { PhaseSettingsModal, type PhaseSettingsTab } from '../../../kanban-phases/components/phase-settings-modal';
import type { usePhasesDraft } from '../../../kanban-phases/hooks/use-phases-draft';
import { answerFields, EMPTY_VISIBILITY } from '../../../kanban-phases/lib/phase-draft';
import {
  appendPhaseFormSection,
  groupPhaseFormSections,
  removePhaseFormSection,
} from '../../../kanban-phases/lib/phase-form-sections';
import { phaseSectionsForCanvas, removeSectionFromFlow } from '../../../kanban-phases/lib/phase-section-flow';
import { NO_PEOPLE, peopleSummary } from '../../../kanban-phases/lib/phase-people';
import { describePhaseSla } from '../../../kanban-phases/lib/phase-sla';
import type { DraftKanbanPhase } from '../../../kanban-phases/types';
import type { useFormBuilder } from '../../hooks/use-form-builder';
import { SectionEditModal } from '../flow/SectionEditModal';
import { SectionFlowCanvas } from '../flow/SectionFlowCanvas';
import { SectionFlowTestModal } from '../flow/SectionFlowTestModal';
import { PhaseNode, PHASE_NODE_WIDTH, type PhaseNodeData } from './PhaseNode';
import { PhaseSectionModal } from './PhaseSectionModal';
import { ProcessChainCanvas, floatingCard, type ChainItem } from './ProcessChainCanvas';
import { ProcessGoogleSheetsSettings } from './ProcessGoogleSheetsSettings';

type ConditionField = Parameters<typeof SectionEditModal>[0]['availableFields'][number];
type AutomationField = Parameters<typeof AutomationsView>[0]['formFields'][number];

const phaseNodeTypes: NodeTypes = { phase: PhaseNode };
/** Mapa do processo: as fases mais os nós de automação soltos. */
const processMapNodeTypes: NodeTypes = { ...mapFlowNodeTypes, phase: PhaseNode };

/** Onde começam os nós de automação, abaixo da fileira de fases. */
const MAP_FLOWS_TOP = 320;
/** Linhas de automação: azul médio, legível no tema claro e no escuro. */
const AUTOMATION_COLOR = '#3B82F6';
/** Linha da entrada externa ("Criar solicitação" → fase): a cor do "Webhook recebido". */
const EXTERNAL_ENTRY_COLOR = '#16A34A';

const AUTOMATIONS_OPEN_KEY = 'tf.processMap.automationsOpen';

// localStorage pode lançar (modo privado, storage bloqueado): aí a lateral só não lembra a escolha.
function readStoredFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writeStoredFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignora: vale só nesta sessão
  }
}

function ignoreSectionPosition() {}

/** Board padrão (o mesmo que o backend cria): mostrado, travado, enquanto o processo não foi salvo. */
const PLACEHOLDER_PHASES: DraftKanbanPhase[] = (
  [
    ['novo', 'Novo', 'blue', false],
    ['pendente', 'Pendente', 'amber', false],
    ['concluido', 'Concluído', 'green', true],
  ] as const
).map(([key, label, color, isTerminal]) => ({
  id: `placeholder-${key}`,
  serverId: null,
  key,
  label,
  color,
  description: '',
  isTerminal,
  actors: { ...NO_PEOPLE },
  requiresApproval: false,
  approvers: { ...NO_PEOPLE },
  approvalMode: 'any',
  approvalRequest: 'manual',
  approvalOnApproved: 'stay',
  approvalOnRejected: 'stay',
  requireFieldsToExit: false,
  requireAssigneeToExit: false,
  blockMoveBack: false,
  restrictVisibility: false,
  visibleTo: { ...EMPTY_VISIBILITY },
  slaHours: null,
  slaBusinessHours: false,
  slaWarningPercent: null,
  fields: [],
  sectionFlow: {},
}));

type Level = { kind: 'process' } | { kind: 'form'; phaseId: string };

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Aba "Processo" do Criador: as fases ficam num mapa, cada uma com a sua configuração (pessoas,
 * aprovação, prazo, formulário, integrações e automações). "Expandir formulário" abre, no mesmo
 * mapa, as seções do formulário da fase — na fase de início, o formulário de abertura completo
 * (com ramificações); nas outras, os campos de fase agrupados em seções.
 */
export function ProcessMapView({
  formId,
  builder,
  phases,
  automationCountBySectionId,
  conditionFields,
  automationFields,
  erpTableEnabled,
}: {
  formId: string | null;
  builder: ReturnType<typeof useFormBuilder>;
  phases: ReturnType<typeof usePhasesDraft>;
  automationCountBySectionId: Record<string, number>;
  conditionFields: ConditionField[];
  automationFields: AutomationField[];
  erpTableEnabled: boolean;
}) {
  const { draft } = builder;
  const [level, setLevel] = useState<Level>({ kind: 'process' });
  const [configuring, setConfiguring] = useState<{ phaseId: string; tab: PhaseSettingsTab } | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedPhaseSectionId, setSelectedPhaseSectionId] = useState<string | null>(null);
  const [testFlowOpen, setTestFlowOpen] = useState(false);
  /** Quantas vezes o mapa de seções foi organizado — chave do canvas do formulário de abertura. */
  const [organizeCount, setOrganizeCount] = useState(0);

  const locked = !formId || !phases.initialized;
  const phaseList = locked ? PLACEHOLDER_PHASES : phases.draft;

  // ── Automações (fluxos do processo) no mapa ───────────────────────────────
  const { can } = useAuth();
  const { showToast } = useToast();
  // No processo aberto: ver e gerenciar fluxos vêm do vínculo com ele.
  const canViewFlows = can('flows.view', formId);
  const canManageFlows = can('flows.manage', formId);
  const mapFlows = useProcessMapFlows(formId, canViewFlows);
  /** Nó de automação com a configuração aberta. */
  const [configTarget, setConfigTarget] = useState<{ groupKey: string; nodeId: string } | null>(null);
  // Lateral direita com as automações: aberta por padrão, lembra se a pessoa recolheu.
  const [automationsOpen, setAutomationsOpenState] = useState(() => readStoredFlag(AUTOMATIONS_OPEN_KEY, true));
  const setAutomationsOpen = useCallback((open: boolean) => {
    setAutomationsOpenState(open);
    writeStoredFlag(AUTOMATIONS_OPEN_KEY, open);
  }, []);
  const [automationFilter, setAutomationFilter] = useState<AutomationPhaseFilter>(null);
  const [highlightFlowId, setHighlightFlowId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('nodes');
  const [sidebarEditing, setSidebarEditing] = useState<SidebarEditing>(null);
  /** Fase (id do rascunho) sob o cursor enquanto um nó de fluxo é arrastado. */
  const [dropPhaseId, setDropPhaseId] = useState<string | null>(null);
  const openAutomations = useCallback(
    (filter: AutomationPhaseFilter, flowId: string | null = null) => {
      setAutomationFilter(filter);
      setHighlightFlowId(flowId);
      setSidebarTab('list');
      setSidebarEditing(null);
      setAutomationsOpen(true);
    },
    [setAutomationsOpen],
  );
  // Os fluxos guardam o id salvo da fase; o mapa desenha pelo id do rascunho.
  const automationMap = useMemo(() => {
    const saved = phaseList.filter((phase) => phase.serverId);
    const draftIdByServerId = new Map(saved.map((phase) => [phase.serverId as string, phase.id]));
    const { countByPhaseId } = processAutomationMap(
      mapFlows.flows,
      saved.map((phase) => ({ id: phase.serverId as string, requiresApproval: phase.requiresApproval })),
    );

    // Nós das automações soltos no mapa, abaixo das fases.
    const phaseX = new Map(
      phaseList.flatMap((phase, index) =>
        phase.serverId ? [[phase.serverId, index * (PHASE_NODE_WIDTH + 90)] as const] : [],
      ),
    );
    const placedY = mapFlows.groups.flatMap((group) =>
      group.nodes.map((node) => mapPositionOf(node)?.y).filter((y): y is number => y !== undefined),
    );
    const topY = Math.max(MAP_FLOWS_TOP, ...placedY.map((y) => y + 220));
    const layout = layoutMapNodes(mapFlows.groups, phaseX, topY);
    const problematic = new Set<string>();
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    for (const group of mapFlows.groups) {
      const groupBroken = !group.nodes.some((node) => isTrigger(node.type));
      for (const node of group.nodes) {
        const id = mapNodeId(group.key, node.id);
        if (groupBroken || getNodeIssues(node.type, node.data as FlowNodeData).length > 0) problematic.add(id);
        nodes.push({
          id,
          type: node.type,
          position: mapPositionOf(node) ?? layout.get(id) ?? { x: 0, y: topY },
          data: { ...(node.data as Record<string, unknown>), __mapDraft: !group.flowId },
        });
      }
      const color = group.isActive ? AUTOMATION_COLOR : '#94a3b8';
      for (const edge of group.edges) {
        edges.push({
          id: `flow:${group.key}::${edge.id}`,
          source: mapNodeId(group.key, edge.source),
          sourceHandle: edge.sourceHandle ?? null,
          target: mapNodeId(group.key, edge.target),
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        });
      }
    }
    for (const link of phaseLinks(mapFlows.groups, new Set(draftIdByServerId.keys()))) {
      const phaseNodeId = draftIdByServerId.get(link.phaseId) as string;
      const node = mapNodeId(link.groupKey, link.nodeId);
      const style = { stroke: AUTOMATION_COLOR, strokeWidth: 2, strokeDasharray: '6 5' };
      edges.push(
        link.kind === 'entrada'
          ? { id: `link:${link.groupKey}::${link.nodeId}`, source: phaseNodeId, sourceHandle: 'auto-out', target: node, targetHandle: 'fase', style }
          : link.kind === 'externa'
            ? {
                // Entrada externa: cheia e verde, como a porta de entrada da fase.
                id: `link:${link.groupKey}::${link.nodeId}`,
                source: node,
                target: phaseNodeId,
                targetHandle: 'auto-in',
                label: 'Nova solicitação',
                labelStyle: { fill: EXTERNAL_ENTRY_COLOR, fontWeight: 700, fontSize: 11 },
                labelBgStyle: { fill: 'var(--bg-surface)' },
                style: { stroke: EXTERNAL_ENTRY_COLOR, strokeWidth: 2.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: EXTERNAL_ENTRY_COLOR, width: 16, height: 16 },
              }
            : {
                id: `link:${link.groupKey}::${link.nodeId}`,
                source: node,
                target: phaseNodeId,
                targetHandle: 'auto-in',
                style,
                markerEnd: { type: MarkerType.ArrowClosed, color: AUTOMATION_COLOR, width: 14, height: 14 },
              },
      );
    }
    return { countByPhaseId, nodes, edges, problematic, draftIdByServerId };
  }, [phaseList, mapFlows.flows, mapFlows.groups]);
  const openingFieldCount = draft.sections.reduce((total, section) => total + section.fields.length, 0);

  const expandForm = useCallback((phaseId: string) => {
    setConfiguring(null);
    setSelectedSectionId(null);
    setSelectedPhaseSectionId(null);
    setLevel({ kind: 'form', phaseId });
  }, []);

  const removeOpeningSection = useCallback(
    (sectionId: string) => {
      builder.removeSection(sectionId);
      setSelectedSectionId((current) => (current === sectionId ? null : current));
    },
    [builder],
  );

  const phaseItems = useMemo<ChainItem[]>(
    () =>
      phaseList.map((phase, index) => {
        const isFirst = index === 0;
        const sections = groupPhaseFormSections(phase.fields);
        const answers = answerFields(phase.fields).length;
        const data: PhaseNodeData = {
          index,
          label: phase.label,
          color: phase.color,
          description: phase.description,
          isFirst,
          isTerminal: phase.isTerminal,
          actorsLabel: `Atua: ${peopleSummary(phase.actors, phases.roleOptions, 'qualquer perfil')}${
            phase.requireAssigneeToExit ? ' · exige responsável' : ''
          }${phase.blockMoveBack ? ' · sem volta' : ''}`,
          approvalLabel: phase.requiresApproval
            ? `Aprovação: ${peopleSummary(phase.approvers, phases.roleOptions, 'ninguém')}${
                // A fase pede, move ou encerra sozinha: o mapa avisa que isso não está num fluxo.
                phase.approvalRequest !== 'manual' ||
                phase.approvalOnApproved !== 'stay' ||
                phase.approvalOnRejected !== 'stay'
                  ? ' · automática'
                  : ''
              }`
            : null,
          slaLabel:
            !phase.isTerminal && phase.slaHours
              ? `Prazo: ${describePhaseSla(phase.slaHours, phase.slaBusinessHours)}`
              : null,
          formLabel: isFirst
            ? 'Formulário de abertura'
            : phase.fields.length > 0
              ? 'Formulário da fase'
              : 'Sem formulário',
          formSubLabel: isFirst
            ? `${plural(draft.sections.length, 'seção', 'seções')} · ${plural(openingFieldCount, 'campo', 'campos')}${
                answers > 0 ? ` · +${plural(answers, 'campo', 'campos')} de quem atua` : ''
              }${answers > 0 && phase.requireFieldsToExit ? ' · só avança preenchida' : ''}`
            : phase.fields.length > 0
              ? `${plural(sections.length, 'seção', 'seções')} · ${plural(answers, 'campo', 'campos')}${
                  phase.requireFieldsToExit ? ' · só avança preenchida' : ''
                }`
              : null,
          hasForm: isFirst || phase.fields.length > 0,
          locked,
          selected: configuring?.phaseId === phase.id,
          onConfigure: () => setConfiguring({ phaseId: phase.id, tab: 'geral' }),
          onExpandForm: () => expandForm(phase.id),
          onRemove:
            !locked && phaseList.length > 1 ? () => phases.removePhase(phase.id) : undefined,
          automationCount: phase.serverId ? (automationMap.countByPhaseId[phase.serverId] ?? 0) : 0,
          onOpenAutomations: () =>
            openAutomations(phase.serverId ? { id: phase.serverId, label: phase.label || 'Fase sem nome' } : null),
          dropTarget: dropPhaseId === phase.id,
        };
        return { id: phase.id, type: 'phase', data };
      }),
    [
      phaseList,
      phases,
      draft.sections.length,
      openingFieldCount,
      locked,
      configuring,
      expandForm,
      automationMap,
      openAutomations,
      dropPhaseId,
    ],
  );

  // ── Nível "formulário da fase" ────────────────────────────────────────────

  const formPhaseIndex = level.kind === 'form' ? phaseList.findIndex((p) => p.id === level.phaseId) : -1;
  const formPhase = formPhaseIndex >= 0 ? phaseList[formPhaseIndex] : null;
  const isOpeningForm = formPhaseIndex === 0;

  // Seções da fase no mesmo canvas do formulário de abertura: setas do caminho e das ramificações.
  const phaseCanvasSections = useMemo(
    () => (formPhase && !isOpeningForm ? phaseSectionsForCanvas(formPhase) : []),
    [formPhase, isOpeningForm],
  );
  // A disposição sai do caminho (nada é guardado): mudou o caminho, o canvas redesenha nela.
  const phaseCanvasLayout = phaseCanvasSections
    .map((section) => `${section.id}:${section.flowPositionX},${section.flowPositionY}`)
    .join('|');

  function setPhaseFields(phase: DraftKanbanPhase, fields: DraftKanbanPhase['fields']) {
    phases.updatePhase(phase.id, { ...phase, fields });
  }

  function removePhaseSection(phase: DraftKanbanPhase, sectionId: string) {
    phases.updatePhase(phase.id, {
      ...phase,
      fields: removePhaseFormSection(phase.fields, sectionId),
      sectionFlow: removeSectionFromFlow(phase.sectionFlow, sectionId),
    });
    setSelectedPhaseSectionId((current) => (current === sectionId ? null : current));
  }

  function addPhaseSection(phase: DraftKanbanPhase) {
    const { fields, sectionId } = appendPhaseFormSection(
      phase.fields,
      `Seção ${groupPhaseFormSections(phase.fields).length + 1}`,
    );
    setPhaseFields(phase, fields);
    setSelectedPhaseSectionId(sectionId);
  }

  const configuringIndex = configuring ? phaseList.findIndex((p) => p.id === configuring.phaseId) : -1;
  const selectedOpeningSection = draft.sections.find((section) => section.id === selectedSectionId) ?? null;

  const showAutomations = canViewFlows && Boolean(formId) && (level.kind === 'process' || !formPhase);

  function savedPhase(phaseDraftId: string): { id: string; label: string } | null {
    const phase = phaseList.find((item) => item.id === phaseDraftId);
    if (!phase) return null;
    if (!phase.serverId) {
      showToast({ title: 'Salve as fases primeiro', description: 'Fase nova ainda não pode ser ligada a uma automação.', variant: 'warning' });
      return null;
    }
    return { id: phase.serverId, label: phase.label || 'Fase sem nome' };
  }

  /** Nó da biblioteca solto no mapa: fica onde caiu; em cima de uma fase, já sai ligado a ela. */
  function dropFlowNode(phaseDraftId: string | null, nodeType: string, position: { x: number; y: number }) {
    if (!canManageFlows) return;
    const onPhase = phaseDraftId ? phaseList.some((phase) => phase.id === phaseDraftId) : false;
    const phase = onPhase && phaseDraftId ? savedPhase(phaseDraftId) : null;
    if (onPhase && !phase) return;
    // Em cima de uma fase, o nó vai para baixo dela (não por cima do cartão).
    const at = phase ? { x: position.x - 40, y: MAP_FLOWS_TOP } : { x: position.x - 120, y: position.y - 40 };
    const created = mapFlows.addNode(nodeType as FlowNodeType, at, phase);
    if (created) setConfigTarget(created);
  }

  /** Linha puxada no mapa: fase → nó, nó → fase ou nó → nó. */
  function connectOnMap(connection: Connection) {
    if (!formId || !canManageFlows || !connection.source || !connection.target) return;
    const fromPhase = phaseList.some((phase) => phase.id === connection.source);
    const toPhase = phaseList.some((phase) => phase.id === connection.target);
    const fromNode = fromPhase ? null : parseMapNodeId(connection.source);
    const toNode = toPhase ? null : parseMapNodeId(connection.target);
    const groupOf = (key: string) => mapFlows.groups.find((group) => group.key === key);
    const fail = (message: string) => showToast({ title: 'Essa ligação não dá', description: message, variant: 'warning' });

    if (fromPhase && toNode) {
      const phase = savedPhase(connection.source);
      const group = groupOf(toNode.groupKey);
      if (!phase || !group) return;
      const result = linkPhaseToNode(group, toNode.nodeId, phase, formId, newMapNodeId());
      if ('error' in result) fail(result.error);
      else mapFlows.commit([result.group]);
    } else if (fromNode && toPhase) {
      const phase = savedPhase(connection.target);
      const group = groupOf(fromNode.groupKey);
      if (!phase || !group) return;
      const result = linkNodeToPhase(group, fromNode.nodeId, phase, { formId, newNodeId: newMapNodeId() });
      if ('error' in result) fail(result.error);
      else {
        mapFlows.commit([result.group]);
        // Entrada externa nova: abre o "Criar solicitação" para dizer como os dados viram a solicitação.
        if (result.createdNodeId) setConfigTarget({ groupKey: group.key, nodeId: result.createdNodeId });
      }
    } else if (fromNode && toNode) {
      const result = connectNodes(
        mapFlows.groups,
        { ...fromNode, handle: connection.sourceHandle },
        toNode,
      );
      if (!result.groups) {
        fail(result.error);
        return;
      }
      const keys = new Set(result.groups.map((group) => group.key));
      const changed = result.groups.filter((group) => !mapFlows.groups.includes(group));
      const removed = mapFlows.groups.filter((group) => !keys.has(group.key)).map((group) => group.key);
      mapFlows.commit(changed, removed);
    }
  }

  function clickMapEdge(edgeId: string) {
    if (!canManageFlows) return;
    if (edgeId.startsWith('link:')) {
      const target = parseMapNodeId(edgeId.slice('link:'.length));
      const group = target && mapFlows.groups.find((item) => item.key === target.groupKey);
      if (target && group && window.confirm('Desligar este nó da fase?')) {
        mapFlows.commit([unlinkPhase(group, target.nodeId)]);
      }
    } else if (edgeId.startsWith('flow:')) {
      const rest = edgeId.slice('flow:'.length);
      const at = rest.indexOf('::');
      const group = mapFlows.groups.find((item) => item.key === rest.slice(0, at));
      if (group && window.confirm('Apagar esta ligação entre os nós?')) {
        mapFlows.commit([removeEdge(group, rest.slice(at + 2))]);
      }
    }
  }

  function moveMapNode(id: string, position: { x: number; y: number }) {
    const target = parseMapNodeId(id);
    if (!target || !canManageFlows) return;
    // Nós sem posição guardada são arrumados automaticamente e mudariam de lugar quando este muda:
    // fixa todos onde estão na tela agora, junto com o que foi movido.
    const shown = new Map(automationMap.nodes.map((node) => [node.id, node.position]));
    const changed = mapFlows.groups.flatMap((group) => {
      let next = group;
      for (const node of group.nodes) {
        const mapId = mapNodeId(group.key, node.id);
        if (mapId === id) next = setNodeMapPosition(next, node.id, position);
        else if (!mapPositionOf(node) && shown.has(mapId)) {
          next = setNodeMapPosition(next, node.id, shown.get(mapId) as { x: number; y: number });
        }
      }
      return next === group ? [] : [next];
    });
    if (changed.length) mapFlows.commit(changed);
  }

  const configGroup = configTarget ? mapFlows.groups.find((group) => group.key === configTarget.groupKey) : undefined;
  const configNode = configGroup?.nodes.find((node) => node.id === configTarget?.nodeId);
  const canvasCtx = useMemo(
    () => ({
      executionStatus: null,
      problematicNodeIds: automationMap.problematic,
      availableForms: [],
      isLoadingForms: false,
      onOpenLinkedForm: () => {},
    }),
    [automationMap.problematic],
  );

  return (
    <div className="flex min-h-0 flex-1">
    <div className="relative min-h-0 min-w-0 flex-1">
      {level.kind === 'process' || !formPhase ? (
        <FlowCanvasContext.Provider value={canvasCtx}>
        <ProcessChainCanvas
          key="process"
          items={phaseItems}
          nodeTypes={processMapNodeTypes}
          nodeWidth={PHASE_NODE_WIDTH}
          onReorder={locked ? undefined : phases.movePhase}
          onItemClick={(phaseId) => {
            if (!locked) setConfiguring({ phaseId, tab: 'geral' });
          }}
          extraNodes={showAutomations ? automationMap.nodes : undefined}
          extraEdges={showAutomations ? automationMap.edges : undefined}
          onEdgeClick={clickMapEdge}
          onExtraNodeClick={(id) => setConfigTarget(parseMapNodeId(id))}
          onExtraNodeDragStop={moveMapNode}
          onConnect={showAutomations && canManageFlows ? connectOnMap : undefined}
          onExternalDragOver={showAutomations && canManageFlows ? setDropPhaseId : undefined}
          onExternalDrop={showAutomations && canManageFlows ? dropFlowNode : undefined}
        >
          <div className={`${floatingCard} left-4 top-4 flex gap-1.5 p-1.5`}>
            <button
              type="button"
              disabled={locked}
              onClick={() => setConfiguring({ phaseId: phases.addPhase(), tab: 'geral' })}
              className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-container disabled:opacity-50"
            >
              <Plus className="h-[15px] w-[15px]" />
              Adicionar fase
            </button>
          </div>
          {formId && !locked ? (
            <div className={`${floatingCard} left-4 top-[70px] flex max-w-[calc(100%-32px)] p-1.5`}>
              <KanbanCardValueSetting formId={formId} compact />
            </div>
          ) : null}
          <div
            className={`${floatingCard} right-4 top-4 hidden max-w-[340px] items-start gap-2 px-3.5 py-2.5 text-xs text-tx-secondary md:flex`}
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {locked
                ? 'Dê um nome ao processo e salve para configurar as fases. O formulário de abertura já pode ser montado.'
                : showAutomations
                  ? 'Clique numa fase para configurá-la. Arraste nós da direita para o mapa e ligue: puxe a linha do ponto azul embaixo da fase até o nó. Para receber pedidos de fora, puxe de um "Webhook recebido" até a fase.'
                  : 'Clique numa fase para configurá-la. Arraste para mudar a ordem. As solicitações entram na primeira fase.'}
            </span>
          </div>
          {phases.hasUnsavedChanges ? (
            <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 shadow-sm max-lg:top-20">
              Fases com alterações não salvas
            </div>
          ) : null}
          {showAutomations && mapFlows.pendingStatus.length > 0 ? (
            <ul
              aria-label="Automações não salvas"
              className={`${floatingCard} bottom-4 left-1/2 grid max-h-40 w-[min(520px,calc(100%-32px))] -translate-x-1/2 gap-1 overflow-y-auto p-2 text-xs`}
            >
              {mapFlows.pendingStatus.map((status) => (
                <li key={status.key} className="flex items-center gap-2 rounded-[8px] px-2 py-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${status.problem ? 'bg-amber-500' : 'bg-[#3B82F6]'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <strong className="text-tx-primary">{status.name}</strong>
                    <span className="text-tx-secondary">
                      {' · '}
                      {status.saving
                        ? 'salvando…'
                        : status.problem
                          ? `falta: ${status.problem}`
                          : 'vai salvar sozinha'}
                    </span>
                  </span>
                  {status.problem ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            status.isDraft
                              ? 'Apagar este rascunho do mapa?'
                              : 'Descartar as mudanças não salvas desta automação?',
                          )
                        ) {
                          mapFlows.discard(status.key);
                        }
                      }}
                      className="shrink-0 rounded-[6px] px-2 py-1 font-bold text-tx-secondary hover:bg-bg-hover hover:text-tx-primary"
                    >
                      {status.isDraft ? 'Apagar' : 'Descartar'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </ProcessChainCanvas>
        </FlowCanvasContext.Provider>
      ) : isOpeningForm ? (
        <>
          <SectionFlowCanvas
            // O canvas guarda as posições que já desenhou: remontar é o que aplica a disposição
            // nova (e reenquadra o mapa) depois do "Organizar".
            key={`opening-${organizeCount}`}
            sections={draft.sections}
            selectedSectionId={selectedSectionId}
            automationCountBySectionId={automationCountBySectionId}
            onAddSection={() => setSelectedSectionId(builder.addSection())}
            onSelectSection={setSelectedSectionId}
            onRemoveSection={draft.sections.length > 1 ? removeOpeningSection : undefined}
            onTestFlow={() => setTestFlowOpen(true)}
            onOrganize={() => {
              builder.organizeSectionFlow();
              setOrganizeCount((count) => count + 1);
            }}
            onSectionPositionChange={builder.setSectionFlowPosition}
          />
          <FormBreadcrumb
            phaseLabel={formPhase.label}
            formLabel="Formulário de abertura"
            onBack={() => setLevel({ kind: 'process' })}
          />
        </>
      ) : phaseCanvasSections.length > 0 ? (
        <>
          <SectionFlowCanvas
            key={`form-${formPhase.id}-${phaseCanvasLayout}`}
            sections={phaseCanvasSections}
            selectedSectionId={selectedPhaseSectionId}
            onAddSection={() => addPhaseSection(formPhase)}
            onSelectSection={setSelectedPhaseSectionId}
            onRemoveSection={(sectionId) => removePhaseSection(formPhase, sectionId)}
            // Posição das seções da fase não é guardada: o mapa abre sempre na disposição por níveis.
            onSectionPositionChange={ignoreSectionPosition}
            terminalLabel="Fim do formulário"
            orphanDeadline="antes de salvar"
          />
          <FormBreadcrumb
            phaseLabel={formPhase.label}
            formLabel="Formulário da fase"
            onBack={() => setLevel({ kind: 'process' })}
          />
        </>
      ) : (
        <ProcessChainCanvas
          key={`form-${formPhase.id}`}
          items={[]}
          nodeTypes={phaseNodeTypes}
          nodeWidth={PHASE_NODE_WIDTH}
        >
          <FormBreadcrumb
            phaseLabel={formPhase.label}
            formLabel="Formulário da fase"
            onBack={() => setLevel({ kind: 'process' })}
          />
          <div className="absolute inset-0 grid place-items-center">
            <div className="grid max-w-[340px] justify-items-center gap-3 rounded-[12px] border border-dashed border-border-strong bg-bg-surface px-6 py-8 text-center">
              <p className="text-sm font-bold text-tx-primary">Esta fase ainda não tem formulário</p>
              <p className="text-xs text-tx-secondary">
                O formulário da fase é preenchido no card por quem atua nela. Comece por uma seção.
              </p>
              <button
                type="button"
                onClick={() => addPhaseSection(formPhase)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                Criar primeira seção
              </button>
            </div>
          </div>
        </ProcessChainCanvas>
      )}

      {/* ── Modais ─────────────────────────────────────────────────────── */}

      {configuring && configuringIndex >= 0 && formId ? (
        <PhaseSettingsModal
          key={configuring.phaseId}
          formId={formId}
          phase={phaseList[configuringIndex]}
          position={configuringIndex + 1}
          total={phaseList.length}
          roleOptions={phases.roleOptions}
          initialTab={configuring.tab}
          formulaFields={phases.formulaFieldsFor(configuring.phaseId)}
          onApply={(next) => phases.updatePhase(next.id, next)}
          onClose={() => setConfiguring(null)}
          onExpandForm={() => expandForm(configuring.phaseId)}
          applyHint="Grava no “Salvar” do processo, junto com o resto."
          formSlot={
            configuringIndex === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-tx-primary">Formulário de abertura</p>
                  <p className="text-xs text-tx-secondary">
                    Preenchido por quem abre a solicitação ·{' '}
                    {plural(draft.sections.length, 'seção', 'seções')} ·{' '}
                    {plural(openingFieldCount, 'campo', 'campos')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => expandForm(configuring.phaseId)}
                  className="h-8 shrink-0 rounded-[8px] bg-primary px-3 text-xs font-bold text-white"
                >
                  Expandir no mapa
                </button>
              </div>
            ) : undefined
          }
          integrationsSlot={
            configuringIndex === 0 ? (
              <div className="grid gap-3">
                <ProcessGoogleSheetsSettings
                  formId={formId}
                  connectionStatus={builder.googleConnectionStatus}
                  sheetsStatus={builder.googleSheetsStatus}
                  enabled={draft.googleSheetsEnabled}
                  autoCreateOnSave={draft.googleSheetsAutoCreateOnSave}
                  loading={builder.loadingIntegration}
                  action={builder.integrationAction}
                  onToggleEnabled={(checked) => builder.setDraftField('googleSheetsEnabled', checked)}
                  onToggleAutoCreate={(checked) => builder.setDraftField('googleSheetsAutoCreateOnSave', checked)}
                  onConnect={builder.connectGoogleAccount}
                  onDisconnect={builder.disconnectGoogleAccount}
                  onCreateSpreadsheet={builder.createSpreadsheetManually}
                  onOpenSpreadsheet={builder.openSpreadsheet}
                  onReenqueue={builder.reenqueueSync}
                  onReprocess={builder.reprocessSync}
                />
                <details className="rounded-[10px] border border-border-default p-3">
                  <summary className="cursor-pointer text-sm font-bold text-tx-primary">
                    Regras de automação da abertura
                  </summary>
                  <p className="mt-1 text-xs text-tx-secondary">
                    Disparam quando a solicitação é enviada ou chega numa seção do formulário de abertura.
                  </p>
                  <div className="mt-3">
                    <AutomationsView formId={formId} formFields={automationFields} />
                  </div>
                </details>
              </div>
            ) : undefined
          }
        />
      ) : null}

      {level.kind === 'form' && isOpeningForm && selectedOpeningSection ? (
        <SectionEditModal
          section={selectedOpeningSection}
          sections={draft.sections}
          formId={formId}
          availableFields={conditionFields}
          erpTableEnabled={erpTableEnabled}
          onClose={() => setSelectedSectionId(null)}
          onSelectSection={setSelectedSectionId}
          onUpdateSection={(key, value) => builder.updateSection(selectedOpeningSection.id, key, value)}
          onRemoveSection={() => {
            builder.removeSection(selectedOpeningSection.id);
            setSelectedSectionId(null);
          }}
          canRemoveSection={draft.sections.length > 1}
          onAddField={(fieldType) => builder.addField(selectedOpeningSection.id, fieldType)}
          onRemoveField={(fieldId) => builder.removeField(selectedOpeningSection.id, fieldId)}
          onDuplicateField={(fieldId) => builder.duplicateField(selectedOpeningSection.id, fieldId)}
          onUpdateField={(fieldId, key, value) => builder.updateField(selectedOpeningSection.id, fieldId, key, value)}
          onMoveField={(fromIndex, toIndex) => builder.moveField(selectedOpeningSection.id, fromIndex, toIndex)}
          onSetSectionFlow={(nextSectionId, nextIsSubmit, branches) =>
            builder.setSectionFlow(selectedOpeningSection.id, nextSectionId, nextIsSubmit, branches)
          }
        />
      ) : null}

      {level.kind === 'form' && formPhase && !isOpeningForm && selectedPhaseSectionId ? (
        <PhaseSectionModal
          phase={formPhase}
          sectionId={selectedPhaseSectionId}
          formulaFields={phases.formulaFieldsFor(formPhase.id)}
          onChangeFields={(fields) => setPhaseFields(formPhase, fields)}
          onChangeSectionFlow={(sectionFlow) => phases.updatePhase(formPhase.id, { ...formPhase, sectionFlow })}
          onRemoveSection={() => removePhaseSection(formPhase, selectedPhaseSectionId)}
          onSelectSection={setSelectedPhaseSectionId}
          onClose={() => setSelectedPhaseSectionId(null)}
        />
      ) : null}

      {testFlowOpen ? <SectionFlowTestModal draft={draft} onClose={() => setTestFlowOpen(false)} /> : null}

      {configTarget && configGroup && configNode ? (
        <NodeConfigModal
          variant={isCompactNodeType(configNode.type) ? 'compact' : 'full'}
          onClose={() => setConfigTarget(null)}
        >
          <Suspense
            fallback={<p className="p-6 text-sm text-tx-secondary">Abrindo a configuração do nó…</p>}
          >
            <NodeConfigPanel
              key={`${configGroup.key}:${configNode.id}`}
              node={configNode as unknown as Node}
              nodes={configGroup.nodes as unknown as Node[]}
              edges={configGroup.edges as unknown as Edge[]}
              formId={formId}
              currentFlowId={configGroup.flowId}
              onClose={() => setConfigTarget(null)}
              onUpdate={(nodeId, patch) => {
                if (!canManageFlows) return;
                mapFlows.commit([
                  {
                    ...configGroup,
                    nodes: configGroup.nodes.map((node) =>
                      node.id === nodeId ? { ...node, data: { ...node.data, ...patch } as FlowNodeData } : node,
                    ),
                  },
                ]);
              }}
              onDelete={(nodeId) => {
                if (!canManageFlows) return;
                mapFlows.commit([removeNode(configGroup, nodeId)]);
                setConfigTarget(null);
              }}
            />
          </Suspense>
        </NodeConfigModal>
      ) : null}

    </div>

      {/* ── Lateral direita: automações do processo ───────────────────────── */}
      {showAutomations && formId ? (
        <ProcessAutomationsSidebar
          formId={formId}
          open={automationsOpen}
          onOpenChange={setAutomationsOpen}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          editing={sidebarEditing}
          onEditingChange={setSidebarEditing}
          phaseFilter={automationFilter}
          onPhaseFilterChange={setAutomationFilter}
          highlightFlowId={highlightFlowId}
          flowCount={mapFlows.flows.length}
        />
      ) : null}
    </div>
  );
}

function FormBreadcrumb({
  phaseLabel,
  formLabel,
  onBack,
}: {
  phaseLabel: string;
  formLabel: string;
  onBack: () => void;
}) {
  return (
    <div
      className={`${floatingCard} bottom-4 left-1/2 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-1 p-1.5 text-[13px]`}
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] px-2.5 font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Processo
      </button>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-tx-muted" />
      <span className="truncate font-semibold text-tx-secondary">{phaseLabel || 'Fase sem nome'}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-tx-muted" />
      <span className="truncate pr-2 font-bold text-tx-primary">
        {formLabel}
      </span>
    </div>
  );
}
