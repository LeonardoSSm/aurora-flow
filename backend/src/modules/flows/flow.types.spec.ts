import {
  FLOW_NODE_TYPES,
  FLOW_TRIGGER_NODE_TYPES,
  isFlowTriggerNodeType,
} from './types/flow.types';

describe('flow.types SLA triggers', () => {
  it('registra trigger_sla_warning como gatilho válido', () => {
    expect(FLOW_TRIGGER_NODE_TYPES).toContain('trigger_sla_warning');
    expect(FLOW_NODE_TYPES).toContain('trigger_sla_warning');
    expect(isFlowTriggerNodeType('trigger_sla_warning')).toBe(true);
  });

  it('registra trigger_sla_breached como gatilho válido', () => {
    expect(FLOW_TRIGGER_NODE_TYPES).toContain('trigger_sla_breached');
    expect(FLOW_NODE_TYPES).toContain('trigger_sla_breached');
    expect(isFlowTriggerNodeType('trigger_sla_breached')).toBe(true);
  });
});
