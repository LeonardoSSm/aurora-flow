import { isValidEmail } from '../../../lib/email-list';
import type { FlowNodeData } from '../types/flow.types';
import { getNotificationConfigIssues } from './notification-config';

/**
 * Pendência de configuração de um nó, como o modal a mostra: um campo visível com erro.
 * `field` é a chave em `node.data` (ou um nome de grupo, ex. `approvers`) — as etapas do modal
 * declaram quais campos lhes pertencem para marcar "Falta preencher".
 */
export interface NodeIssue {
  field: string;
  message: string;
}

export type ApproverSourceMode = 'fixed' | 'dynamic' | 'phase_role' | 'field';

/** Modo de origem dos aprovadores de action_create_approval; ausente/desconhecido = 'fixed'. */
export function getApproverSourceMode(d: FlowNodeData): ApproverSourceMode {
  return d.approverSourceMode === 'dynamic' ||
    d.approverSourceMode === 'phase_role' ||
    d.approverSourceMode === 'field'
    ? d.approverSourceMode
    : 'fixed';
}

/** E-mails de aprovador (modo lista fixa) que não são e-mail válido. */
export function getInvalidApproverEmails(d: FlowNodeData): string[] {
  return Array.isArray(d.approverEmails)
    ? d.approverEmails.filter((email) => typeof email !== 'string' || !isValidEmail(email))
    : [];
}

export function isApproverSourceConfigured(d: FlowNodeData): boolean {
  switch (getApproverSourceMode(d)) {
    case 'fixed':
      return (
        (Array.isArray(d.assignedUserIds) && d.assignedUserIds.length > 0) ||
        (Array.isArray(d.approverRoleCodes) && d.approverRoleCodes.length > 0) ||
        (Array.isArray(d.approverEmails) && d.approverEmails.length > 0)
      );
    case 'dynamic':
      return !!String(d.approversPath ?? '').trim();
    case 'field':
      return !!String(d.approverFieldCode ?? '').trim();
    case 'phase_role':
      return true; // resolvido em runtime, nada a configurar aqui
  }
}

const blank = (value: unknown) => !String(value ?? '').trim();

/**
 * Pendências do nó com as mesmas regras e mensagens dos `error=` do painel de configuração —
 * só campos visíveis contam (ex.: a expressão cron só no modo cron). Vazio = "Pronto".
 * A validação do fluxo (`validateFlow`) continua sendo a autoridade ao salvar/ativar.
 */
export function getNodeIssues(type: string, d: FlowNodeData): NodeIssue[] {
  const issues: NodeIssue[] = [];
  const add = (when: boolean, field: string, message: string) => {
    if (when) issues.push({ field, message });
  };

  switch (type) {
    case 'trigger_webhook_received':
      // O painel guarda o texto cru quando o JSON não é um objeto válido.
      add(typeof d.payloadFilters === 'string', 'payloadFilters', 'Informe um objeto JSON válido.');
      break;

    case 'trigger_scheduled':
      if (d.mode === 'cron') {
        add(blank(d.cronExpression), 'cronExpression', 'Informe a expressão cron.');
      } else {
        add(
          !d.intervalValue || Number(d.intervalValue) < 1,
          'intervalValue',
          'Informe um valor >= 1.',
        );
      }
      break;

    case 'condition_field_value':
      add(!d.fieldCode, 'fieldCode', 'Selecione um campo para continuar.');
      break;

    case 'condition_response_value':
      add(blank(d.path), 'path', 'Informe o caminho no corpo da resposta.');
      break;

    case 'condition_approval_result':
      add(!d.operator, 'operator', 'Selecione o operador.');
      add(!d.value, 'value', 'Selecione o resultado.');
      break;

    case 'condition_solicitation_status':
      add(!d.operator, 'operator', 'Selecione o operador.');
      add(!d.value, 'value', 'Selecione o status.');
      break;

    case 'condition_solicitation_priority':
      add(!d.operator, 'operator', 'Selecione o operador.');
      add(!d.value, 'value', 'Selecione a prioridade.');
      break;

    case 'action_send_email':
      add(!d.toEmail, 'toEmail', 'Informe ao menos um destinatário.');
      break;

    case 'action_webhook':
      add(!d.webhookUrl, 'webhookUrl', 'Informe a URL do endpoint.');
      break;

    case 'action_http_check':
      add(blank(d.url), 'url', 'Informe a URL a verificar.');
      break;

    case 'action_notify_users':
      add(
        !Array.isArray(d.userIds) || d.userIds.length === 0,
        'userIds',
        'Selecione ao menos um usuário.',
      );
      add(blank(d.message), 'message', 'A mensagem não pode estar vazia.');
      break;

    case 'action_google_sheets':
      add(!d.spreadsheetId, 'spreadsheetId', 'Informe o ID da planilha.');
      break;

    case 'action_update_solicitation_status':
    case 'action_move_kanban_card':
      add(!d.status, 'status', 'Selecione o novo status.');
      break;

    case 'action_create_approval': {
      add(blank(d.title), 'title', 'Informe o título da aprovação.');
      const mode = getApproverSourceMode(d);
      if (mode === 'fixed') {
        add(
          !isApproverSourceConfigured(d),
          'approvers',
          'Selecione ao menos um aprovador (usuário ou e-mail).',
        );
        const invalid = getInvalidApproverEmails(d);
        add(invalid.length > 0, 'approvers', `E-mail inválido: ${invalid.join(', ')}`);
      } else if (mode === 'field') {
        add(blank(d.approverFieldCode), 'approverFieldCode', 'Escolha o campo do formulário.');
      } else if (mode === 'dynamic') {
        add(blank(d.approversPath), 'approversPath', 'Informe o caminho no payload.');
      }
      break;
    }

    case 'action_create_solicitation_from_payload': {
      // Sem modo salvo, fluxos antigos com titlePath abrem no modo payload (mesma regra do painel).
      const titleSourceMode = d.titleSourceMode ?? (blank(d.titlePath) ? 'template' : 'payload');
      if (titleSourceMode === 'template') {
        add(blank(d.titleTemplate), 'titleTemplate', 'Informe o título da tarefa.');
      } else {
        add(blank(d.titlePath), 'titlePath', 'Informe o caminho (dot-path) do título.');
      }
      break;
    }

    case 'action_forward_to_process':
      add(blank(d.formId), 'formId', 'Escolha o processo de destino.');
      break;

    case 'action_assign_responsible':
      add(!d.userId, 'userId', 'Selecione um responsável.');
      break;

    case 'action_send_whatsapp':
      add(
        String(d.recipientType ?? 'requester') === 'custom' && blank(d.customPhone),
        'customPhone',
        'Informe o número fixo.',
      );
      add(blank(d.message), 'message', 'A mensagem não pode estar vazia.');
      break;

    case 'action_run_flow':
      add(!d.flowId, 'flowId', 'Selecione o fluxo a ser chamado.');
      break;

    case 'action_erp_operation':
      add(blank(d.connectorId), 'connectorId', 'Selecione um conector ERP.');
      add(!blank(d.connectorId) && blank(d.templateId), 'templateId', 'Selecione a operação.');
      break;

    case 'action_ai_agent':
      add(blank(d.agentSlug), 'agentSlug', 'Escolha o agente.');
      add(blank(d.apiKey), 'apiKey', 'Informe a chave de API.');
      break;

    case 'action_wait_for_phase_fields':
    case 'action_move_phase':
      add(!d.phaseId, 'phaseId', 'Selecione a fase.');
      break;

    case 'action_notification':
      for (const issue of getNotificationConfigIssues(d)) issues.push(issue);
      break;
  }

  return issues;
}
