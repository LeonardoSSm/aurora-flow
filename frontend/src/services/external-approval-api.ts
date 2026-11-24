import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

// Instância própria e sem interceptors: a página do link é pública (sem login, sem refresh de sessão).
const publicApi = axios.create({ baseURL: apiBaseUrl });

export type ExternalApprovalState = 'pending' | 'decided' | 'expired' | 'closed';
export type ExternalApprovalDecision = 'approved' | 'rejected';

export type ExternalApprovalView = {
  state: ExternalApprovalState;
  orgName: string;
  /** E-mail do aprovador mascarado (g***@dominio.com), para lembrar qual digitar na confirmação. */
  emailHint?: string;
  expiresAt?: string | null;
  approval?: { title: string; description: string | null };
  solicitation?: {
    number: string;
    title: string;
    description: string | null;
    requesterName: string | null;
    createdAt: string;
    answers: Array<{ label: string; value: string }>;
  };
  decision?: { decision: ExternalApprovalDecision; decidedAt: string | null };
};

export type DecideExternalApprovalInput = {
  decision: ExternalApprovalDecision;
  comment?: string;
  confirmEmail: string;
};

export async function fetchExternalApproval(token: string): Promise<ExternalApprovalView> {
  const { data } = await publicApi.get<ExternalApprovalView>(
    `/public/approvals/external/${encodeURIComponent(token)}`,
  );
  return data;
}

export async function decideExternalApproval(
  token: string,
  input: DecideExternalApprovalInput,
): Promise<ExternalApprovalView> {
  const { data } = await publicApi.post<ExternalApprovalView>(
    `/public/approvals/external/${encodeURIComponent(token)}/decide`,
    input,
  );
  return data;
}

export type ExternalApprovalError = {
  status: number | null;
  message: string;
  /** Tentativas de confirmação de e-mail que ainda restam (só no 403). */
  remainingAttempts?: number;
  /** Estado em que o link ficou (só no 410). */
  state?: Exclude<ExternalApprovalState, 'pending'>;
};

/** Extrai status, mensagem e detalhes do erro da API, sem expor nada além do que o servidor devolveu. */
export function parseExternalApprovalError(error: unknown, fallback: string): ExternalApprovalError {
  if (!axios.isAxiosError(error)) return { status: null, message: fallback };
  const data = error.response?.data as
    | { message?: unknown; remainingAttempts?: unknown; state?: unknown }
    | undefined;
  const message = Array.isArray(data?.message) ? data?.message[0] : data?.message;
  const state = data?.state;
  return {
    status: error.response?.status ?? null,
    message: typeof message === 'string' && message ? message : fallback,
    ...(typeof data?.remainingAttempts === 'number' ? { remainingAttempts: data.remainingAttempts } : {}),
    ...(state === 'decided' || state === 'expired' || state === 'closed' ? { state } : {}),
  };
}
