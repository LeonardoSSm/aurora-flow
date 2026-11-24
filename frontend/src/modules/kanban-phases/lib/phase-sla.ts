/** Mesmas regras do backend (kanban-phases/phase-sla.ts): expediente de 10 h, alerta padrão 80%. */
export const BUSINESS_DAY_HOURS = 10;
export const DEFAULT_PHASE_SLA_WARNING_PERCENT = 80;

export type PhaseSlaState = 'on_track' | 'warning' | 'breached';

/** "2d 3h", "45min" — duração compacta para o card e a linha do tempo. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(Math.abs(minutes)));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  return `${mins}min`;
}

/** Texto do prazo da fase no card: "Vence em 3h", "Venceu há 2d". */
export function phaseSlaLabel(minutesRemaining: number): string {
  return minutesRemaining >= 0
    ? `Vence em ${formatDuration(minutesRemaining)}`
    : `Venceu há ${formatDuration(minutesRemaining)}`;
}

/** Horas → "8 horas úteis", "2 dias", para resumos da configuração. */
export function describePhaseSla(hours: number, businessHours: boolean): string {
  const perDay = businessHours ? BUSINESS_DAY_HOURS : 24;
  const kind = businessHours ? ' úteis' : '';
  if (hours % perDay === 0) {
    const days = hours / perDay;
    return `${days} ${days === 1 ? 'dia' : 'dias'}${businessHours ? (days === 1 ? ' útil' : ' úteis') : ''}`;
  }
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}${hours === 1 && businessHours ? ' útil' : kind}`;
}
