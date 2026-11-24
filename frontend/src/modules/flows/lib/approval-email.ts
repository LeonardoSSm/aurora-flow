/**
 * Mesmo texto padrão do backend (flows/notification/approval-email.ts): é o que sai quando o
 * assunto/texto do "Avisar quem aprova por e-mail" ficam vazios — o modal parte dele.
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

export type ApprovalEmailConfig = { enabled?: boolean; subject?: string; body?: string };

export function readApprovalEmail(raw: unknown): ApprovalEmailConfig {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ApprovalEmailConfig) : {};
}
