import { describe, expect, it } from 'vitest';
import type { Flow } from '../../../flows/types/flow.types';
import {
  automationIssue,
  buildAutomationFlow,
  parseSimpleAutomation,
  type SimpleAutomation,
} from '../simple-automations';

const names = {
  phaseName: (id: string) => ({ p1: 'Triagem', p2: 'Compra' })[id] ?? id,
  userName: (id: string) => ({ u1: 'Ana', u2: 'Bia', u3: 'Caio' })[id] ?? id,
};

function roundTrip(automation: SimpleAutomation) {
  const dto = buildAutomationFlow('form-1', automation, names);
  return { dto, parsed: parseSimpleAutomation({ nodes: dto.nodes ?? [], edges: dto.edges ?? [] }) };
}

describe('automações simples', () => {
  const cases: SimpleAutomation[] = [
    { trigger: { kind: 'created' }, action: { kind: 'email_requester', message: 'Recebido' } },
    { trigger: { kind: 'phase_entered', phaseId: 'p1' }, action: { kind: 'notify_users', userIds: ['u1'], message: 'Oi' } },
    { trigger: { kind: 'approved' }, action: { kind: 'move_phase', phaseId: 'p2' } },
    { trigger: { kind: 'rejected' }, action: { kind: 'assign', userId: 'u2' } },
  ];

  it.each(cases)('monta e lê de volta $trigger.kind → $action.kind', (automation) => {
    expect(roundTrip(automation).parsed).toEqual(automation);
  });

  it('aprovado vira gatilho de aprovação + condição, ligada pela saída "sim"', () => {
    const { dto } = roundTrip(cases[2]);
    expect(dto.nodes?.map((n) => n.type)).toEqual([
      'trigger_approval_completed',
      'condition_approval_result',
      'action_move_phase',
    ]);
    expect(dto.edges).toContainEqual({ id: 'resultado-acao', source: 'resultado', sourceHandle: 'yes', target: 'acao' });
    expect(dto.name).toBe('Quando o pedido for aprovado → mover para “Compra”');
  });

  it('o gatilho fica preso ao processo', () => {
    const { dto } = roundTrip(cases[1]);
    expect(dto.formId).toBe('form-1');
    expect(dto.nodes?.[0].data).toEqual({ formId: 'form-1', phaseId: 'p1' });
  });

  it('fluxo com mais nós (feito no editor avançado) não é reconhecido', () => {
    const { dto } = roundTrip(cases[0]);
    const nodes = dto.nodes ?? [];
    const extra = { ...nodes[1], id: 'outra' };
    const flow: Pick<Flow, 'nodes' | 'edges'> = { nodes: [...nodes, extra], edges: dto.edges ?? [] };
    expect(parseSimpleAutomation(flow)).toBeNull();
  });

  it('aponta o que falta antes de salvar', () => {
    expect(automationIssue({ trigger: null, action: null })).toMatch(/esquerda/);
    expect(automationIssue({ trigger: { kind: 'created' }, action: null })).toMatch(/direita/);
    expect(
      automationIssue({ trigger: { kind: 'created' }, action: { kind: 'notify_users', userIds: [], message: 'x' } }),
    ).toMatch(/quem vai ser avisado/);
    expect(
      automationIssue({
        trigger: { kind: 'phase_entered', phaseId: 'p1' },
        action: { kind: 'move_phase', phaseId: 'p1' },
      }),
    ).toMatch(/mesma etapa/);
    expect(automationIssue(cases[3])).toBeNull();
  });
});
