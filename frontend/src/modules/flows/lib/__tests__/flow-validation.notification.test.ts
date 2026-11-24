import { describe, expect, it } from 'vitest';
import type { FlowEdge, FlowNode, FlowNodeData, FlowNodeType } from '../../types/flow.types';
import { FLOW_NODE_TYPES } from '../../types/flow.types';
import { validateFlow } from '../flow-validation';

function node(id: string, type: FlowNodeType, data: FlowNodeData = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}
const edge = (source: string, target: string): FlowEdge => ({ id: `${source}-${target}`, source, target });

const trigger = node('trigger', 'trigger_webhook_received');
const validNotification = (data: FlowNodeData = {}) =>
  node('n1', 'action_notification', {
    channel: 'email',
    title: 'Assunto',
    content: 'Corpo',
    recipients: [{ type: 'requester' }],
    ...data,
  });

describe('validateFlow — nó action_notification', () => {
  it('o tipo é conhecido pelo editor', () => {
    expect((FLOW_NODE_TYPES as readonly string[]).includes('action_notification')).toBe(true);
  });

  it('configuração válida não gera erro', () => {
    expect(validateFlow([trigger, validNotification()], [edge('trigger', 'n1')])).toEqual([]);
  });

  it('nó recém-arrastado (sem destinatário/mensagem) bloqueia o salvamento com mensagem clara', () => {
    const fresh = node('n1', 'action_notification', {
      channel: 'email',
      recipients: [],
      title: '',
      content: '',
    });
    const errors = validateFlow([trigger, fresh], [edge('trigger', 'n1')]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'unconfigured_node', nodeId: 'n1' });
    expect(errors[0].message).toContain('Nó "action_notification"');
  });

  it('usa o rótulo do nó na mensagem quando existe', () => {
    const errors = validateFlow(
      [trigger, validNotification({ label: 'Avisar aprovador', content: '' })],
      [edge('trigger', 'n1')],
    );
    expect(errors[0].message).toMatch(/^Nó "Avisar aprovador": /);
  });

  it.each([
    [{ channel: undefined }, /canal/i],
    [{ content: '' }, /mensagem/i],
    [{ title: '' }, /assunto/i],
    [{ recipients: [] }, /destinatário/i],
    [{ recipients: [{ type: 'users', userIds: [] }] }, /usuário/i],
    [{ recipients: [{ type: 'custom', value: 'sem-arroba' }] }, /e-mail inválido/i],
    [{ delayMinutes: -3 }, /atraso/i],
    [{ retryPolicy: { maxAttempts: 9 } }, /tentativas/i],
  ] as Array<[Partial<FlowNodeData>, RegExp]>)('rejeita %j', (override, expected) => {
    const errors = validateFlow([trigger, validNotification(override as FlowNodeData)], [edge('trigger', 'n1')]);
    expect(errors.some((e) => e.type === 'unconfigured_node' && expected.test(e.message))).toBe(true);
  });

  it('nó desconectado continua sendo apontado como nos demais tipos', () => {
    const errors = validateFlow([trigger, validNotification()], []);
    expect(errors.map((e) => e.type)).toContain('disconnected_node');
  });

  it('COMPATIBILIDADE: fluxos antigos com os nós de comunicação existentes seguem válidos', () => {
    const legacy = [
      trigger,
      node('mail', 'action_send_email', { toEmail: 'a@b.com' }),
      node('notify', 'action_notify_users', { userIds: ['u1'], message: 'oi' }),
      node('wa', 'action_send_whatsapp', { recipientType: 'requester', message: 'oi' }),
    ];
    const errors = validateFlow(legacy, [edge('trigger', 'mail'), edge('mail', 'notify'), edge('notify', 'wa')]);
    expect(errors).toEqual([]);
  });
});
