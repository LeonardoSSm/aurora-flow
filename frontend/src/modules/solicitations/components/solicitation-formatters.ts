import type {
  SolicitationHistoryEventType,
  SolicitationOriginType,
  SolicitationPriority,
  SolicitationStatus,
} from '../types';

export const statusOptions: Array<{ value: SolicitationStatus; label: string }> = [
  { value: 'open', label: 'Aberta' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'resolved', label: 'Resolvida' },
  { value: 'canceled', label: 'Cancelada' },
];

export const priorityOptions: Array<{ value: SolicitationPriority; label: string }> = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const statusClasses: Record<SolicitationStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting: 'bg-purple-100 text-purple-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-surface-container-high text-on-surface-variant',
};

const priorityClasses: Record<SolicitationPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};

export function getStatusMeta(status: SolicitationStatus) {
  return statusOptions.find((item) => item.value === status) ?? statusOptions[0];
}

export function getPriorityMeta(priority: SolicitationPriority) {
  return priorityOptions.find((item) => item.value === priority) ?? priorityOptions[1];
}

export function getStatusClass(status: SolicitationStatus): string {
  return statusClasses[status];
}

export function getPriorityClass(priority: SolicitationPriority): string {
  return priorityClasses[priority];
}

export function getOriginLabel(originType: SolicitationOriginType): string {
  if (originType === 'form_submission') return 'Formulário';
  if (originType === 'webhook') return 'Webhook/ERP';
  if (originType === 'process_handoff') return 'Encaminhada de outro processo';
  return 'Manual';
}

export function getHistoryEventLabel(eventType: SolicitationHistoryEventType): string {
  const labels: Record<SolicitationHistoryEventType, string> = {
    created: 'Criação',
    status_changed: 'Status alterado',
    assignee_changed: 'Responsável alterado',
    priority_changed: 'Prioridade alterada',
    phase_changed: 'Fase alterada',
    comment: 'Comentário',
    proposal_sent: 'Proposta enviada',
    proposal_approved: 'Proposta aprovada',
    proposal_rejected: 'Proposta reprovada',
    phase_approval_requested: 'Aprovação de fase solicitada',
    phase_approval_approved: 'Aprovação de fase concluída',
    phase_approval_rejected: 'Aprovação de fase reprovada',
    phase_sla_extended: 'Prazo da fase alterado',
    phase_advance_blocked: 'Aprovada, mas o card não avançou',
    forwarded: 'Encaminhada para outro processo',
  };
  return labels[eventType];
}
