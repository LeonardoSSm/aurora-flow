import {
  FLOW_NODE_TYPES,
  FLOW_TRIGGER_NODE_TYPES,
  isFlowTriggerNodeType,
} from './types/flow.types';

import { isEnabledFlowNodeType } from './flow-capabilities';

describe('flow.types SLA triggers', () => {
  it('ainda reconhece gatilhos SLA no tipo, mas não os habilita', () => {
    expect(FLOW_TRIGGER_NODE_TYPES).toContain('trigger_sla_warning');
    expect(FLOW_NODE_TYPES).toContain('trigger_sla_breached');
    expect(isFlowTriggerNodeType('trigger_sla_warning')).toBe(true);
    expect(isEnabledFlowNodeType('trigger_sla_warning')).toBe(false);
    expect(isEnabledFlowNodeType('trigger_sla_breached')).toBe(false);
  });
});
