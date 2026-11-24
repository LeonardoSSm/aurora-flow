import { describe, expect, it } from 'vitest';
import { defaultNodeData } from '../../hooks/useFlowEditor';
import {
  ENABLED_FLOW_NODE_TYPES,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeType,
} from '../../types/flow.types';
import { validateFlow } from '../flow-validation';
import { getNodeIssues } from '../node-issues';

const fields = (type: string, d: FlowNodeData) =>
  getNodeIssues(type, d).map((issue) => issue.field);

/** O nó acusado como "não configurado" pela validação do fluxo (sem contar ligações). */
function flaggedByValidation(type: FlowNodeType, data: FlowNodeData): boolean {
  const node: FlowNode = { id: 'n', type, position: { x: 0, y: 0 }, data };
  return validateFlow([node], []).some((e) => e.type === 'unconfigured_node' && e.nodeId === 'n');
}

describe('getNodeIssues — regras do painel', () => {
  it('só conta o campo visível do agendamento', () => {
    expect(getNodeIssues('trigger_scheduled', { mode: 'interval' })).toEqual([
      { field: 'intervalValue', message: 'Informe um valor >= 1.' },
    ]);
    expect(getNodeIssues('trigger_scheduled', { mode: 'cron' })).toEqual([
      { field: 'cronExpression', message: 'Informe a expressão cron.' },
    ]);
    expect(
      getNodeIssues('trigger_scheduled', { mode: 'cron', cronExpression: '0 8 * * *' }),
    ).toEqual([]);
  });

  it('filtro de payload guardado como texto cru é JSON inválido', () => {
    expect(fields('trigger_webhook_received', { payloadFilters: '{"a":' as never })).toEqual([
      'payloadFilters',
    ]);
    expect(fields('trigger_webhook_received', { payloadFilters: { type: 'x' } })).toEqual([]);
  });

  it.skip('REMOVED cycle-02 aprovação: título e aprovadores conforme a origem', () => {
    expect(fields('action_create_approval', {})).toEqual(['title', 'approvers']);
    expect(
      getNodeIssues('action_create_approval', {
        title: 'T',
        approverEmails: ['ok@empresa.com', 'lixo'],
      }),
    ).toEqual([{ field: 'approvers', message: 'E-mail inválido: lixo' }]);
    expect(fields('action_create_approval', { title: 'T', approverSourceMode: 'field' })).toEqual([
      'approverFieldCode',
    ]);
    expect(fields('action_create_approval', { title: 'T', approverSourceMode: 'dynamic' })).toEqual(
      ['approversPath'],
    );
    expect(
      fields('action_create_approval', { title: 'T', approverSourceMode: 'phase_role' }),
    ).toEqual([]);
  });

  it('operação ERP só cobra a operação depois do conector', () => {
    expect(fields('action_erp_operation', {})).toEqual(['connectorId']);
    expect(fields('action_erp_operation', { connectorId: 'c1' })).toEqual(['templateId']);
  });

  it('WhatsApp só cobra o número no destinatário fixo', () => {
    expect(fields('action_send_whatsapp', { message: 'oi' })).toEqual([]);
    expect(fields('action_send_whatsapp', { message: 'oi', recipientType: 'custom' })).toEqual([
      'customPhone',
    ]);
  });

  it.skip('REMOVED cycle-02 criar solicitação: o título segue o modo (fluxos antigos com titlePath = payload)', () => {
    expect(fields('action_create_solicitation_from_payload', {})).toEqual(['titleTemplate']);
    expect(
      fields('action_create_solicitation_from_payload', { titleSourceMode: 'payload' }),
    ).toEqual(['titlePath']);
    expect(
      fields('action_create_solicitation_from_payload', { titlePath: 'header.titulo' }),
    ).toEqual([]);
  });

  it('notificação usa as pendências da própria configuração', () => {
    expect(fields('action_notification', defaultNodeData('action_notification'))).toEqual([
      'content',
      'title',
      'recipients',
    ]);
  });

  it('nós sem campo obrigatório ficam prontos', () => {
    for (const type of ['trigger_webhook_received', 'condition_always_true']) {
      expect(getNodeIssues(type, {})).toEqual([]);
    }
  });
});

describe('getNodeIssues × validateFlow', () => {
  it.each(ENABLED_FLOW_NODE_TYPES)(
    '%s recém-criado: modal e validação concordam se falta configurar',
    (type) => {
      const data = defaultNodeData(type);
      expect(getNodeIssues(type, data).length > 0).toBe(flaggedByValidation(type, data));
    },
  );

  const configured: Array<[FlowNodeType, FlowNodeData]> = [
    ['trigger_scheduled', { mode: 'interval', intervalValue: 15, intervalUnit: 'minutes' }],
    [
      'condition_field_value',
      { fieldCode: 'valor_total', operator: 'greater_than', value: '10000' },
    ],
    ['action_send_email', { toEmail: 'a@b.com' }],
    ['action_webhook', { webhookUrl: 'https://x', method: 'POST' }],
    ['action_http_check', { url: 'https://x', method: 'GET' }],
    ['action_erp_operation', { connectorId: 'c1', templateId: 't1' }],
    ['action_run_flow', { flowId: 'f1', mode: 'sync' }],
  ];
  it.each(configured)('%s configurado: nenhum dos dois acusa', (type, data) => {
    expect(getNodeIssues(type, data)).toEqual([]);
    expect(flaggedByValidation(type, data)).toBe(false);
  });
});
