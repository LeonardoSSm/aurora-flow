import type { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';

export type MyWorkBlock = {
  pendingApprovals: number;
  myActiveSolicitations: number;
  myFormsCount: number;
  myFormsPublished: number;
};

export type SolicitationsBlock = {
  total: number;
  byStatus: Partial<Record<SolicitationStatus, number>>;
  slaBreached: number;
  slaWarning: number;
  createdLast7Days: number;
  createdLast30Days: number;
  completedLast30Days: number;
  avgCompletionHours: number | null;
};

export type TrendPoint = {
  date: string;
  created: number;
  completed: number;
};

export type TrendBlock = {
  period: '30d';
  data: TrendPoint[];
};

export type RecentActivityItem = {
  type: 'solicitation_created' | 'solicitation_moved' | 'approval_decided' | 'flow_executed';
  description: string;
  solicitationNumber?: string;
  actorName?: string;
  occurredAt: Date;
};

export type FlowsBlock = {
  activeFlows: number;
  executionsToday: number;
  failedToday: number;
};

export type ApprovalsBlock = {
  pendingTotal: number;
  decidedToday: number;
};

export type OperationalDashboardDto = {
  myWork: MyWorkBlock;
  solicitations: SolicitationsBlock;
  trend: TrendBlock;
  recentActivity: RecentActivityItem[];
  flows: FlowsBlock | null;
  approvals: ApprovalsBlock | null;
};
