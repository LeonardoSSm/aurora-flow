import { describe, expect, it } from 'vitest';
import type { Flow } from '../../flows/types/flow.types';
import { phaseAutomations } from './phase-automations';

function flow(id: string, nodes: Array<{ type: string; data?: Record<string, unknown> }>, isActive = true): Flow {
  return {
    id,
    name: `Fluxo ${id}`,
    isActive,
    formId: 'form-1',
    nodes: nodes.map((node, index) => ({
      id: `${id}-n${index}`,
      type: node.type,
      position: { x: 0, y: 0 },
      data: node.data ?? {},
    })),
    edges: [],
    viewport: null,
    createdBy: 'u',
    createdAt: '',
    updatedAt: '',
  } as unknown as Flow;
}

describe('phaseAutomations', () => {
  it('lista o que cada fluxo faz com a fase e ignora fluxos que não a tocam', () => {
    const result = phaseAutomations(
      [
        flow('a', [
          { type: 'trigger_phase_field_saved', data: { phaseId: 'logistica' } },
          { type: 'action_move_phase', data: { phaseId: 'financeiro' } },
        ]),
        flow('b', [
          { type: 'trigger_solicitation_created' },
          { type: 'action_move_phase', data: { phaseId: 'logistica' } },
          { type: 'action_wait_for_phase_fields', data: { phaseId: 'logistica' } },
        ]),
        flow('c', [{ type: 'trigger_phase_field_saved', data: { phaseId: 'financeiro' } }]),
        flow('d', [{ type: 'trigger_phase_field_saved', data: {} }], false),
      ],
      'logistica',
    );

    expect(result).toEqual([
      { flowId: 'a', flowName: 'Fluxo a', isActive: true, roles: ['Dispara quando os campos desta fase são salvos'] },
      {
        flowId: 'b',
        flowName: 'Fluxo b',
        isActive: true,
        roles: ['Move o card para esta fase', 'Espera os campos desta fase serem salvos'],
      },
      {
        flowId: 'd',
        flowName: 'Fluxo d',
        isActive: false,
        roles: ['Dispara quando os campos de qualquer fase são salvos'],
      },
    ]);
  });
});
