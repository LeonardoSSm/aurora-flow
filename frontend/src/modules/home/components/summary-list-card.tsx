import { Link } from 'react-router-dom';

export type SummaryListItem = {
  id: string;
  title: string;
  meta: string;
  /** Com destino, a linha vira link. */
  to?: string;
};

type SummaryListCardProps = {
  title: string;
  viewAll?: { to: string; label: string };
  dotClassName: string;
  items: SummaryListItem[];
  emptyLabel: string;
};

export function SummaryListCard({ title, viewAll, dotClassName, items, emptyLabel }: SummaryListCardProps) {
  return (
    <div className="shrink-0 rounded-2xl border border-border-default bg-bg-surface p-[22px]">
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-tx-primary">{title}</h3>
        {viewAll ? (
          <Link to={viewAll.to} className="text-xs font-semibold text-brand-primary hover:underline dark:text-blue-300">
            {viewAll.label}
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-tx-muted">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)]">
          {items.map((item) => {
            const content = (
              <>
                <span className={['h-2 w-2 shrink-0 rounded-full', dotClassName].join(' ')} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-tx-primary group-hover:text-brand-primary">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-tx-muted">{item.meta}</span>
                </span>
              </>
            );
            const rowClass = 'flex items-center gap-3 border-t border-border-default py-2.5 first:border-t-0';

            return item.to ? (
              <Link key={item.id} to={item.to} className={`${rowClass} group no-underline`}>
                {content}
              </Link>
            ) : (
              <div key={item.id} className={rowClass}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
