import type { Flow, FlowNode } from '../../flows/types/flow.types';

/** Fase como o mapa precisa: id salvo (o que os fluxos guardam), na ordem do processo. */
export type MapPhase = { id: string; requiresApproval: boolean };

function phaseIdOf(node: FlowNode | undefined): string | null {
  const phaseId = (node?.data as { phaseId?: unknown } | undefined)?.phaseId;
  return typeof phaseId === 'string' && phaseId ? phaseId : null;
}

/**
 * De onde o gatilho do fluxo "parte" no mapa: a fase do filtro dele; "pedido aberto" parte da
 * primeira fase; aprovação sem fase escolhida, das fases que pedem aprovação.
 */
function triggerPhases(trigger: FlowNode | undefined, phases: readonly MapPhase[]): string[] {
  if (!trigger) return [];
  const own = phaseIdOf(trigger);
  if (own) return phases.some((phase) => phase.id === own) ? [own] : [];
  if (trigger.type === 'trigger_solicitation_created') return phases[0] ? [phases[0].id] : [];
  if (trigger.type === 'trigger_approval_completed') {
    return phases.filter((phase) => phase.requiresApproval).map((phase) => phase.id);
  }
  return [];
}

/** Fases que o fluxo toca: as do gatilho e as de qualquer nó com fase (mover, esperar campos…). */
export function flowPhaseIds(flow: Pick<Flow, 'nodes'>, phases: readonly MapPhase[]): string[] {
  const known = new Set(phases.map((phase) => phase.id));
  const trigger = flow.nodes.find((node) => node.type.startsWith('trigger_'));
  const touched = new Set(triggerPhases(trigger, phases));
  for (const node of flow.nodes) {
    const phaseId = phaseIdOf(node);
    if (phaseId && known.has(phaseId)) touched.add(phaseId);
  }
  return [...touched];
}

/** Quantas automações tocam cada fase (o chip "⚡ N automações" do mapa). */
export function processAutomationMap(
  flows: ReadonlyArray<Pick<Flow, 'nodes'>>,
  phases: readonly MapPhase[],
): { countByPhaseId: Record<string, number> } {
  const countByPhaseId: Record<string, number> = {};
  for (const flow of flows) {
    for (const phaseId of flowPhaseIds(flow, phases)) {
      countByPhaseId[phaseId] = (countByPhaseId[phaseId] ?? 0) + 1;
    }
  }
  return { countByPhaseId };
}
