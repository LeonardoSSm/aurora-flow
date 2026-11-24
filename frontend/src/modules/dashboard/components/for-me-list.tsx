import { CheckCircle2 } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { formatDuration, phaseSlaLabel } from '../../kanban-phases/lib/phase-sla';
import { phaseColorHex } from '../../kanban-phases/types';
import { useFitGrid } from '../hooks/use-fit-grid';
import type { DashboardPanel, PanelItem, PanelReason } from '../types';

const ROW_HEIGHT = 60;
const ROW_GAP = 6;

const REASON_LABEL: Record<PanelReason, string> = {
  approval: 'Aprovar',
  assigned: 'Responsável',
  phase: 'Sua fase',
};

function DeadlineTag({ item }: { item: PanelItem }) {
  const sla = item.phaseSla;
  if (sla && sla.state !== 'on_track') {
    return (
      <span
        className={cn(
          'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold',
          sla.state === 'breached'
            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        )}
      >
        {phaseSlaLabel(sla.minutesRemaining)}
      </span>
    );
  }
  const minutes = item.phaseEnteredAt ? (Date.now() - new Date(item.phaseEnteredAt).getTime()) / 60_000 : 0;
  return (
    <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-tx-secondary">
      há {formatDuration(minutes)} na fase
    </span>
  );
}

function ForMeRow({ item, onOpen }: { item: PanelItem; onOpen: (item: PanelItem) => void }) {
  return (
    <li style={{ height: ROW_HEIGHT }}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex h-full w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-surface-container-low"
      >
        <span
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: phaseColorHex(item.phaseColor) }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-tx-primary">{item.title}</span>
            {item.priority === 'urgent' ? (
              <span className="shrink-0 rounded bg-red-600 px-1.5 text-[10px] font-bold uppercase text-white">
                Urgente
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-tx-secondary">
            {item.formName} · {item.phaseLabel} ·{' '}
            <span className="font-semibold text-primary">{REASON_LABEL[item.reason]}</span>
          </span>
        </span>
        <DeadlineTag item={item} />
      </button>
    </li>
  );
}

export function ForMeList({
  forMe,
  loading,
  onOpen,
}: {
  forMe: DashboardPanel['forMe'] | undefined;
  loading: boolean;
  onOpen: (item: PanelItem) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const { capacity } = useFitGrid(listRef, { rowHeight: ROW_HEIGHT, gap: ROW_GAP, fallback: 6 });

  const items = forMe?.items ?? [];
  const total = forMe?.total ?? 0;
  const visible = items.slice(0, capacity);
  const hidden = total - visible.length;

  return (
    <Card className="flex min-h-0 flex-col p-3">
      <header className="flex items-baseline justify-between gap-2 px-2 pb-2">
        <h2 className="text-base font-bold text-tx-primary">Para mim agora</h2>
        {forMe ? (
          <span className="text-xs font-semibold text-tx-secondary">
            {total} {total === 1 ? 'pendente' : 'pendentes'}
            {forMe.late > 0 ? (
              <span className="text-red-600 dark:text-red-300"> · {forMe.late} com prazo vencido</span>
            ) : null}
          </span>
        ) : null}
      </header>

      <ul ref={listRef} className="grid min-h-0 flex-1 content-start overflow-hidden" style={{ gap: ROW_GAP }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                style={{ height: ROW_HEIGHT }}
                className="animate-pulse rounded-xl bg-surface-container-low"
              />
            ))
          : visible.map((item) => <ForMeRow key={item.id} item={item} onOpen={onOpen} />)}
        {!loading && total === 0 ? (
          <li className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-tx-secondary">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            Nada esperando por você.
          </li>
        ) : null}
      </ul>

      {!loading && hidden > 0 ? (
        <Link
          to="/kanban"
          className="mt-2 border-t border-border-default/40 px-2 pt-2 text-xs font-semibold text-primary hover:underline"
        >
          + {hidden} {hidden === 1 ? 'outra' : 'outras'} — abrir processos
        </Link>
      ) : null}
    </Card>
  );
}
