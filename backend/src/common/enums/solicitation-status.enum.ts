export enum SolicitationStatus {
  // Legacy values kept for backward compatibility
  OPEN = 'open',
  WAITING = 'waiting',
  RESOLVED = 'resolved',
  CANCELED = 'canceled',

  // Kanban workflow statuses
  NEW = 'new',
  IN_ANALYSIS = 'in_analysis',
  WAITING_APPROVAL = 'waiting_approval',
  IN_PROGRESS = 'in_progress',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WAITING_INTEGRATION = 'waiting_integration',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
