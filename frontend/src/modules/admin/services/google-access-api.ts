import { api } from '../../../services/api';

export type GoogleAccessAction =
  | 'ok'
  | 'would_revoke'
  | 'revoked'
  | 'would_clear_invalid'
  | 'cleared_invalid'
  | 'error';

export type GoogleAccessAuditEntry = {
  userId: string;
  email: string;
  action: GoogleAccessAction;
  /** Escopos concedidos além do necessário (ex.: o acesso amplo a todas as planilhas). */
  excessScopes: string[];
  error?: string;
};

export type GoogleAccessAuditReport = {
  dryRun: boolean;
  checked: number;
  withBroadAccess: number;
  revoked: number;
  clearedInvalid: number;
  ok: number;
  failed: number;
  users: GoogleAccessAuditEntry[];
};

/** Confere os escopos Google de cada usuário conectado. Não altera nada. */
export async function auditGoogleAccess(): Promise<GoogleAccessAuditReport> {
  const { data } = await api.get<GoogleAccessAuditReport>('/admin/google-access/audit');
  return data;
}

/** Desconecta e revoga no Google quem tem acesso além do necessário (a pessoa precisa reconectar). */
export async function revokeBroadGoogleAccess(): Promise<GoogleAccessAuditReport> {
  const { data } = await api.post<GoogleAccessAuditReport>('/admin/google-access/revoke-broad');
  return data;
}
