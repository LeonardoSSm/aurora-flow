import type { SolicitationHistoryEntity } from '../../../database/entities';
import type { SolicitationHistoryEventType } from '../../../common/enums/solicitation-history-event-type.enum';
import type { SolicitationPriority } from '../../../common/enums/solicitation-priority.enum';
import type { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';

export type PublicTimelineEvent = {
  eventType: SolicitationHistoryEventType;
  label: string;
  createdAt: Date;
};

export type PublicAttachmentDto = {
  id: string;
  originalName: string;
  sizeBytes: number;
  createdAt: Date;
};

export type PublicSolicitationDto = {
  number: string;
  title: string;
  status: SolicitationStatus;
  statusLabel: string;
  priority: SolicitationPriority;
  currentStage: string | null;
  slaStatus: string | null;
  slaDueAt: Date | null;
  formName: string;
  createdAt: Date;
  updatedAt: Date;
  timeline: PublicTimelineEvent[];
  attachments: PublicAttachmentDto[];
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  canceled: 'Cancelado',
  new: 'Novo',
  in_analysis: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  waiting_integration: 'Aguardando integração',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const TIMELINE_EVENT_LABELS: Record<string, ((entry: SolicitationHistoryEntity) => string) | string> = {
  created: 'Solicitação recebida',
  status_changed: (entry) =>
    `Status atualizado para ${STATUS_LABELS[entry.toValue ?? ''] ?? entry.toValue ?? ''}`,
  proposal_sent: 'Proposta de resposta enviada, aguardando sua aprovação',
  proposal_approved: 'Você aprovou a proposta de resposta',
  proposal_rejected: 'Você reprovou a proposta de resposta',
};

const PUBLIC_EVENT_TYPES = new Set([
  'created',
  'status_changed',
  'proposal_sent',
  'proposal_approved',
  'proposal_rejected',
]);

export function toPublicTimelineEvents(history: SolicitationHistoryEntity[]): PublicTimelineEvent[] {
  return history
    .filter((entry) => PUBLIC_EVENT_TYPES.has(entry.eventType))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((entry) => {
      const labelFn = TIMELINE_EVENT_LABELS[entry.eventType];
      const label =
        typeof labelFn === 'function' ? labelFn(entry) : (labelFn ?? entry.eventType);
      return { eventType: entry.eventType, label, createdAt: entry.createdAt };
    });
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
