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
      node('t', 'trigger_form_submit'),
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
  it('gatilho de formulário: "Deste gatilho" e campos do formulário', () => {
    const nodes = [node('t', 'trigger_form_submit')];
    const groups = buildVariableGroups('t', nodes, [], labelOf);
    expect(groups.own?.title).toBe('Deste gatilho');
    expect(groups.own?.items.map((v) => v.name)).toContain('responder_email');
    expect(groups.upstream).toEqual([]);
    expect(groups.formFields).toBe(true);
  });

  it('ação depois do gatilho: "Deste nó" e "Do gatilho · {nome}"', () => {
    const nodes = [
      node('t', 'trigger_form_submit', 'Pedido de compra'),
      node('a', 'action_create_approval'),
    ];
    const groups = buildVariableGroups('a', nodes, [edge('t', 'a')], labelOf);
    expect(groups.own?.title).toBe('Deste nó');
    expect(groups.own?.items.map((v) => v.name)).toEqual([
      'approval_title',
      'approval_description',
      'approval_link',
    ]);
    expect(groups.upstream.map((g) => g.title)).toEqual(['Do gatilho · Pedido de compra']);
    expect(groups.formFields).toBe(true);
  });

  it('nós anteriores com saída também aparecem; o mais próximo primeiro', () => {
    const nodes = [
      node('t', 'trigger_form_submit', 'Gatilho'),
      node('a', 'action_create_approval', 'Aprovação do gestor'),
      node('e', 'action_send_email'),
    ];
    const groups = buildVariableGroups('e', nodes, [edge('t', 'a'), edge('a', 'e')], labelOf);
    expect(groups.own).toBeUndefined();
    expect(groups.upstream.map((g) => g.title)).toEqual([
      'De · Aprovação do gestor',
      'Do gatilho · Gatilho',
    ]);
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
