import { disabledFlowNodeMessage, isEnabledFlowNodeType } from './flow-capabilities';

describe('flow-capabilities', () => {
  it('permite gatilhos e ações genéricas', () => {
    expect(isEnabledFlowNodeType('trigger_webhook_received')).toBe(true);
    expect(isEnabledFlowNodeType('trigger_scheduled')).toBe(true);
    expect(isEnabledFlowNodeType('action_http_check')).toBe(true);
    expect(isEnabledFlowNodeType('action_run_flow')).toBe(true);
  });

  it('bloqueia nós de formulário/processo', () => {
    expect(isEnabledFlowNodeType('trigger_form_submit')).toBe(false);
    expect(isEnabledFlowNodeType('action_move_kanban_card')).toBe(false);
    expect(isEnabledFlowNodeType('action_create_solicitation_from_payload')).toBe(false);
    expect(isEnabledFlowNodeType('action_ai_agent')).toBe(false);
    expect(disabledFlowNodeMessage('trigger_form_submit')).toMatch(/descontinuado/);
  });
});
