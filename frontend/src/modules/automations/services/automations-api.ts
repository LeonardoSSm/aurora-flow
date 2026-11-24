import { api } from '../../../services/api';
import type { AutomationExecution, AutomationRule, AutomationTrigger } from '../types';

export type AutomationRuleInput = {
  name: string;
  isActive?: boolean;
  trigger?: AutomationTrigger;
  targetSectionId?: string | null;
  conditions?: Record<string, unknown> | null;
  actions: Record<string, unknown>[];
};

export async function fetchAutomationRules(formId: string): Promise<AutomationRule[]> {
  const { data } = await api.get<AutomationRule[]>(`/forms/${formId}/automations`);
  return data;
}

export async function createAutomationRule(
  formId: string,
  payload: AutomationRuleInput,
): Promise<AutomationRule> {
  const { data } = await api.post<AutomationRule>(`/forms/${formId}/automations`, payload);
  return data;
}

export async function updateAutomationRule(
  id: string,
  payload: Partial<AutomationRuleInput>,
): Promise<AutomationRule> {
  const { data } = await api.patch<AutomationRule>(`/automations/${id}`, payload);
  return data;
}

export async function deleteAutomationRule(id: string): Promise<void> {
  await api.delete(`/automations/${id}`);
}

export async function fetchAutomationExecutions(ruleId: string): Promise<AutomationExecution[]> {
  const { data } = await api.get<AutomationExecution[]>(`/automations/${ruleId}/executions`);
  return data;
}
