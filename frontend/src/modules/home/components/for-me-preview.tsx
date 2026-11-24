import { CheckCircle2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { useDashboardPanelQuery } from '../../dashboard/hooks/use-dashboard-panel-query';
import { useFitGrid } from '../../dashboard/hooks/use-fit-grid';
import type { PanelItem, PanelReason } from '../../dashboard/types';
import { PhaseFieldsModal } from '../../kanban-phases/components/phase-fields-modal';
import { phaseColorHex } from '../../kanban-phases/types';

/** Quantas mostrar quando a página rola (sem `fill`). */
const PREVIEW_SIZE = 4;
const ROW_HEIGHT = 56;

const REASON_LABEL: Record<PanelReason, string> = {
  approval: 'Aprovar',
  assigned: 'Responsável',
  phase: 'Sua fase',
};

/**
 * As primeiras de "Para mim agora" do Resumo (mesma consulta, mesmo cache). Clicar abre a
 * solicitação ali mesmo, como no Resumo; a lista inteira fica lá. Com `fill`, mostra só o que cabe
 * na altura que o pai der.
 */
export function ForMePreview({ fill, className }: { fill: boolean; className?: string }) {
  const { data, isLoading, isError, refetch } = useDashboardPanelQuery();
  const [openItem, setOpenItem] = useState<PanelItem | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { capacity } = useFitGrid(listRef, { rowHeight: ROW_HEIGHT, gap: 0, fallback: PREVIEW_SIZE });

  const total = data?.forMe.total ?? 0;
  const late = data?.forMe.late ?? 0;
  const items = (data?.forMe.items ?? []).slice(0, fill ? capacity : PREVIEW_SIZE);

  return (
    <div className={cn('flex flex-col rounded-2xl border border-border-default bg-bg-surface p-[22px]', className)}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-tx-primary">
          Para mim agora
          {total > 0 ? (
            <span className="rounded-full bg-brand-primary-light px-2 py-0.5 text-xs font-bold text-brand-primary">
              {total}
            </span>
          ) : null}
          {late > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-200">
              {late} {late === 1 ? 'vencida' : 'vencidas'}
            </span>
          ) : null}
        </h3>
        <Link to="/dashboard" className="shrink-0 text-xs font-semibold text-brand-primary hover:underline dark:text-blue-300">
          Ver no Resumo
        </Link>
      </div>

      {/* A lista fica montada mesmo vazia: é ela que mede quantas linhas cabem. */}
      {/* minmax(0, 1fr): sem isso a coluna do grid assume a largura do título inteiro (o
          `truncate` não corta) e estica a página no celular. */}
      <ul
        ref={listRef}
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] content-start',
          fill && 'min-h-0 flex-1 overflow-hidden',
        )}
      >
        {isError ? (
          <li className="text-sm text-tx-muted">Não foi possível carregar agora.</li>
        ) : isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <li key={i} style={{ height: ROW_HEIGHT }} className="py-1.5">
              <div className="h-full animate-pulse rounded-lg bg-surface-container-low" />
            </li>
          ))
        ) : items.length === 0 ? (
          <li className="flex items-center gap-2 py-2 text-sm text-tx-muted">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Nada esperando por você.
          </li>
        ) : (
          items.map((item) => {
            const breached = item.phaseSla?.state === 'breached';
            return (
              <li key={item.id} style={{ height: ROW_HEIGHT }} className="border-t border-border-default first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenItem(item)}
                  className="-mx-2 flex h-full w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-surface-container-low"
                >
                  <span
                    className="h-7 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: phaseColorHex(item.phaseColor) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-tx-primary">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-tx-muted">
                      {item.formName} ·{' '}
                      <span className={cn('font-semibold', breached ? 'text-red-600 dark:text-red-300' : 'text-brand-primary dark:text-blue-300')}>
                        {REASON_LABEL[item.reason]}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      {total > items.length && !isLoading ? (
        <Link to="/dashboard" className="mt-1 block shrink-0 text-xs font-semibold text-tx-muted hover:text-brand-primary">
          + {total - items.length} no Resumo
        </Link>
      ) : null}

      {openItem ? (
        <PhaseFieldsModal
          card={openItem}
          onClose={() => {
            setOpenItem(null);
            void refetch();
          }}
        />
      ) : null}
    </div>
  );
}
