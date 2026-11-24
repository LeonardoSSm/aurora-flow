import { Columns3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { GROUP_LABELS } from '../lib/records-lib';
import type { RecordColumn } from '../types';

type Props = {
  columns: RecordColumn[];
  visible: string[];
  defaults: string[];
  onChange: (keys: string[]) => void;
};

/** Quais colunas a tabela da tela mostra (a escolha fica guardada neste navegador). */
export function ColumnPicker({ columns, visible, defaults, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const shown = new Set(visible);
  const toggle = (key: string) => {
    if (shown.has(key)) {
      if (visible.length === 1) return; // a tabela precisa de ao menos uma coluna
      onChange(visible.filter((item) => item !== key));
    } else {
      onChange([...visible, key]);
    }
  };
  const matches = (column: RecordColumn) =>
    !query.trim() || column.label.toLowerCase().includes(query.trim().toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-semibold text-tx-secondary transition-colors hover:border-primary hover:text-primary dark:hover:text-blue-300"
      >
        <Columns3 className="h-4 w-4" />
        Colunas ({visible.length})
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 grid w-[min(92vw,340px)] gap-2 rounded-xl border border-border-default bg-bg-surface p-3 shadow-lg">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Procurar coluna…"
            aria-label="Procurar coluna"
            className="h-8 rounded-lg border border-border-default bg-bg-surface px-3 text-xs text-tx-primary outline-none focus:border-primary"
          />
          <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
            {(['system', 'form', 'phase'] as const).map((group) => {
              const list = columns.filter((column) => column.group === group && matches(column));
              if (list.length === 0) return null;
              return (
                <div key={group} className="grid gap-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-tx-muted">{GROUP_LABELS[group]}</p>
                  {list.map((column) => (
                    <label
                      key={column.key}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-bg-hover',
                        shown.has(column.key) ? 'text-tx-primary' : 'text-tx-secondary',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={shown.has(column.key)}
                        onChange={() => toggle(column.key)}
                        className="mt-0.5 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-2">{column.label}</span>
                        {column.phaseLabel ? <span className="block text-xs text-tx-muted">{column.phaseLabel}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between border-t border-border-default pt-2">
            <button
              type="button"
              onClick={() => onChange(defaults)}
              className="text-xs font-semibold text-tx-secondary hover:text-primary"
            >
              Voltar ao padrão
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold text-primary dark:text-blue-300">
              Pronto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
