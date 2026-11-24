import { api } from '../../../services/api';
import type {
  Approval,
  ApprovalDecisionValue,
  ApprovalStep,
  ApprovalStepWithContext,
} from '../../solicitations/types';

export type CreateApprovalInput = {
  title: string;
  description?: string;
  assignedUserIds?: string[];
  /** Aprovadores por e-mail: quem tem usuário ativo decide logado; os demais recebem um link. */
  assignedEmails?: string[];
  mode?: 'parallel' | 'sequential';
  /** Perfis que aprovam (basta uma pessoa de cada perfil). */
  assignedRoleCodes?: string[];
  /** Em paralelo: todos precisam aprovar (padrão: basta um). */
  requireAll?: boolean;
  /** Em ordem: chaves user:<id> / role:<código> / email:<e-mail>. */
  assigneeOrder?: string[];
};

export type DecideApprovalStepInput = {
  decision: ApprovalDecisionValue;
  comment?: string;
};

export async function fetchMyPendingApprovals(): Promise<ApprovalStepWithContext[]> {
  const { data } = await api.get<ApprovalStepWithContext[]>('/approvals/my-pending');
  return data;
}

export async function fetchSolicitationApprovals(solicitationId: string): Promise<Approval[]> {
  const { data } = await api.get<Approval[]>(`/solicitations/${solicitationId}/approvals`);
  return data;
}

export async function createApproval(
  solicitationId: string,
  dto: CreateApprovalInput,
): Promise<Approval> {
  const { data } = await api.post<Approval>(`/solicitations/${solicitationId}/approvals`, dto);
  return data;
}

export async function decideApprovalStep(
  stepId: string,
  dto: DecideApprovalStepInput,
): Promise<ApprovalStep> {
  const { data } = await api.post<ApprovalStep>(`/approvals/${stepId}/decide`, dto);
  return data;
}

export type ResendApprovalLinkResult = { sent: boolean; sentTo: string; error?: string };

/** Gera um link novo (o anterior deixa de valer) e o reenvia ao aprovador externo da etapa. */
export async function resendApprovalLink(stepId: string): Promise<ResendApprovalLinkResult> {
  const { data } = await api.post<ResendApprovalLinkResult>(`/approvals/${stepId}/resend-link`);
  return data;
}

export async function cancelApproval(approvalId: string): Promise<Approval> {
  const { data } = await api.patch<Approval>(`/approvals/${approvalId}/cancel`);
  return data;
}
