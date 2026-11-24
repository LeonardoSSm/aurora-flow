import type { Flow } from '../../flows/types/flow.types';

export type PhaseAutomation = {
  flowId: string;
  flowName: string;
  isActive: boolean;
  /** O que cada nó do fluxo faz com esta fase, em linguagem de quem configura. */
  roles: string[];
};

function nodePhaseId(data: unknown): string | null {
  const phaseId = (data as { phaseId?: unknown } | null)?.phaseId;
  return typeof phaseId === 'string' && phaseId ? phaseId : null;
}

/**
 * Fluxos do formulário que tocam uma fase: os que disparam quando os campos dela são salvos
 * (ou de qualquer fase, sem filtro), os que movem cards para ela e os que esperam os campos dela.
 * Só leitura — é a resposta para "o que acontece quando um card passa por aqui?".
 */
export function phaseAutomations(flows: readonly Flow[], phaseId: string): PhaseAutomation[] {
  const result: PhaseAutomation[] = [];
  for (const flow of flows) {
    const roles = new Set<string>();
    for (const node of flow.nodes ?? []) {
      const target = nodePhaseId(node.data);
      if (node.type === 'trigger_phase_field_saved') {
        if (target === phaseId) roles.add('Dispara quando os campos desta fase são salvos');
        else if (target === null) roles.add('Dispara quando os campos de qualquer fase são salvos');
      } else if (node.type === 'action_move_phase' && target === phaseId) {
        roles.add('Move o card para esta fase');
      } else if (node.type === 'action_wait_for_phase_fields' && target === phaseId) {
        roles.add('Espera os campos desta fase serem salvos');
      }
    }
    if (roles.size > 0) {
      result.push({ flowId: flow.id, flowName: flow.name, isActive: flow.isActive, roles: [...roles] });
    }
  }
  return result.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.flowName.localeCompare(b.flowName, 'pt-BR'));
}
