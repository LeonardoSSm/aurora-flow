import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { formatDuration } from '../../kanban-phases/lib/phase-sla';
import { phaseColorHex } from '../../kanban-phases/types';
import { useFitGrid } from '../hooks/use-fit-grid';
import type { PanelProcess } from '../types';

const CARD_HEIGHT = 164;
const GAP = 12;
const MIN_COLUMN_WIDTH = 300;

function ProcessCard({ process }: { process: PanelProcess }) {
  const withCards = process.phases.filter((phase) => phase.count > 0);
  const oldestMinutes = process.oldest
    ? (Date.now() - new Date(process.oldest.enteredAt).getTime()) / 60_000
    : 0;

  return (
    <Link
      to={`/kanban/${process.formId}`}
      style={{ height: CARD_HEIGHT }}
      className="flex flex-col gap-2.5 overflow-hidden rounded-2xl bg-surface-container-lowest p-4 shadow-soft transition-colors hover:bg-surface-container-low"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-bold text-tx-primary" title={process.formName}>
          {process.formName}
        </h3>
        <span className="shrink-0 text-right leading-none">
          <span className="text-2xl font-extrabold text-tx-primary">{process.active}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-tx-secondary">
            em andamento
          </span>
        </span>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        {withCards.map((phase) => (
          <span
            key={phase.id}
            title={`${phase.label}: ${phase.count}`}
            style={{ width: `${(phase.count / process.active) * 100}%`, backgroundColor: phaseColorHex(phase.color) }}
          />
        ))}
      </div>

      <ul className="flex h-9 shrink-0 flex-wrap content-start gap-x-3 gap-y-1 overflow-hidden text-xs">
        {withCards.map((phase) => (
          <li key={phase.id} className="inline-flex items-center gap-1 text-tx-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: phaseColorHex(phase.color) }} />
            {phase.label}
            <span className={cn('font-bold', phase.late > 0 ? 'text-red-600 dark:text-red-300' : 'text-tx-primary')}>
              {phase.count}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center gap-2 truncate text-xs text-tx-secondary">
        {process.late > 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-200">
            {process.late} com prazo vencido
          </span>
        ) : process.warning > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {process.warning} perto do prazo
          </span>
        ) : null}
        {process.oldest ? (
          <span className="truncate">
            Mais antiga: {formatDuration(oldestMinutes)} em {process.oldest.phaseLabel}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function ProcessGrid({ processes, loading }: { processes: PanelProcess[] | undefined; loading: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const { columns, capacity } = useFitGrid(gridRef, {
    rowHeight: CARD_HEIGHT,
    gap: GAP,
    minColumnWidth: MIN_COLUMN_WIDTH,
    fallback: 4,
  });

  const list = processes ?? [];
  // Sem espaço para todos: o último lugar vira o "+N processos".
  const overflow = list.length > capacity;
  const visible = overflow ? list.slice(0, Math.max(capacity - 1, 0)) : list;
  const hidden = list.length - visible.length;

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-baseline justify-between gap-2 pb-2">
        <h2 className="text-base font-bold text-tx-primary">Processos em andamento</h2>
        <Link to="/kanban" className="text-xs font-semibold text-primary hover:underline">
          Ver todos
        </Link>
      </header>
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 content-start overflow-hidden"
        style={{ gap: GAP, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {loading
          ? Array.from({ length: Math.min(capacity, 6) }).map((_, i) => (
              <div
                key={i}
                style={{ height: CARD_HEIGHT }}
                className="animate-pulse rounded-2xl bg-surface-container-lowest shadow-soft"
              />
            ))
          : visible.map((process) => <ProcessCard key={process.formId} process={process} />)}
        {!loading && hidden > 0 ? (
          <Link
            to="/kanban"
            style={{ height: CARD_HEIGHT }}
            className="flex items-center justify-center rounded-2xl border border-dashed border-border-default text-sm font-semibold text-primary hover:bg-surface-container-low"
          >
            + {hidden} {hidden === 1 ? 'processo' : 'processos'}
          </Link>
        ) : null}
        {!loading && list.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-tx-secondary">
            Nenhuma solicitação em andamento.
          </p>
        ) : null}
      </div>
    </section>
  );
}
