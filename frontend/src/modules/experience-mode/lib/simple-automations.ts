import type { CreateFlowDto, Flow, FlowNode, FlowNodeData } from '../../flows/types/flow.types';

/**
 * Automações do modo simplificado: "quando X acontecer, faça Y". Cada uma é um fluxo pequeno do
 * motor de fluxos (gatilho → [condição] → ação) — nada novo no backend; abre igual no editor de
 * fluxos do modo avançado. `parseSimpleAutomation` reconhece esses fluxos de volta.
 */
export type SimpleTrigger =
  | { kind: 'created' }
  | { kind: 'phase_entered'; phaseId: string }
  | { kind: 'approved' }
  | { kind: 'rejected' };

export type SimpleAction =
  | { kind: 'email_requester'; message: string }
  | { kind: 'notify_users'; userIds: string[]; message: string }
  | { kind: 'move_phase'; phaseId: string }
  | { kind: 'assign'; userId: string };

export type SimpleAutomation = { trigger: SimpleTrigger; action: SimpleAction };

export type SimpleTriggerKind = SimpleTrigger['kind'];
export type SimpleActionKind = SimpleAction['kind'];

/** Lista da esquerda: "Quando…". */
export const SIMPLE_TRIGGERS: Array<{ kind: SimpleTriggerKind; label: string }> = [
  { kind: 'created', label: 'Um pedido for aberto' },
  { kind: 'phase_entered', label: 'O pedido entrar na etapa…' },
  { kind: 'approved', label: 'O pedido for aprovado' },
  { kind: 'rejected', label: 'O pedido for reprovado' },
];

/** Lista da direita: "Então…". */
export const SIMPLE_ACTIONS: Array<{ kind: SimpleActionKind; label: string }> = [
  { kind: 'email_requester', label: 'Mandar e-mail para quem abriu o pedido' },
  { kind: 'notify_users', label: 'Avisar pessoas no sistema' },
  { kind: 'move_phase', label: 'Mover o pedido para a etapa…' },
  { kind: 'assign', label: 'Passar o pedido para um responsável' },
];

type Names = {
  phaseName: (phaseId: string) => string;
  userName: (userId: string) => string;
};

export function describeTrigger(trigger: SimpleTrigger, names: Names): string {
  switch (trigger.kind) {
    case 'created':
      return 'Um pedido for aberto';
    case 'phase_entered':
      return `O pedido entrar em “${names.phaseName(trigger.phaseId)}”`;
    case 'approved':
      return 'O pedido for aprovado';
    case 'rejected':
      return 'O pedido for reprovado';
  }
}

export function describeAction(action: SimpleAction, names: Names): string {
  switch (action.kind) {
    case 'email_requester':
      return 'Mandar e-mail para quem abriu';
    case 'notify_users': {
      const people = action.userIds.map(names.userName);
      const shown = people.slice(0, 2).join(', ');
      return `Avisar ${shown}${people.length > 2 ? ` +${people.length - 2}` : ''}`;
    }
    case 'move_phase':
      return `Mover para “${names.phaseName(action.phaseId)}”`;
    case 'assign':
      return `Passar para ${names.userName(action.userId)}`;
  }
}

/** Texto sugerido para o aviso, conforme o gatilho. Aceita as {{variáveis}} dos fluxos. */
export function defaultMessage(trigger: SimpleTrigger, names: Pick<Names, 'phaseName'>): string {
  switch (trigger.kind) {
    case 'created':
      return 'Recebemos o pedido "{{solicitation_title}}" em {{form_name}}.';
    case 'phase_entered':
      return `O pedido "{{solicitation_title}}" entrou na etapa ${names.phaseName(trigger.phaseId)}.`;
    case 'approved':
      return 'O pedido "{{solicitation_title}}" foi aprovado.';
    case 'rejected':
      return 'O pedido "{{solicitation_title}}" foi reprovado.';
  }
}

/** O que falta para salvar (null = pode). */
export function automationIssue(automation: {
  trigger: SimpleTrigger | null;
  action: SimpleAction | null;
}): string | null {
  const { trigger, action } = automation;
  if (!trigger) return 'Escolha, na esquerda, quando a automação acontece.';
  if (trigger.kind === 'phase_entered' && !trigger.phaseId) return 'Escolha a etapa.';
  if (!action) return 'Escolha, na direita, o que deve ser feito.';
  if (action.kind === 'move_phase' && !action.phaseId) return 'Escolha para qual etapa mover.';
  if (action.kind === 'assign' && !action.userId) return 'Escolha o responsável.';
  if (action.kind === 'notify_users' && action.userIds.length === 0) return 'Escolha quem vai ser avisado.';
  if ((action.kind === 'notify_users' || action.kind === 'email_requester') && !action.message.trim()) {
    return 'Escreva a mensagem.';
  }
  if (
    trigger.kind === 'phase_entered' &&
    action.kind === 'move_phase' &&
    trigger.phaseId === action.phaseId
  ) {
    return 'Mover para a mesma etapa em que o pedido acabou de entrar não faz nada.';
  }
  return null;
}

const node = (id: string, type: FlowNode['type'], x: number, data: Record<string, unknown>): FlowNode => ({
  id,
  type,
  position: { x, y: 0 },
  data: data as FlowNodeData,
});

