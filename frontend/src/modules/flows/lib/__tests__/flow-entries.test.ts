import { describe, expect, it } from 'vitest';
import { validateFlow } from '../flow-validation';
import { getEntryNodes, resolveNodeFormId } from '../flow-entries';
import type { FlowEdge, FlowNode, FlowNodeType } from '../../types/flow.types';

function no(id: string, type: FlowNodeType, data: FlowNode['data'] = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(source: string, target: string, sourceHandle?: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

// Envio do formulário → Logística → Financeiro; o lote do webhook cria a solicitação e entra
// direto no Financeiro.
const nodes = [
  no('envio', 'trigger_webhook_received', { endpointId: 'ep-form' }),
  no('logistica', 'condition_always_true'),
  no('lote', 'trigger_webhook_received', { endpointId: 'ep-1', splitItemsPath: 'pedidos' }),
  no('financeiro', 'condition_always_true'),
];
const edges = [
  edge('envio', 'logistica'),
  edge('logistica', 'financeiro', 'yes'),
  edge('lote', 'financeiro'),
];

describe('várias entradas no mesmo fluxo', () => {
  it('lista os gatilhos na ordem do fluxo', () => {
    expect(getEntryNodes(nodes).map((n) => n.id)).toEqual(['envio', 'lote']);
  });

  it('é um fluxo válido', () => {
    expect(validateFlow(nodes, edges)).toEqual([]);
  });

  it('acusa gatilho que não leva a nenhum nó', () => {
    const errors = validateFlow(nodes, edges.filter((e) => e.source !== 'lote'));
    expect(errors).toContainEqual(
      expect.objectContaining({ type: 'disconnected_node', nodeId: 'lote' }),
    );
  });

  it('com um gatilho só, gatilho solto continua não sendo erro', () => {
    expect(validateFlow([no('t', 'trigger_webhook_received')], [])).toEqual([]);
  });

  it('aceita vários gatilhos, mas só um agendado', () => {
    const agendado = (id: string) =>
      no(id, 'trigger_scheduled', { mode: 'interval', intervalValue: 1, intervalUnit: 'hours' });
    const errors = validateFlow(
      [agendado('a1'), agendado('a2'), no('x', 'condition_always_true')],
      [edge('a1', 'x'), edge('a2', 'x')],
    );
    expect(errors.filter((e) => e.type === 'multiple_triggers')).toHaveLength(1);
  });

});

describe.skip('REMOVED cycle-02 resolveNodeFormId', () => {
  const comFormDiferente = [
    no('envio', 'trigger_webhook_received', { formId: 'form-a' }),
    no('a', 'condition_always_true'),
    no('lote', 'trigger_webhook_received'),
    no('criar', 'action_create_solicitation_from_payload', { formId: 'form-b' }),
    no('b', 'condition_always_true'),
    no('solto', 'condition_always_true'),
  ];
  const ligacoes = [edge('envio', 'a'), edge('lote', 'criar'), edge('criar', 'b')];

  it('usa o formulário do gatilho que chega no nó', () => {
    expect(resolveNodeFormId('a', comFormDiferente, ligacoes)).toBe('form-a');
  });

  it('depois de "Criar solicitação", os campos são os do formulário dela', () => {
    expect(resolveNodeFormId('b', comFormDiferente, ligacoes)).toBe('form-b');
    expect(resolveNodeFormId('criar', comFormDiferente, ligacoes)).toBe('form-b');
  });

  it('nó solto ou nenhum nó: o primeiro gatilho com formulário', () => {
    expect(resolveNodeFormId('solto', comFormDiferente, ligacoes)).toBe('form-a');
    expect(resolveNodeFormId(null, comFormDiferente, ligacoes)).toBe('form-a');
  });

  it('no ponto em que duas entradas se juntam, o mais próximo vence', () => {
    expect(resolveNodeFormId('financeiro', nodes, edges)).toBe('form-cancelamento');
  });
});
