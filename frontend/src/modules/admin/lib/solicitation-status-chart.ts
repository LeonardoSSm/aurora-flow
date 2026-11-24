/**
 * Status de solicitação no painel operacional. Os códigos antigos (open, waiting,
 * resolved, canceled) continuam no banco e caem no mesmo grupo do equivalente novo —
 * senão o gráfico mostra duas barras "Nova" e a conta de ativas sai errada.
 */
const STATUS_GROUP: Record<string, { label: string; color: string; closed?: boolean }> = {
  new: { label: 'Nova', color: '#9ca3af' },
  open: { label: 'Nova', color: '#9ca3af' },
  in_analysis: { label: 'Em análise', color: '#3b82f6' },
  waiting_approval: { label: 'Aguard. aprovação', color: '#f59e0b' },
  waiting: { label: 'Aguard. aprovação', color: '#f59e0b' },
  waiting_integration: { label: 'Aguard. integração', color: '#a78bfa' },
  approved: { label: 'Aprovada', color: '#86efac' },
  in_progress: { label: 'Em andamento', color: '#1d4ed8' },
  completed: { label: 'Concluída', color: '#22c55e', closed: true },
  resolved: { label: 'Concluída', color: '#22c55e', closed: true },
  rejected: { label: 'Rejeitada', color: '#ef4444' },
  cancelled: { label: 'Cancelada', color: '#4b5563', closed: true },
  canceled: { label: 'Cancelada', color: '#4b5563', closed: true },
};

export type StatusChartRow = { label: string; count: number; color: string };

export function buildStatusChart(byStatus: Record<string, number>): StatusChartRow[] {
  const rows = new Map<string, StatusChartRow>();
  for (const [status, count] of Object.entries(byStatus)) {
    const group = STATUS_GROUP[status] ?? { label: status, color: '#9ca3af' };
    const row = rows.get(group.label);
    if (row) row.count += count;
    else rows.set(group.label, { label: group.label, count, color: group.color });
  }
  return [...rows.values()];
}

/** Total menos concluídas e canceladas (inclusive pelos códigos antigos). */
export function countActiveSolicitations(total: number, byStatus: Record<string, number>): number {
  const closed = Object.entries(byStatus)
    .filter(([status]) => STATUS_GROUP[status]?.closed)
    .reduce((sum, [, count]) => sum + count, 0);
  return total - closed;
}
