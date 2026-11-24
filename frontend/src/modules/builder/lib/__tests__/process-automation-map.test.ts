import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../../../flows/types/flow.types';
import { flowPhaseIds, processAutomationMap, type MapPhase } from '../process-automation-map';

const phases: MapPhase[] = [
  { id: 'novo', requiresApproval: false },
  { id: 'gestor', requiresApproval: true },
  { id: 'fim', requiresApproval: false },
];

function node(id: string, type: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data } as unknown as FlowNode;
}

describe('automações por fase no mapa de processos', () => {
  it('aprovação sem fase conta nas fases que pedem aprovação e na fase de destino', () => {
    const flow = {
      nodes: [
        node('t', 'trigger_approval_completed'),
        node('c', 'condition_approval_result', { operator: 'equals', value: 'approved' }),
        node('a', 'action_move_phase', { phaseId: 'fim' }),
      ],
    };
    expect(processAutomationMap([flow], phases).countByPhaseId).toEqual({ gestor: 1, fim: 1 });
  });

  it('"pedido aberto" conta na primeira fase; "ao entrar", na fase do gatilho', () => {
    const map = processAutomationMap(
      [
        { nodes: [node('t', 'trigger_phase_entered', { phaseId: 'gestor' }), node('a', 'action_move_phase', { phaseId: 'novo' })] },
        { nodes: [node('t', 'trigger_solicitation_created'), node('a', 'action_notification')] },
      ],
      phases,
    );
    expect(map.countByPhaseId).toEqual({ gestor: 1, novo: 2 });
  });

  it('ignora fases de outro processo', () => {
    const flow = {
      nodes: [
        node('t', 'trigger_phase_entered', { phaseId: 'novo' }),
        node('b', 'action_move_phase', { phaseId: 'fase-de-outro-processo' }),
      ],
    };
    expect(flowPhaseIds(flow, phases)).toEqual(['novo']);
  });
});
