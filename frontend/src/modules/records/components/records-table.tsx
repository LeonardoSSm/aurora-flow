import { ArrowDown, ArrowUp, ArrowUpDown, Lock } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { cn } from '../../../lib/cn';
import { SORTABLE_KEYS } from '../lib/records-lib';
import type { RecordColumn, RecordRow, SortableKey } from '../types';

type Props = {
  columns: RecordColumn[];
  rows: RecordRow[];
  loading: boolean;
  sort: { by: SortableKey; dir: 'asc' | 'desc' };
  onSort: (key: SortableKey) => void;
  onOpen: (row: RecordRow) => void;
};

/** Valores longos (tabela do ERP, texto livre) ficam numa linha com o texto inteiro no title. */
export function RecordsTable({ columns, rows, loading, sort, onSort, onOpen }: Props) {
  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: RecordRow) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(row);
    }
  }

  if (loading) {
    return (
      <div className="divide-y divide-border-default rounded-[14px] border border-border-default bg-bg-surface">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex animate-pulse items-center gap-4 px-4 py-3">
            <div className="h-4 flex-1 rounded bg-bg-s3" />
            <div className="h-4 w-24 rounded bg-bg-s3" />
            <div className="h-4 w-24 rounded bg-bg-s3" />
            <div className="h-4 w-20 rounded bg-bg-s3" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-border-default bg-bg-surface px-6 py-10 text-center">
        <p className="text-sm font-semibold text-tx-primary">Nenhum registro encontrado.</p>
        <p className="mt-1 text-sm text-tx-secondary">Ajuste a busca, o período ou os filtros.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-default bg-bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-border-default text-[11px] font-bold uppercase tracking-wider text-tx-secondary">
          <tr>
            {columns.map((column) => {
              const sortable = SORTABLE_KEYS.has(column.key);
              const active = sort.by === column.key;
              const SortIcon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  // Pergunta longa ("A granja respeita a distância mínima…") não alarga a coluna: corta e mostra no title.
                  className="max-w-[240px] whitespace-nowrap px-4 py-3"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.key as SortableKey)}
                      className={cn(
                        'inline-flex items-center gap-1 uppercase tracking-wider hover:text-primary',
                        active && 'text-primary dark:text-blue-300',
                      )}
                      title="Ordenar"
                    >
                      {column.label}
                      <SortIcon className={cn('h-3 w-3', !active && 'opacity-40')} />
                    </button>
                  ) : (
                    <span
                      className="flex min-w-0 items-center gap-1"
                      title={column.phaseLabel ? `${column.label} · campo da fase ${column.phaseLabel}` : column.label}
                    >
                      <span className="truncate">{column.label}</span>
                      {column.masked ? <Lock className="h-3 w-3 shrink-0" aria-label="Campo sensível" /> : null}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              onClick={() => onOpen(row)}
              onKeyDown={(event) => onRowKeyDown(event, row)}
              title="Ver o registro"
              className="cursor-pointer border-b border-border-default last:border-b-0 hover:bg-bg-hover focus-visible:bg-bg-hover focus-visible:outline-none"
            >
              {columns.map((column, index) => {
                const value = row.values[column.key] ?? '';
                return (
                  <td
                    key={column.key}
                    className={cn(
                      'max-w-[280px] truncate px-4 py-2.5 align-top',
                      index === 0 ? 'font-semibold text-tx-primary' : 'text-tx-secondary',
                    )}
                    title={value.length > 30 ? value : undefined}
                  >
                    {value || <span className="text-tx-muted">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
