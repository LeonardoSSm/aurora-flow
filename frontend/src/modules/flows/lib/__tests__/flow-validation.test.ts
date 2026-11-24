import { describe, expect, it } from 'vitest';
import { hasCycle, validateFlow } from '../flow-validation';
import type { FlowEdge, FlowNode, FlowNodeType } from '../../types/flow.types';

// ── helpers ──────────────────────────────────────────────────────────────

function trigger(id = 'trigger', type: FlowNodeType = 'trigger_webhook_received'): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function emailNode(id: string, toEmail?: string): FlowNode {
  return { id, type: 'action_send_email', position: { x: 100, y: 0 }, data: { toEmail } };
}

function webhookNode(id: string, webhookUrl?: string): FlowNode {
  return { id, type: 'action_webhook', position: { x: 100, y: 0 }, data: { webhookUrl } };
}

function conditionNode(id: string, fieldCode?: string): FlowNode {
  return { id, type: 'condition_field_value', position: { x: 100, y: 0 }, data: { fieldCode } };
}

function flowNode(id: string, type: FlowNodeType, data: FlowNode['data'] = {}): FlowNode {
  return { id, type, position: { x: 100, y: 0 }, data };
}

function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target };
}

// ── empty canvas ──────────────────────────────────────────────────────────

describe('validateFlow — empty canvas', () => {
  it('returns no errors for an empty canvas', () => {
    expect(validateFlow([], [])).toHaveLength(0);
  });
});

