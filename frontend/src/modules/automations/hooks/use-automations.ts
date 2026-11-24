import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AutomationRuleInput } from '../services/automations-api';
import {
  createAutomationRule,
  deleteAutomationRule,
  fetchAutomationExecutions,
  fetchAutomationRules,
  updateAutomationRule,
} from '../services/automations-api';

const keys = {
  list: (formId: string) => ['automations', 'list', formId] as const,
  executions: (ruleId: string) => ['automations', 'executions', ruleId] as const,
};

export function useAutomations(formId: string) {
  const client = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: keys.list(formId),
    queryFn: () => fetchAutomationRules(formId),
    enabled: !!formId,
  });

  const invalidate = () => client.invalidateQueries({ queryKey: keys.list(formId) });

  const createMutation = useMutation({
    mutationFn: (payload: AutomationRuleInput) => createAutomationRule(formId, payload),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AutomationRuleInput> }) =>
      updateAutomationRule(id, payload),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAutomationRule(id),
    onSuccess: invalidate,
  });

  return {
    rules: rulesQuery.data ?? [],
    loading: rulesQuery.isLoading,
    createRule: createMutation.mutateAsync,
    updateRule: updateMutation.mutateAsync,
    deleteRule: deleteMutation.mutateAsync,
    saving: createMutation.isPending || updateMutation.isPending,
    deleting: deleteMutation.isPending,
  };
}

export function useAutomationExecutions(ruleId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.executions(ruleId),
    queryFn: () => fetchAutomationExecutions(ruleId),
    enabled: enabled && !!ruleId,
  });
}
