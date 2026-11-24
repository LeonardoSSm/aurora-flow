export enum SolicitationHistoryEventType {
  CREATED = 'created',
  STATUS_CHANGED = 'status_changed',
  ASSIGNEE_CHANGED = 'assignee_changed',
  PRIORITY_CHANGED = 'priority_changed',
  PHASE_CHANGED = 'phase_changed',
  COMMENT = 'comment',
  PROPOSAL_SENT = 'proposal_sent',
  PROPOSAL_APPROVED = 'proposal_approved',
  PROPOSAL_REJECTED = 'proposal_rejected',
  PHASE_APPROVAL_REQUESTED = 'phase_approval_requested',
  PHASE_APPROVAL_APPROVED = 'phase_approval_approved',
  PHASE_APPROVAL_REJECTED = 'phase_approval_rejected',
  PHASE_SLA_EXTENDED = 'phase_sla_extended',
  /** Aprovada para seguir, mas a trava de saída da fase segurou o card (o que falta vai na mensagem). */
  PHASE_ADVANCE_BLOCKED = 'phase_advance_blocked',
  /** O card foi encaminhado para outro processo (registro no card de origem). */
  FORWARDED = 'forwarded',
}
