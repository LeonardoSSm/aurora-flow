import type { ActionCreateApprovalData, ActionNotificationData } from '../types/flow.types';

/**
 * Texto padrão do "Avisar quem aprova por e-mail" do nó Criar aprovação — o editor mostra o mesmo
 * texto (frontend/src/modules/flows/lib/approval-email.ts) para o usuário partir dele.
 */
export const DEFAULT_APPROVAL_EMAIL_SUBJECT = 'Aprovação pendente: {{approval_title}}';
export const DEFAULT_APPROVAL_EMAIL_BODY =
  'Olá,\n\n' +
  'Há uma aprovação aguardando a sua decisão.\n\n' +
  '{{approval_title}}\n' +
  '{{approval_description}}\n\n' +
  'Solicitação: {{solicitation_title}}\n\n' +
  'Abrir a aprovação: {{approval_link}}';

export const APPROVAL_EMAIL_SUBJECT_MAX = 200;
export const APPROVAL_EMAIL_BODY_MAX = 4000;

/** Texto preenchido (sem espaços nas pontas) ou null — vazio cai no texto padrão. */
function filled(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

export function isApprovalEmailEnabled(data: ActionCreateApprovalData): boolean {
  return data.emailApprovers?.enabled === true;
}

/**
 * O aviso vira um nó Notificação "por dentro": canal e-mail, em segundo plano (o fluxo não espera
 * o SMTP) e com chave de idempotência pela aprovação — reentrega do evento não manda de novo.
 */
export function approvalEmailNotification(
  data: ActionCreateApprovalData,
  approvalId: string,
  userIds: string[],
): ActionNotificationData {
  return {
    label: 'E-mail para quem aprova',
    channel: 'email',
    recipients: [{ type: 'users', userIds }],
    title: filled(data.emailApprovers?.subject) ?? DEFAULT_APPROVAL_EMAIL_SUBJECT,
    content: filled(data.emailApprovers?.body) ?? DEFAULT_APPROVAL_EMAIL_BODY,
    deliveryMode: 'background',
    continueOnFailure: true,
    idempotencyKeyTemplate: `aprovacao-email-${approvalId}`,
  };
}
