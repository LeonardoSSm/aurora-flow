import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../../../flows/types/flow.types';
import {
  connectNodes,
  layoutMapNodes,
  linkNodeToPhase,
  linkPhaseToNode,
  mapNodeId,
  parseMapNodeId,
  phaseLinks,
  removeNode,
  setNodeMapPosition,
  unlinkPhase,
  type MapGroup,
} from '../process-map-flows';

function node(id: string, type: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data } as unknown as FlowNode;
}

function group(key: string, nodes: FlowNode[], flowId: string | null = key, edges: MapGroup['edges'] = []): MapGroup {
  return { key, flowId, name: key, isActive: true, nodes, edges };
}

const fase = { id: 'f1', label: 'Aprovação' };

describe('automações no mapa de processos', () => {
  it('id do nó no mapa junta automação e nó, e volta', () => {
    expect(parseMapNodeId(mapNodeId('rascunho:1', 'no_2'))).toEqual({ groupKey: 'rascunho:1', nodeId: 'no_2' });
    expect(parseMapNodeId('fase-solta')).toBeNull();
  });

  it('fase → gatilho com filtro: o gatilho passa a valer para a fase', () => {
    const result = linkPhaseToNode(group('g', [node('t', 'trigger_approval_completed', { result: 'any' })]), 't', fase, 'form', 'x');
    expect('group' in result && result.group.nodes[0].data).toEqual({ result: 'any', phaseId: 'f1', formId: 'form' });
  });

  it('fase → gatilho sem fase é recusado', () => {
    const result = linkPhaseToNode(group('g', [node('t', 'trigger_webhook_received')]), 't', fase, 'form', 'x');
    expect(result).toHaveProperty('error');
  });

  it('fase → ação: entra um "Entrou na fase" antes dela, ligado', () => {
    const g = group('g', [node('a', 'action_notification', { mapPosition: { x: 500, y: 300 } })]);
    const result = linkPhaseToNode(g, 'a', fase, 'form', 'novo');
    if (!('group' in result)) throw new Error(result.error);
    expect(result.group.nodes[1]).toMatchObject({
      id: 'novo',
      type: 'trigger_phase_entered',
      data: { formId: 'form', phaseId: 'f1', mapPosition: { x: 180, y: 300 } },
    });
    expect(result.group.edges).toEqual([{ id: 'novo->a', source: 'novo', target: 'a' }]);
  });

  it('nó → fase só para "Mover para fase" e "Esperar campos"', () => {
    const move = linkNodeToPhase(group('g', [node('m', 'action_move_phase')]), 'm', fase);
    expect('group' in move && move.group.nodes[0].data).toEqual({ phaseId: 'f1', phaseLabel: 'Aprovação' });
    expect(linkNodeToPhase(group('g', [node('n', 'action_notification')]), 'n', fase)).toHaveProperty('error');
  });

  describe('entrada externa (pedido que chega de fora numa fase)', () => {
    const entry = { formId: 'form', newNodeId: 'criar' };

    it('webhook → fase: entra um "Criar solicitação" do processo, nascendo na fase', () => {
      const g = group('g', [node('w', 'trigger_webhook_received', { mapPosition: { x: 100, y: 400 } })]);
      const result = linkNodeToPhase(g, 'w', fase, entry);
      if (!('group' in result)) throw new Error(result.error);
      expect(result.createdNodeId).toBe('criar');
      expect(result.group.nodes[1]).toMatchObject({
        id: 'criar',
        type: 'action_create_solicitation_from_payload',
        data: { formId: 'form', phaseId: 'f1', stopIfExisting: true, mapPosition: { x: 420, y: 400 } },
      });
      expect(result.group.edges).toEqual([{ id: 'w->criar', source: 'w', target: 'criar' }]);
      expect(phaseLinks([result.group], new Set(['f1']))).toEqual([
        { groupKey: 'g', nodeId: 'criar', phaseId: 'f1', kind: 'externa' },
      ]);
    });

    it('gatilho que já traz solicitação não vira entrada', () => {
      const g = group('g', [node('t', 'trigger_solicitation_created')]);
      expect(linkNodeToPhase(g, 't', fase, entry)).toHaveProperty('error');
    });

    it('"Criar solicitação" → fase troca a fase de entrada; de outro formulário é recusado', () => {
      const proprio = linkNodeToPhase(group('g', [node('c', 'action_create_solicitation_from_payload')]), 'c', fase, entry);
      expect('group' in proprio && proprio.group.nodes[0].data).toEqual({ phaseId: 'f1', formId: 'form' });
      const outro = group('g', [node('c', 'action_create_solicitation_from_payload', { formId: 'outro' })]);
      expect(linkNodeToPhase(outro, 'c', fase, entry)).toHaveProperty('error');
    });
  });

  it('linhas de fase são lidas do filtro do gatilho e do destino', () => {
    const groups = [
      group('g', [
        node('t', 'trigger_phase_entered', { phaseId: 'f1' }),
        node('m', 'action_move_phase', { phaseId: 'f2' }),
        node('n', 'action_notification', { phaseId: 'f1' }),
      ]),
    ];
    expect(phaseLinks(groups, new Set(['f1', 'f2']))).toEqual([
      { groupKey: 'g', nodeId: 't', phaseId: 'f1', kind: 'entrada' },
      { groupKey: 'g', nodeId: 'm', phaseId: 'f2', kind: 'destino' },
    ]);
    expect(unlinkPhase(groups[0], 't').nodes[0].data).toEqual({});
  });

  it('ligar rascunho a uma automação salva: o rascunho entra nela', () => {
    const salvo = group('flow-1', [node('t', 'trigger_phase_entered')]);
    const rascunho = group('rascunho:1', [node('a', 'action_notification')], null);
    const result = connectNodes([salvo, rascunho], { groupKey: 'flow-1', nodeId: 't' }, { groupKey: 'rascunho:1', nodeId: 'a' });
    expect(result.groups).toHaveLength(1);
    expect(result.groups?.[0].key).toBe('flow-1');
    expect(result.groups?.[0].nodes.map((n) => n.id)).toEqual(['t', 'a']);
    expect(result.groups?.[0].edges).toEqual([{ id: 't->a', source: 't', target: 'a' }]);
  });

  it('condição liga pela saída sim/não; gatilho não recebe linha; salvos diferentes não se juntam', () => {
    const g = group('g', [node('c', 'condition_approval_result'), node('a', 'action_move_phase'), node('t', 'trigger_phase_entered')]);
    const yes = connectNodes([g], { groupKey: 'g', nodeId: 'c', handle: 'yes' }, { groupKey: 'g', nodeId: 'a' });
    expect(yes.groups?.[0].edges).toEqual([{ id: 'c:yes->a', source: 'c', target: 'a', sourceHandle: 'yes' }]);
    expect(connectNodes([g], { groupKey: 'g', nodeId: 'a' }, { groupKey: 'g', nodeId: 't' })).toHaveProperty('error');
    const other = group('h', [node('x', 'action_notification')]);
    expect(connectNodes([g, other], { groupKey: 'g', nodeId: 'a' }, { groupKey: 'h', nodeId: 'x' })).toHaveProperty('error');
  });

  it('apagar nó leva junto as linhas dele; mover guarda a posição no mapa', () => {
    const g = group('g', [node('t', 'trigger_phase_entered'), node('a', 'action_notification')], 'g', [
      { id: 't->a', source: 't', target: 'a' },
    ]);
    expect(removeNode(g, 'a')).toMatchObject({ nodes: [{ id: 't' }], edges: [] });
    expect(setNodeMapPosition(g, 'a', { x: 10.4, y: 20.6 }).nodes[1].data).toEqual({ mapPosition: { x: 10, y: 21 } });
  });

  it('nós sem posição ficam em faixas abaixo das fases, a partir da fase do gatilho', () => {
    const groups = [
      group('g', [node('t', 'trigger_phase_entered', { phaseId: 'f1' }), node('a', 'action_notification')], 'g', [
        { id: 't->a', source: 't', target: 'a' },
      ]),
      group('h', [node('x', 'trigger_solicitation_created')]),
    ];
    const positions = layoutMapNodes(groups, new Map([['f1', 740]]), 300);
    expect(positions.get('g::t')).toEqual({ x: 740, y: 300 });
    expect(positions.get('g::a')).toEqual({ x: 1060, y: 300 });
    expect(positions.get('h::x')).toEqual({ x: 0, y: 490 });
  });
});
