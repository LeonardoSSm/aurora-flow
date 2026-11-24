import type { SolicitationSlaStatus } from '../types';

type SlaInput = {
  slaStatus: SolicitationSlaStatus | null;
  slaDueAt: string | null;
};

export type SlaColor = 'red' | 'amber' | 'green' | 'gray';

export function getSlaLabel(solicitation: SlaInput): string {
  if (!solicitation.slaDueAt || !solicitation.slaStatus) return '';
  switch (solicitation.slaStatus) {
    case 'breached':
      return 'Vencido';
    case 'warning': {
      const pct = computePercentUsed(null, solicitation.slaDueAt);
      return `Atenção: ${pct}% usado`;
    }
    case 'on_track':
      return 'No prazo';
    default:
      return '';
  }
}

export function getSlaColor(solicitation: SlaInput): SlaColor {
  if (!solicitation.slaDueAt || !solicitation.slaStatus) return 'gray';
  switch (solicitation.slaStatus) {
    case 'breached':
      return 'red';
    case 'warning':
      return 'amber';
    case 'on_track':
      return 'green';
    default:
      return 'gray';
  }
}

export function getTimeRemaining(slaDueAt: string | null): string {
  if (!slaDueAt) return '';
  const diffMs = new Date(slaDueAt).getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const isOverdue = diffMs < 0;

  const days = Math.floor(absMs / 86_400_000);
  const hours = Math.floor((absMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((absMs % 3_600_000) / 60_000);

  let label: string;
  if (days > 0) {
    label = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    label = minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  } else if (minutes > 0) {
    label = `${minutes}min`;
  } else {
    label = 'agora';
  }

  return isOverdue ? `Vencido há ${label}` : `${label} restantes`;
}

export function computePercentUsed(
  slaStartedAt: string | null | undefined,
  slaDueAt: string | null | undefined,
): number {
  if (!slaDueAt) return 0;
  const started = slaStartedAt ? new Date(slaStartedAt).getTime() : Date.now();
  const due = new Date(slaDueAt).getTime();
  const now = Date.now();
  const total = due - started;
  if (total <= 0) return now >= due ? 100 : 0;
  const elapsed = now - started;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 10_000) / 100));
}
