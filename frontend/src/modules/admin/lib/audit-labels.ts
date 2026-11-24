/** Rótulos em português para a linha do tempo da Auditoria. Código desconhecido aparece como veio. */

export const AUDIT_MODULES: Array<{ code: string; label: string }> = [
  { code: 'auth', label: 'Acesso' },
  { code: 'forms', label: 'Processos' },
  { code: 'solicitations', label: 'Solicitações' },
  { code: 'approvals', label: 'Aprovações' },
  { code: 'responses', label: 'Registros' },
  { code: 'users', label: 'Usuários' },
  { code: 'ai', label: 'LOPS IA' },
];

const MODULE_LABEL: Record<string, string> = Object.fromEntries(
  AUDIT_MODULES.map((m) => [m.code, m.label]),
);

const ENTITY_LABEL: Record<string, string> = {
  form: 'processo',
  form_member: 'acesso ao processo',
  submission: 'formulário',
  solicitation: 'solicitação',
  approval: 'aprovação',
  user: 'usuário',
  lops_ai_session: 'sessão da LOPS IA',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
  archive: 'Arquivamento',
  duplicate: 'Duplicação',
  status_change: 'Mudança de status',
  submit: 'Envio',
  export_csv: 'Exportação CSV',
  export_pdf: 'Exportação PDF',
  export_xlsx: 'Exportação Excel',
  login: 'Entrada no sistema',
  password_set: 'Senha definida',
  approve: 'Aprovação concedida',
  reject: 'Reprovação',
  cancel: 'Cancelamento',
  access_grant: 'Acesso concedido',
  access_revoke: 'Acesso removido',
  access_update: 'Acesso alterado',
  assignee_change: 'Troca de responsável',
  kanban_move: 'Mudança de fase',
  'lops_ai.process_created': 'Processo criado pela IA',
  'lops_ai.session_created': 'Sessão iniciada',
};

/** Filtros de ação mostrados na tela (os mais usados). */
export const AUDIT_ACTION_FILTERS = [
  'create',
  'update',
  'status_change',
  'kanban_move',
  'submit',
  'approve',
  'access_grant',
  'export_csv',
];

export function auditModuleLabel(code: string): string {
  return MODULE_LABEL[code] ?? code;
}

export function auditEntityLabel(code: string): string {
  return ENTITY_LABEL[code] ?? code;
}

export function auditActionLabel(code: string): string {
  return AUDIT_ACTION_LABEL[code] ?? code;
}

const MAX_VALUE_LENGTH = 60;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'nenhum';
    if (value.every((v) => ['string', 'number'].includes(typeof v))) {
      return truncate(value.join(', '));
    }
    return value.length === 1 ? '1 item' : `${value.length} itens`;
  }
  if (typeof value === 'object') {
    const size = Object.keys(value as object).length;
    return size === 1 ? '1 campo' : `${size} campos`;
  }
  return truncate(String(value));
}

function truncate(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

/** Resumo legível dos primeiros campos do evento (nada de "[object Object]"). */
export function formatAuditPayload(payload: Record<string, unknown> | null, max = 3): string {
  if (!payload) return '';
  return Object.entries(payload)
    .slice(0, max)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(' · ');
}
