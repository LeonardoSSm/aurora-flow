import { api } from '../../../services/api';

// ─── Users ────────────────────────────────────────────────────────────────────
//
// `role` is a role *code* (string) — any perfil registrado em `/roles`, não
// só os 4 perfis padrão. Ver `services/roles-api.ts` para o catálogo real.

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  /** false = pré-cadastrado sem senha local (entra pelo Google) ou criado pelo login Google. */
  hasPassword: boolean;
  lastLoginAt: string | null;
  areaId: string | null;
  areaName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedUsers = {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FetchUsersParams = {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
};

export type CreateUserPayload = {
  fullName: string;
  email: string;
  /** Opcional: sem senha o usuário fica pré-cadastrado e entra pela primeira vez com o Google. */
  password?: string;
  role?: string;
  areaId?: string | null;
  /** Manda ao e-mail do usuário um link para criar a senha (padrão no backend: true). */
  sendInvite?: boolean;
};

/** Resultado do envio do convite por e-mail. `sent: false` não desfaz a criação do usuário. */
export type UserInviteResult = {
  sent: boolean;
  error?: string;
  expiresAt?: string;
};

export type CreatedUser = AdminUser & { invite?: UserInviteResult };

export type UpdateUserPayload = {
  fullName?: string;
  email?: string;
  password?: string;
  role?: string;
  isActive?: boolean;
  areaId?: string | null;
};

export async function fetchUsers(params?: FetchUsersParams): Promise<PaginatedUsers> {
  const { data } = await api.get<PaginatedUsers>('/users', { params });
  return data;
}

export async function fetchUserById(id: string): Promise<AdminUser> {
  const { data } = await api.get<AdminUser>(`/users/${id}`);
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<CreatedUser> {
  const { data } = await api.post<CreatedUser>('/users', payload);
  return data;
}

/** Envia (ou reenvia) o convite; o link anterior deixa de valer. */
export async function sendUserInvite(id: string): Promise<UserInviteResult> {
  const { data } = await api.post<UserInviteResult>(`/users/${id}/invite`);
  return data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}`, payload);
  return data;
}

export async function deactivateUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type AppSetting = {
  key: string;
  value: string | null;
  description: string | null;
  isPublic: boolean;
  valueType: 'string' | 'boolean' | 'number' | 'json';
  createdAt: string;
  updatedAt: string;
};

export async function fetchSettings(): Promise<AppSetting[]> {
  const { data } = await api.get<AppSetting[]>('/settings');
  return data;
}

export async function updateSetting(key: string, value: string): Promise<AppSetting> {
  const { data } = await api.patch<AppSetting>(`/settings/${key}`, { value });
  return data;
}

export async function bulkUpdateSettings(
  updates: Array<{ key: string; value: string }>,
): Promise<AppSetting[]> {
  const { data } = await api.patch<AppSetting[]>('/settings', { updates });
  return data;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type AuditEvent = {
  id: string;
  actorId: string | null;
  /** Nome de quem fez (só na listagem da Auditoria; null = sistema ou usuário apagado). */
  actorName?: string | null;
  module: string;
  entity: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type PaginatedAudit = {
  data: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FetchAuditParams = {
  page?: number;
  limit?: number;
  module?: string;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

export async function fetchAuditEvents(params?: FetchAuditParams): Promise<PaginatedAudit> {
  const { data } = await api.get<PaginatedAudit>('/audit', { params });
  return data;
}

// ─── Metrics Summary ──────────────────────────────────────────────────────────

export type MetricsSummaryDto = {
  solicitations: {
    total: number;
    byStatus: Record<string, number>;
    slaBreached: number;
    pending: number;
  };
  approvals: {
    pending: number;
    decidedToday: number;
  };
  webhooks: {
    deliveriesToday: number;
    failedDeliveries: number;
  };
  flows: {
    executionsToday: number;
    failedExecutions: number;
  };
  whatsapp: {
    sentToday: number;
    failed: number;
  };
};

export async function fetchMetricsSummary(): Promise<MetricsSummaryDto> {
  const { data } = await api.get<MetricsSummaryDto>('/admin/metrics/summary');
  return data;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export type DashboardStatsResponse = {
  forms: {
    total: number;
    byStatus: Record<string, number>;
  };
  responses: {
    total: number;
    last30Days: number;
  };
  responseTrendLast30Days: Array<{
    date: string;
    count: number;
  }>;
  recentSubmissions: Array<{
    id: string;
    formId: string;
    formName: string;
    responderName: string | null;
    responderEmail: string | null;
    submittedAt: string | null;
  }>;
  recentActivity: AuditEvent[];
};

export type FetchDashboardStatsParams = {
  q?: string;
};

export async function fetchDashboardStats(
  params?: FetchDashboardStatsParams,
): Promise<DashboardStatsResponse> {
  const { data } = await api.get<DashboardStatsResponse>('/dashboard/stats', { params });
  return data;
}

// ─── Operational Dashboard ────────────────────────────────────────────────────

export type OperationalTrendPoint = {
  date: string;
  created: number;
  completed: number;
};

export type OperationalActivityItem = {
  type: 'solicitation_created' | 'solicitation_moved' | 'approval_decided' | 'flow_executed';
  description: string;
  solicitationNumber?: string;
  actorName?: string;
  occurredAt: string;
};

export type OperationalDashboard = {
  myWork: {
    pendingApprovals: number;
    myActiveSolicitations: number;
    myFormsCount: number;
    myFormsPublished: number;
  };
  solicitations: {
    total: number;
    byStatus: Partial<Record<string, number>>;
    slaBreached: number;
    slaWarning: number;
    createdLast7Days: number;
    createdLast30Days: number;
    completedLast30Days: number;
    avgCompletionHours: number | null;
  };
  trend: {
    period: '30d';
    data: OperationalTrendPoint[];
  };
  recentActivity: OperationalActivityItem[];
  flows: {
    activeFlows: number;
    executionsToday: number;
    failedToday: number;
  } | null;
  approvals: {
    pendingTotal: number;
    decidedToday: number;
  } | null;
};

export async function fetchOperationalStats(
  _period?: '7d' | '30d',
): Promise<OperationalDashboard> {
  const { data } = await api.get<OperationalDashboard>('/dashboard/operational-stats');
  return data;
}
