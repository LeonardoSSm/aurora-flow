import { Timer } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { KanbanCardPhaseSla } from '../../solicitations/types';
import { formatDuration, phaseSlaLabel } from '../lib/phase-sla';

const TONE: Record<KanbanCardPhaseSla['state'], string> = {
  on_track: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  breached: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

/** Prazo do card na fase: há quanto tempo está nela e quanto falta (ou há quanto venceu). */
export function PhaseSlaBadge({ sla, now = Date.now() }: { sla: KanbanCardPhaseSla; now?: number }) {
  const inPhaseMinutes = (now - new Date(sla.enteredAt).getTime()) / 60_000;
  const due = new Date(sla.dueAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <span
      className={cn(
        'inline-flex w-fit max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        TONE[sla.state],
      )}
      title={`Prazo da fase: ${due}${sla.businessHours ? ' (horas úteis)' : ''}${sla.extended ? ' — prorrogado' : ''}. ${Math.round(sla.percentUsed)}% usado.`}
    >
      <Timer className="h-3 w-3 shrink-0" />
      <span className="truncate">
        Na fase há {formatDuration(inPhaseMinutes)} · {phaseSlaLabel(sla.minutesRemaining)}
      </span>
    </span>
  );
}