describe('validateFlow — nós descontinuados', () => {
  it('rejeita gatilhos e ações de formulário/solicitação', () => {
    const nodes = [
      trigger('t1', 'trigger_form_submit'),
      flowNode('a1', 'action_create_solicitation_from_payload', { titleTemplate: 'X', formId: 'f1' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.filter((e) => e.type === 'unconfigured_node')).toHaveLength(2);
    expect(errors.every((e) => e.message.includes('descontinuado'))).toBe(true);
  });
});

// ── no_trigger ────────────────────────────────────────────────────────────

describe('validateFlow — no_trigger', () => {
  it('returns no_trigger error when there is no trigger node', () => {
    const nodes = [emailNode('e1', 'a@b.com')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(true);
  });

  it('does not return no_trigger error when a trigger exists', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const edges = [edge('trigger', 'e1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(false);
  });
});

// ── unconfigured_node ─────────────────────────────────────────────────────

describe('validateFlow — unconfigured_node', () => {
  it('flags email node without toEmail', () => {
    const nodes = [trigger(), emailNode('e1')];
    const edges = [edge('trigger', 'e1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'e1')).toBe(true);
  });

  it('does not flag email node with toEmail set', () => {
    const nodes = [trigger(), emailNode('e1', 'x@y.com')];
    const edges = [edge('trigger', 'e1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.nodeId === 'e1')).toBe(false);
  });

  it('flags webhook node without webhookUrl', () => {
    const nodes = [trigger(), webhookNode('w1')];
    const edges = [edge('trigger', 'w1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'w1')).toBe(true);
  });

  it('flags condition node without fieldCode', () => {
    const nodes = [trigger(), conditionNode('c1')];
    const edges = [edge('trigger', 'c1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'c1')).toBe(true);
  });
});

// ── disconnected_node ─────────────────────────────────────────────────────

describe('validateFlow — disconnected_node', () => {
  it('flags a non-trigger node with no edges', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const errors = validateFlow(nodes, []); // no edges
    expect(errors.some((e) => e.type === 'disconnected_node' && e.nodeId === 'e1')).toBe(true);
  });

  it('does not flag a connected node', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const edges = [edge('trigger', 'e1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'disconnected_node')).toBe(false);
  });

  it('does not flag the trigger node as disconnected even without edges', () => {
    const nodes = [trigger()];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'disconnected_node')).toBe(false);
  });
});

// ── cycle detection ───────────────────────────────────────────────────────

describe('hasCycle', () => {
  it('detects a direct self-loop', () => {
    const nodes = [trigger()];
    const edges = [edge('trigger', 'trigger')];
    expect(hasCycle(nodes, edges)).toBe(true);
  });

  it('detects a two-node cycle', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const edges = [edge('trigger', 'e1'), edge('e1', 'trigger')];
    expect(hasCycle(nodes, edges)).toBe(true);
  });

  it('returns false for a simple linear graph', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const edges = [edge('trigger', 'e1')];
    expect(hasCycle(nodes, edges)).toBe(false);
  });

  it('returns false for a branching graph without cycles', () => {
    const nodes = [
      trigger(),
      conditionNode('c1', 'status'),
      emailNode('e1', 'a@b.com'),
      webhookNode('w1', 'https://x.com'),
    ];
    const edges = [edge('trigger', 'c1'), edge('c1', 'e1'), edge('c1', 'w1')];
    expect(hasCycle(nodes, edges)).toBe(false);
  });
});

// ── multiple_triggers ─────────────────────────────────────────────────────

describe('validateFlow — várias entradas (multiple_triggers)', () => {
  it('aceita dois gatilhos: cada um é uma entrada do fluxo', () => {
    const nodes = [trigger('t1'), trigger('t2'), emailNode('e1', 'a@b.com')];
    const edges = [edge('t1', 'e1'), edge('t2', 'e1')];
    expect(validateFlow(nodes, edges)).toEqual([]);
  });

  it('does not return multiple_triggers for a single trigger', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const edges = [edge('trigger', 'e1')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'multiple_triggers')).toBe(false);
  });

  it('com mais de um gatilho, acusa o que não leva a nenhum nó', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      trigger('t2', 'trigger_webhook_received'),
      emailNode('e1', 'a@b.com'),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'e1')]);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(false);
    expect(errors.filter((e) => e.type === 'disconnected_node').map((e) => e.nodeId)).toEqual(['t2']);
  });

  it('só um gatilho agendado por fluxo', () => {
    const agendado = (id: string) =>
      flowNode(id, 'trigger_scheduled', { mode: 'interval', intervalValue: 1, intervalUnit: 'hours' });
    const nodes = [agendado('t1'), agendado('t2'), trigger('t3', 'trigger_webhook_received'), emailNode('e1', 'a@b.com')];
    const errors = validateFlow(nodes, [edge('t1', 'e1'), edge('t2', 'e1'), edge('t3', 'e1')]);
    expect(errors.some((e) => e.type === 'multiple_triggers')).toBe(true);
  });
});

// ── validateFlow — webhook trigger ────────────────────────────────────────

describe('validateFlow — webhook trigger', () => {
  it('accepts webhook trigger without endpoint filter', () => {
    const nodes = [trigger('t1', 'trigger_webhook_received')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node')).toBe(false);
  });

  it('accepts webhook trigger with payload filter object', () => {
    const nodes = [
      flowNode('t1', 'trigger_webhook_received', {
        endpointId: 'endpoint-id',
        payloadFilters: { type: 'ticket.created' },
      }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node')).toBe(false);
  });

  it('flags webhook trigger with invalid payload filter', () => {
    const nodes = [
      flowNode('t1', 'trigger_webhook_received', {
        payloadFilters: '{invalid',
      }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(true);
  });
});

// ── validateFlow — solicitation nodes ─────────────────────────────────────

describe.skip('REMOVED cycle-02 validateFlow — solicitation nodes', () => {
  it('accepts configured solicitation status condition', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('c1', 'condition_solicitation_status', {
        operator: 'equals',
        value: 'waiting_approval',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.nodeId === 'c1')).toBe(false);
  });

  it('flags solicitation status condition without value', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('c1', 'condition_solicitation_status', { operator: 'equals' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'c1')).toBe(true);
  });

  it('accepts configured solicitation priority condition with greater_than', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('c1', 'condition_solicitation_priority', {
        operator: 'greater_than',
        value: 'medium',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.nodeId === 'c1')).toBe(false);
  });

  it('flags status update action without status', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_update_solicitation_status'),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts configured kanban move action', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_move_kanban_card', { status: 'in_progress' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('flags create approval action without approvers', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', { title: 'Aprovar solicitação' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts configured create approval action', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovar solicitação',
        assignedUserIds: ['user-id'],
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('flags dynamic create approval action without approversPath', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovar pedido',
        approverSourceMode: 'dynamic',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts dynamic create approval action with approversPath (no assignedUserIds needed)', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovar pedido',
        approverSourceMode: 'dynamic',
        approversPath: 'header.aprovadores',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('flags form-field create approval action without approverFieldCode', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverSourceMode: 'field',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    const error = errors.find((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1');
    expect(error?.message).toContain('campo do formulário');
  });

  it('accepts form-field create approval action with approverFieldCode (no assignedUserIds needed)', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverSourceMode: 'field',
        approverFieldCode: 'email_gestor',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('accepts a fixed-list create approval action with only approver e-mails (external approvers)', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverEmails: ['gestor@tijucaalimentos.com'],
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('flags an invalid approver e-mail in the fixed list', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovação do gestor',
        assignedUserIds: ['user-id'],
        approverEmails: ['gestor@tijucaalimentos.com', 'sem-arroba'],
      }),
    ];
    const error = validateFlow(nodes, [edge('t1', 'a1')]).find((e) => e.nodeId === 'a1');
    expect(error?.type).toBe('unconfigured_node');
    expect(error?.message).toContain('sem-arroba');
  });

  it('flags more than 10 approver e-mails', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverEmails: Array.from({ length: 11 }, (_, i) => `a${i}@x.com`),
      }),
    ];
    const error = validateFlow(nodes, [edge('t1', 'a1')]).find((e) => e.nodeId === 'a1');
    expect(error?.message).toContain('10');
  });

  it('an empty e-mail list does not satisfy the fixed list on its own', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_create_approval', { title: 'Aprovação', approverEmails: [] }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('flags create solicitation from payload action without titlePath', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('a1', 'action_create_solicitation_from_payload', {}),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts configured create solicitation from payload action', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('a1', 'action_create_solicitation_from_payload', {
        titlePath: 'header.numeroPedido',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('accepts create solicitation with a fixed title on a trigger without payload', () => {
    // Tarefa recorrente: gatilho de movimentação não traz payload, o título vem de template.
    const nodes = [
      trigger('t1', 'trigger_solicitation_moved'),
      flowNode('a1', 'action_create_solicitation_from_payload', {
        titleTemplate: 'Renovar certificado digital A4',
        dueInMonths: 12,
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('flags assign responsible action without userId', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_assign_responsible'),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('flags WhatsApp action without message', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_send_whatsapp', { recipientType: 'requester' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('flags WhatsApp custom recipient without phone', () => {
    const nodes = [
      trigger('t1', 'trigger_solicitation_created'),
      flowNode('a1', 'action_send_whatsapp', {
        recipientType: 'custom',
        message: 'Olá {{solicitation_title}}',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts configured WhatsApp action', () => {
    const nodes = [
      trigger('t1', 'trigger_approval_completed'),
      flowNode('a1', 'action_send_whatsapp', {
        recipientType: 'custom',
        customPhone: '5585999999999',
        message: 'Aprove em {{approval_link}}',
        includeApprovalLink: true,
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });
});

// ── validateFlow — SLA triggers ──────────────────────────────────────────

describe.skip('REMOVED cycle-02 validateFlow — SLA triggers', () => {
  it('aceita trigger_sla_warning como gatilho válido', () => {
    const nodes = [trigger('t1', 'trigger_sla_warning')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(false);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(false);
  });

  it('aceita trigger_sla_breached como gatilho válido', () => {
    const nodes = [trigger('t1', 'trigger_sla_breached')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(false);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(false);
  });

  it('trigger_sla_warning pode ser uma entrada a mais do fluxo', () => {
    const nodes = [
      trigger('t1', 'trigger_sla_warning'),
      trigger('t2', 'trigger_webhook_received'),
      emailNode('e1', 'a@b.com'),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'e1'), edge('t2', 'e1')]);
    expect(errors).toEqual([]);
  });

  it('fluxo com trigger_sla_breached e ação de email é válido', () => {
    const nodes = [trigger('t1', 'trigger_sla_breached'), emailNode('e1', 'a@b.com')];
    const errors = validateFlow(nodes, [edge('t1', 'e1')]);
    expect(errors).toHaveLength(0);
  });
});

// ── validateFlow — cycle error ────────────────────────────────────────────

describe('validateFlow — cycle', () => {
  it('returns cycle error when graph has a cycle', () => {
    const nodes = [trigger(), emailNode('e1', 'a@b.com')];
    const edges = [edge('trigger', 'e1'), edge('e1', 'trigger')];
    const errors = validateFlow(nodes, edges);
    expect(errors.some((e) => e.type === 'cycle')).toBe(true);
  });
});

// ── validateFlow — action_run_flow ────────────────────────────────────────

describe('validateFlow — action_run_flow', () => {
  it('flags action_run_flow without flowId', () => {
    const nodes = [
      trigger('t1'),
      flowNode('a1', 'action_run_flow', { mode: 'sync', passContext: true }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('flags action_run_flow with invalid mode', () => {
    const nodes = [
      trigger('t1'),
      flowNode('a1', 'action_run_flow', { flowId: 'some-uuid', mode: 'invalid' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('does not flag a fully configured action_run_flow (sync)', () => {
    const nodes = [
      trigger('t1'),
      flowNode('a1', 'action_run_flow', {
        flowId: 'child-flow-uuid',
        flowName: 'Sub-fluxo de notificação',
        mode: 'sync',
        passContext: true,
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('does not flag a fully configured action_run_flow (async)', () => {
    const nodes = [
      trigger('t1'),
      flowNode('a1', 'action_run_flow', {
        flowId: 'child-flow-uuid',
        mode: 'async',
        passContext: false,
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('reports disconnected_node for action_run_flow with no edges', () => {
    const nodes = [
      trigger('t1'),
      flowNode('a1', 'action_run_flow', { flowId: 'child-uuid', mode: 'sync', passContext: true }),
    ];
    const errors = validateFlow(nodes, []); // no edges
    expect(errors.some((e) => e.type === 'disconnected_node' && e.nodeId === 'a1')).toBe(true);
  });
});

describe('validateFlow — trigger_scheduled', () => {
  it('flags a scheduled trigger without mode configured', () => {
    const nodes = [trigger('t1', 'trigger_scheduled')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(true);
  });

  it('flags interval mode without value/unit', () => {
    const nodes = [
      flowNode('t1', 'trigger_scheduled', { mode: 'interval' }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(true);
  });

  it('accepts a valid interval schedule', () => {
    const nodes = [
      flowNode('t1', 'trigger_scheduled', {
        mode: 'interval',
        intervalValue: 15,
        intervalUnit: 'minutes',
      }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.nodeId === 't1')).toBe(false);
  });

  it('flags cron mode without cronExpression', () => {
    const nodes = [flowNode('t1', 'trigger_scheduled', { mode: 'cron' })];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(true);
  });

  it('accepts a valid cron schedule', () => {
    const nodes = [
      flowNode('t1', 'trigger_scheduled', { mode: 'cron', cronExpression: '0 8 * * *' }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.nodeId === 't1')).toBe(false);
  });
});

describe('validateFlow — action_http_check', () => {
  it('flags a check action without url', () => {
    const nodes = [trigger('t1', 'trigger_webhook_received'), flowNode('a1', 'action_http_check', {})];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts a configured check action', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('a1', 'action_http_check', { url: 'https://api.example.com/status', method: 'GET' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — trigger_attachment_uploaded', () => {
  it('accepts the trigger with no configuration at all', () => {
    const nodes = [trigger('t1', 'trigger_attachment_uploaded')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(false);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(false);
  });

  it('accepts the trigger scoped to a form and field', () => {
    const nodes = [
      flowNode('t1', 'trigger_attachment_uploaded', { formId: 'form-id', fieldCode: 'foto' }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.nodeId === 't1')).toBe(false);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — action_ai_agent (LOPS IA)', () => {
  it('flags a node with no agent chosen from the list', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_ai_agent', { message: 'Analise essa imagem.' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('flags a node that has an agent but no API key (the server key never runs agents)', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_ai_agent', { agentSlug: 'validador-de-etiquetas' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts a node with the agent chosen and its API key, without any base URL (it comes from the server)', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_ai_agent', { agentSlug: 'validador-de-etiquetas', apiKey: 'secret' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('still accepts a legacy node that also carries its own baseUrl', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_ai_agent', {
        baseUrl: 'https://agentes.exemplo.com',
        agentSlug: 'validador-de-etiquetas',
        apiKey: 'secret',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — action_wait_for_phase_fields', () => {
  it('flags a missing phaseId', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_wait_for_phase_fields', {}),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts a configured wait node', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_wait_for_phase_fields', {
        phaseId: 'phase-quantidade',
        phaseLabel: 'Quantidade produzida',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — action_move_phase', () => {
  it('flags a missing phaseId', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_move_phase', {}),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });

  it('accepts a configured move-phase node', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_move_phase', {
        phaseId: 'phase-concluido',
        phaseLabel: 'Concluído',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — action_create_approval com scope: phase', () => {
  it('accepts approverSourceMode phase_role without assignedUserIds/approversPath', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_create_approval', {
        title: 'Aprovar foto da fase',
        scope: 'phase',
        approverSourceMode: 'phase_role',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.nodeId === 'a1')).toBe(false);
  });

  it('still requires a title with approverSourceMode phase_role', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('a1', 'action_create_approval', {
        scope: 'phase',
        approverSourceMode: 'phase_role',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'a1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'a1')).toBe(true);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — trigger_phase_field_saved', () => {
  it('accepts the trigger with no configuration at all', () => {
    const nodes = [trigger('t1', 'trigger_phase_field_saved')];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 't1')).toBe(false);
    expect(errors.some((e) => e.type === 'no_trigger')).toBe(false);
  });

  it('accepts the trigger scoped to a form and phase', () => {
    const nodes = [
      flowNode('t1', 'trigger_phase_field_saved', { formId: 'form-id', phaseId: 'phase-id' }),
    ];
    const errors = validateFlow(nodes, []);
    expect(errors.some((e) => e.nodeId === 't1')).toBe(false);
  });
});

describe.skip('REMOVED cycle-02 validateFlow — condition_approval_result', () => {
  it('flags a missing or invalid operator/value', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('c1', 'condition_approval_result', { operator: 'equals', value: 'pending' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'c1')).toBe(true);
  });

  it('accepts a configured condition_approval_result', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('c1', 'condition_approval_result', { operator: 'equals', value: 'approved' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.nodeId === 'c1')).toBe(false);
  });

  it('accepts not_equals with rejected', () => {
    const nodes = [
      trigger('t1', 'trigger_attachment_uploaded'),
      flowNode('c1', 'condition_approval_result', { operator: 'not_equals', value: 'rejected' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.nodeId === 'c1')).toBe(false);
  });
});

describe('validateFlow — condition_response_value', () => {
  it('flags a response-value condition without path', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('c1', 'condition_response_value', { operator: 'equals', value: 'ok' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'c1')).toBe(true);
  });

  it('flags a response-value condition with invalid operator', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('c1', 'condition_response_value', { path: 'data.status', operator: 'invalid' }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && e.nodeId === 'c1')).toBe(true);
  });

  it('accepts a configured response-value condition', () => {
    const nodes = [
      trigger('t1', 'trigger_webhook_received'),
      flowNode('c1', 'condition_response_value', {
        path: 'data.status',
        operator: 'equals',
        value: 'aprovado',
      }),
    ];
    const errors = validateFlow(nodes, [edge('t1', 'c1')]);
    expect(errors.some((e) => e.nodeId === 'c1')).toBe(false);
  });
});
