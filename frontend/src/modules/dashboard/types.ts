import type { KanbanCard } from '../solicitations/types';

/** Por que a solicitação está em "Para mim agora". */
export type PanelReason = 'approval' | 'assigned' | 'phase';

export type PanelItem = KanbanCard & {
  phaseLabel: string;
  phaseColor: string;
  reason: PanelReason;
};

export type PanelPhase = {
  id: string;
  label: string;
  color: string;
  count: number;
  late: number;
};

export type PanelProcess = {
  formId: string;
  formName: string;
  active: number;
  late: number;
  warning: number;
  oldest: { phaseId: string; phaseLabel: string; enteredAt: string } | null;
  phases: PanelPhase[];
};

/** GET /dashboard/panel */
export type DashboardPanel = {
  forMe: { total: number; late: number; items: PanelItem[] };
  processes: PanelProcess[];
  alerts: { failedFlowsToday: number | null };
};
