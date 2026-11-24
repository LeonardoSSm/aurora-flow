import { isFlowTriggerNodeType } from '../types/flow.types';

/**
 * O que cada tipo de nó deixa para os próximos nós do fluxo — base da coluna "Variáveis para os
 * próximos nós" do modal de configuração. Os nomes são os do `interpolate` do motor
 * (backend `flow-template-variables.ts`); `paths` são caminhos na última resposta capturada
 * (`lastCheckResponse`), lidos pelo nó "Valor da verificação", e não variáveis `{{...}}`.
 */
export interface NodeOutputVariable {
  name: string;
  label: string;
}

export interface NodeOutputs {
  vars?: readonly NodeOutputVariable[];
  paths?: readonly NodeOutputVariable[];
  /** Nó que não gera dados: explica o porquê no lugar da lista. */
  note?: string;
  /** Traz os campos do formulário (respostas) para o contexto. */
  formFields?: boolean;
}

const v = (name: string, label: string): NodeOutputVariable => ({ name, label });

const FORM_SUBMISSION_VARS = [
  v('form_name', 'Nome do formulário'),
  v('responder_name', 'Nome do respondente'),
  v('responder_email', 'E-mail do respondente'),
  v('submitted_at', 'Data de envio'),
  v('solicitation_number', 'Número da solicitação'),
  v('solicitation_title', 'Título da solicitação'),
  v('tracking_url', 'Link de acompanhamento'),
];

const SOLICITATION_VARS = [
  v('solicitation_number', 'Número da solicitação'),
  v('solicitation_title', 'Título da solicitação'),
  v('solicitation_status', 'Status da solicitação'),
  v('solicitation_priority', 'Prioridade da solicitação'),
  v('solicitation_requester_name', 'Solicitante'),
  v('solicitation_requester_email', 'E-mail do solicitante'),
  v('solicitation_responsible_name', 'Responsável'),
  v('tracking_url', 'Link de acompanhamento'),
];

const SLA_VARS = [
  v('solicitation_number', 'Número da solicitação'),
  v('solicitation_title', 'Título da solicitação'),
  v('solicitation_responsible_name', 'Responsável'),
];

export const NODE_OUTPUTS: Partial<Record<string, NodeOutputs>> = {
  trigger_form_submit: { vars: FORM_SUBMISSION_VARS, formFields: true },
  trigger_webhook_received: {
    vars: [
      v('payload.caminho.do.campo', 'Qualquer dado do webhook'),
      v('item', 'Item atual (com lote ligado)'),
    ],
  },
  trigger_scheduled: {
    note: 'Este gatilho não traz dados de formulário nem de solicitação. Os próximos nós podem buscar dados por conta própria, por exemplo com uma Verificação HTTP.',
  },
  trigger_solicitation_created: { vars: SOLICITATION_VARS, formFields: true },
  trigger_solicitation_moved: { vars: SOLICITATION_VARS, formFields: true },
  trigger_approval_completed: {
    vars: [
      v('approval_title', 'Título da aprovação'),
      v('approval_link', 'Link de aprovação'),
      v('solicitation_title', 'Título da solicitação'),
    ],
  },
  trigger_sla_warning: { vars: SLA_VARS },
  trigger_sla_breached: { vars: SLA_VARS },
  trigger_attachment_uploaded: { vars: SOLICITATION_VARS, formFields: true },
  trigger_phase_field_saved: { vars: SOLICITATION_VARS, formFields: true },
  trigger_phase_entered: { vars: SOLICITATION_VARS, formFields: true },
  action_create_approval: {
    vars: [
      v('approval_title', 'Título da aprovação'),
      v('approval_description', 'Descrição da aprovação'),
      v('approval_link', 'Link de aprovação'),
    ],
  },
  action_create_solicitation_from_payload: { vars: SOLICITATION_VARS, formFields: true },
  action_forward_to_process: {
    note: 'Os próximos passos continuam no card de origem (ex.: encerrar o card). O card criado no destino aparece no resultado da execução.',
  },
  action_http_check: {
    paths: [
      v('data.status', 'Exemplo de caminho na resposta'),
      v('items.0.aprovado', 'Exemplo com lista'),
    ],
  },
  action_ai_agent: {
    paths: [v('campo.da.resposta', 'Caminho na resposta do agente')],
  },
  action_webhook: {
    note: 'O Webhook só dispara e esquece: não gera dados para os próximos nós. Para usar a resposta, use Verificação HTTP.',
  },
};

type GraphNode = { id: string; type?: string; data?: unknown };
type GraphEdge = { source: string; target: string };

export interface VariableGroup {
  title: string;
  items: readonly NodeOutputVariable[];
  /** Caminhos de resposta (sem `{{ }}`). */
  paths?: boolean;
}

export interface NodeVariableGroups {
  /** O que o próprio nó produz. */
  own?: VariableGroup;
  /** Explicação de um nó sem saída própria. */
  note?: string;
  /** Gatilhos e nós anteriores no caminho (o mais próximo primeiro). */
  upstream: VariableGroup[];
  /** Os campos do formulário chegam a este nó. */
  formFields: boolean;
}

/** Ancestrais do nó subindo pelas conexões, do mais próximo ao mais distante. */
export function getAncestors<T extends GraphNode>(
  nodeId: string,
  nodes: readonly T[],
  edges: readonly GraphEdge[],
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>([nodeId]);
  const result: T[] = [];
  let frontier = [nodeId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of edges) {
        if (edge.target !== id || visited.has(edge.source)) continue;
        const source = byId.get(edge.source);
        if (!source) continue;
        visited.add(edge.source);
        result.push(source);
        next.push(edge.source);
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * Grupos da coluna de variáveis para um nó: "Deste nó/gatilho", um grupo por gatilho ou nó com
 * saída antes dele no caminho, e se os campos do formulário chegam até ele.
 */
export function buildVariableGroups(
  nodeId: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  labelOf: (node: GraphNode) => string,
): NodeVariableGroups {
  const node = nodes.find((item) => item.id === nodeId);
  const outputs = (node?.type && NODE_OUTPUTS[node.type]) || {};
  const isTrigger = isFlowTriggerNodeType(node?.type);

  let own: VariableGroup | undefined;
  if (outputs.vars?.length) {
    own = { title: isTrigger ? 'Deste gatilho' : 'Deste nó', items: outputs.vars };
  } else if (outputs.paths?.length) {
    own = { title: 'Deste nó · use em “Valor da verificação”', items: outputs.paths, paths: true };
  }

  const ancestors = getAncestors(nodeId, nodes, edges);
  const upstream: VariableGroup[] = [];
  for (const ancestor of ancestors) {
    const ancestorOutputs = (ancestor.type && NODE_OUTPUTS[ancestor.type]) || {};
    if (!ancestorOutputs.vars?.length) continue;
    const kind = isFlowTriggerNodeType(ancestor.type) ? 'Do gatilho' : 'De';
    upstream.push({ title: `${kind} · ${labelOf(ancestor)}`, items: ancestorOutputs.vars });
  }

  const formFields =
    Boolean(outputs.formFields) ||
    ancestors.some((ancestor) => Boolean(ancestor.type && NODE_OUTPUTS[ancestor.type]?.formFields));

  return { own, note: outputs.note, upstream, formFields };
}
