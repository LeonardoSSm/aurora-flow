import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import { ActionNode } from '../../../flows/nodes/ActionNode';
import { ConditionNode } from '../../../flows/nodes/ConditionNode';
import { TriggerNode } from '../../../flows/nodes/TriggerNode';
import { FLOW_NODE_TYPES } from '../../../flows/types/flow.types';

/** Marcas que o mapa põe nos dados do nó só para desenhar (não vão para o fluxo). */
export type MapFlowNodeExtras = { __mapDraft?: boolean };

/**
 * Nó de automação desenhado no mapa de processos: o mesmo cartão do editor de fluxos, mais um
 * ponto de ligação em cima ("fase") para receber a linha que sai de uma fase.
 */
export function MapFlowNode(props: NodeProps) {
  const type = String(props.type);
  const Inner = type.startsWith('trigger_') ? TriggerNode : type.startsWith('condition_') ? ConditionNode : ActionNode;
  const isDraft = Boolean((props.data as MapFlowNodeExtras).__mapDraft);

  return (
    <div className="relative">
      {isDraft ? (
        <span className="pointer-events-none absolute -top-6 left-2 z-10 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Rascunho
        </span>
      ) : null}
      <Inner {...props} />
      {/* Depois do nó: linha de fluxo sem ponto escolhido cai no primeiro ponto de entrada, o da esquerda. */}
      <Handle
        id="fase"
        type="target"
        position={Position.Top}
        title="Ligue uma fase aqui"
        className="!h-3 !w-3 !border-2 !border-[#3B82F6] !bg-bg-surface"
      />
    </div>
  );
}

/** Todos os tipos de nó de fluxo, desenhados como MapFlowNode. */
export const mapFlowNodeTypes: NodeTypes = Object.fromEntries(FLOW_NODE_TYPES.map((type) => [type, MapFlowNode]));