/** Monta o fluxo (gatilho → [aprovado/reprovado] → ação) de uma automação simples. */
export function buildAutomationFlow(
  formId: string,
  automation: SimpleAutomation,
  names: Names,
): CreateFlowDto {
  const { trigger, action } = automation;
  const nodes: FlowNode[] = [];
  const edges: CreateFlowDto['edges'] = [];

  switch (trigger.kind) {
    case 'created':
      nodes.push(node('gatilho', 'trigger_solicitation_created', 0, { formId }));
      break;
    case 'phase_entered':
      nodes.push(node('gatilho', 'trigger_phase_entered', 0, { formId, phaseId: trigger.phaseId }));
      break;
    case 'approved':
    case 'rejected':
      nodes.push(node('gatilho', 'trigger_approval_completed', 0, { formId }));
      nodes.push(
        node('resultado', 'condition_approval_result', 280, {
          operator: 'equals',
          value: trigger.kind === 'approved' ? 'approved' : 'rejected',
        }),
      );
      break;
  }

  switch (action.kind) {
    case 'email_requester':
      nodes.push(
        node('acao', 'action_notification', 560, {
          channel: 'email',
          recipients: [{ type: 'requester' }],
          title: '{{form_name}}: atualização do seu pedido',
          content: action.message,
          skipUnresolvedRecipients: true,
        }),
      );
      break;
    case 'notify_users':
      nodes.push(
        node('acao', 'action_notification', 560, {
          channel: 'in_app',
          recipients: [{ type: 'users', userIds: action.userIds }],
          title: '{{form_name}}',
          content: action.message,
        }),
      );
      break;
    case 'move_phase':
      nodes.push(
        node('acao', 'action_move_phase', 560, {
          phaseId: action.phaseId,
          phaseLabel: names.phaseName(action.phaseId),
        }),
      );
      break;
    case 'assign':
      nodes.push(node('acao', 'action_assign_responsible', 560, { userId: action.userId }));
      break;
  }

  if (nodes.some((item) => item.id === 'resultado')) {
    edges.push({ id: 'gatilho-resultado', source: 'gatilho', target: 'resultado' });
    edges.push({ id: 'resultado-acao', source: 'resultado', sourceHandle: 'yes', target: 'acao' });
  } else {
    edges.push({ id: 'gatilho-acao', source: 'gatilho', target: 'acao' });
  }

  const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  const name = `Quando ${lowerFirst(describeTrigger(trigger, names))} → ${lowerFirst(describeAction(action, names))}`;
  return { formId, name: name.slice(0, 150), isActive: true, nodes, edges };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Lê de volta um fluxo no formato das automações simples. Fluxos montados no editor avançado
 * (mais nós, outros tipos, condições extras) voltam null e aparecem só pelo nome.
 */
export function parseSimpleAutomation(flow: Pick<Flow, 'nodes' | 'edges'>): SimpleAutomation | null {
  const triggers = flow.nodes.filter((item) => item.type.startsWith('trigger_'));
  const actions = flow.nodes.filter((item) => item.type.startsWith('action_'));
  const conditions = flow.nodes.filter((item) => item.type.startsWith('condition_'));
  if (triggers.length !== 1 || actions.length !== 1 || conditions.length > 1) return null;
  const [triggerNode] = triggers;
  const [actionNode] = actions;
  const t = triggerNode.data as Record<string, unknown>;
  const a = actionNode.data as Record<string, unknown>;

  let trigger: SimpleTrigger | null = null;
  if (triggerNode.type === 'trigger_solicitation_created' && conditions.length === 0) {
    trigger = { kind: 'created' };
  } else if (triggerNode.type === 'trigger_phase_entered' && conditions.length === 0 && str(t.phaseId)) {
    trigger = { kind: 'phase_entered', phaseId: str(t.phaseId) };
  } else if (
    triggerNode.type === 'trigger_approval_completed' &&
    conditions[0]?.type === 'condition_approval_result'
  ) {
    const c = conditions[0].data as Record<string, unknown>;
    const yesEdge = flow.edges.find((edge) => edge.source === conditions[0].id && edge.target === actionNode.id);
    if (c.operator === 'equals' && yesEdge?.sourceHandle === 'yes') {
      trigger = c.value === 'rejected' ? { kind: 'rejected' } : { kind: 'approved' };
    }
  }
  if (!trigger) return null;

  let action: SimpleAction | null = null;
  const recipients = Array.isArray(a.recipients) ? (a.recipients as Array<Record<string, unknown>>) : [];
  if (actionNode.type === 'action_notification' && recipients.length === 1) {
    const [recipient] = recipients;
    if (a.channel === 'email' && recipient.type === 'requester') {
      action = { kind: 'email_requester', message: str(a.content) };
    } else if (a.channel === 'in_app' && recipient.type === 'users' && Array.isArray(recipient.userIds)) {
      action = { kind: 'notify_users', userIds: recipient.userIds as string[], message: str(a.content) };
    }
  } else if (actionNode.type === 'action_move_phase' && str(a.phaseId)) {
    action = { kind: 'move_phase', phaseId: str(a.phaseId) };
  } else if (actionNode.type === 'action_assign_responsible' && str(a.userId)) {
    action = { kind: 'assign', userId: str(a.userId) };
  }
  return action ? { trigger, action } : null;
}
