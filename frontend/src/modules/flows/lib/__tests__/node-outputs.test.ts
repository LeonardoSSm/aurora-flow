import { describe, expect, it } from 'vitest';
import { buildVariableGroups, getAncestors } from '../node-outputs';

type N = { id: string; type: string; data?: { label?: string } };
const node = (id: string, type: string, label?: string): N => ({ id, type, data: { label } });
const edge = (source: string, target: string) => ({ source, target });
const labelOf = (n: { type?: string; data?: unknown }) =>
  (n.data as { label?: string } | undefined)?.label || String(n.type);

describe('getAncestors', () => {
  it('sobe pelas conexões, do mais próximo ao mais distante, sem repetir', () => {
    const nodes = [
      node('t', 'trigger_webhook_received'),
      node('a', 'action_create_approval'),
      node('b', 'action_send_email'),
      node('x', 'action_webhook'),
    ];
    const edges = [edge('t', 'a'), edge('a', 'b'), edge('t', 'b'), edge('x', 'x')];
    expect(getAncestors('b', nodes, edges).map((n) => n.id)).toEqual(['a', 't']);
    expect(getAncestors('t', nodes, edges)).toEqual([]);
  });
});

describe('buildVariableGroups', () => {
  it('gatilho de webhook: "Deste gatilho" e caminhos do payload', () => {
    const nodes = [node('t', 'trigger_webhook_received')];
    const groups = buildVariableGroups('t', nodes, [], labelOf);
    expect(groups.own?.title).toBe('Deste gatilho');
    expect(groups.own?.items.map((v) => v.name)).toContain('payload.caminho.do.campo');
    expect(groups.upstream).toEqual([]);
    expect(groups.formFields).toBeFalsy();
  });

  it('ação depois do gatilho: "Do gatilho · {nome}"', () => {
    const nodes = [
      node('t', 'trigger_webhook_received', 'Pedido de compra'),
      node('a', 'action_http_check'),
    ];
    const groups = buildVariableGroups('a', nodes, [edge('t', 'a')], labelOf);
    expect(groups.own?.title).toMatch(/Deste nó/);
    expect(groups.upstream.map((g) => g.title)).toEqual(['Do gatilho · Pedido de compra']);
    expect(groups.formFields).toBeFalsy();
  });

  it('nós anteriores com saída também aparecem; o mais próximo primeiro', () => {
    const nodes = [
      node('t', 'trigger_webhook_received', 'Gatilho'),
      node('a', 'action_http_check', 'Verificação HTTP'),
      node('e', 'action_send_email'),
    ];
    const groups = buildVariableGroups('e', nodes, [edge('t', 'a'), edge('a', 'e')], labelOf);
    expect(groups.own).toBeUndefined();
    expect(groups.upstream.map((g) => g.title)).toEqual(['Do gatilho · Gatilho']);
  });

  it('Verificação HTTP: caminhos de resposta, sem {{ }}', () => {
    const groups = buildVariableGroups('h', [node('h', 'action_http_check')], [], labelOf);
    expect(groups.own).toMatchObject({
      paths: true,
      title: 'Deste nó · use em “Valor da verificação”',
    });
    expect(groups.own?.items.map((v) => v.name)).toEqual(['data.status', 'items.0.aprovado']);
  });

  it('agendado e webhook explicam que não geram dados', () => {
    expect(buildVariableGroups('s', [node('s', 'trigger_scheduled')], [], labelOf).note).toMatch(
      /não traz dados/,
    );
    const webhook = buildVariableGroups(
      'w',
      [node('t', 'trigger_scheduled'), node('w', 'action_webhook')],
      [edge('t', 'w')],
      labelOf,
    );
    expect(webhook.note).toMatch(/dispara e esquece/);
    expect(webhook.upstream).toEqual([]);
    expect(webhook.formFields).toBe(false);
  });
});
