import { CalendarDays, Filter, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../../lib/cn';
import {
  countActive,
  describeFilter,
  describePeriod,
  EMPTY_FILTERS,
  type FilterState,
  GROUP_LABELS,
  isActiveFilter,
  PERIOD_PRESETS,
  type PeriodPreset,
  presetDays,
  shortLabel,
} from '../lib/records-lib';
import type { RecordColumn, RecordFilter } from '../types';

const inputCls =
  'h-9 rounded-lg border border-border-default bg-bg-surface px-3 text-sm text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary focus:ring-2 focus:ring-primary/20';
const chipCls =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-primary dark:text-blue-300';
const toolButtonCls =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-semibold text-tx-secondary transition-colors hover:border-primary hover:text-primary dark:hover:text-blue-300';

type Props = {
  columns: RecordColumn[];
  state: FilterState;
  onChange: (next: FilterState) => void;
};

/** Busca, período e filtros pelas respostas. Os chips embaixo mostram o que está valendo. */
export function RecordsFilters({ columns, state, onChange }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [preset, setPreset] = useState<PeriodPreset>('all');
  const columnByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);
  const filterable = columns.filter((column) => column.filter !== 'none');
  const usedKeys = new Set(state.filters.map((filter) => filter.key));
  const activeFilters = state.filters.filter(isActiveFilter);
  const period = describePeriod(state);

  const patch = (changes: Partial<FilterState>) => onChange({ ...state, ...changes });
  const updateFilter = (key: string, changes: Partial<RecordFilter>) =>
    patch({ filters: state.filters.map((filter) => (filter.key === key ? { ...filter, ...changes } : filter)) });
  const removeFilter = (key: string) => patch({ filters: state.filters.filter((filter) => filter.key !== key) });

  function choosePreset(value: PeriodPreset) {
    setPreset(value);
    if (value === 'custom') return;
    const days = presetDays(value);
    patch({ fromDay: days?.from ?? '', toDay: days?.to ?? '' });
  }

  function addFilter(key: string) {
    if (!key || usedKeys.has(key)) return;
    const column = columnByKey.get(key);
    patch({ filters: [...state.filters, column?.filter === 'text' ? { key, text: '' } : { key, values: [] }] });
    setPanelOpen(true);
  }

  const activeCount = activeFilters.length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Pesquisar registros</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted" />
          <input
            type="search"
            value={state.search}
            onChange={(event) => patch({ search: event.target.value })}
            placeholder="Pesquisar por título, solicitante, responsável ou resposta…"
            className={cn(inputCls, 'w-full pl-9')}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-tx-muted" aria-hidden />
          <select
            aria-label="Data usada no período"
            value={state.dateField}
            onChange={(event) => patch({ dateField: event.target.value as FilterState['dateField'] })}
            className={inputCls}
          >
            <option value="createdAt">Abertura</option>
            <option value="updatedAt">Última atualização</option>
          </select>
          <select
            aria-label="Período"
            value={preset}
            onChange={(event) => choosePreset(event.target.value as PeriodPreset)}
            className={inputCls}
          >
            {PERIOD_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {preset === 'custom' ? (
            <>
              <input
                type="date"
                aria-label="De"
                value={state.fromDay}
                max={state.toDay || undefined}
                onChange={(event) => patch({ fromDay: event.target.value })}
                className={inputCls}
              />
              <span className="text-xs text-tx-muted">até</span>
              <input
                type="date"
                aria-label="Até"
                value={state.toDay}
                min={state.fromDay || undefined}
                onChange={(event) => patch({ toDay: event.target.value })}
                className={inputCls}
              />
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          className={cn(toolButtonCls, (panelOpen || activeCount > 0) && 'border-primary text-primary dark:text-blue-300')}
        >
          <Filter className="h-4 w-4" />
          Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>

      {panelOpen ? (
        <div className="grid gap-3 rounded-xl border border-border-default bg-bg-s2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Plus className="h-4 w-4 text-tx-muted" aria-hidden />
            <select
              aria-label="Adicionar filtro"
              value=""
              onChange={(event) => addFilter(event.target.value)}
              className={cn(inputCls, 'w-full min-w-0 sm:w-[360px]')}
            >
              <option value="">Filtrar por…</option>
              {(['system', 'form', 'phase'] as const).map((group) => {
                const options = filterable.filter((column) => column.group === group && !usedKeys.has(column.key));
                if (options.length === 0) return null;
                return (
                  <optgroup key={group} label={GROUP_LABELS[group]}>
                    {options.map((column) => (
                      <option key={column.key} value={column.key}>
                        {shortLabel(column.phaseLabel ? `${column.label} (${column.phaseLabel})` : column.label)}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <span className="text-xs text-tx-muted">
              Os filtros se somam: aparece o registro que atende a todos.
            </span>
          </div>

          {state.filters.length === 0 ? (
            <p className="text-sm text-tx-secondary">
              Escolha uma coluna acima — uma pergunta do formulário, a fase, o status, o responsável…
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {state.filters.map((filter) => {
                const column = columnByKey.get(filter.key);
                if (!column) return null;
                return (
                  <FilterEditor
                    key={filter.key}
                    column={column}
                    filter={filter}
                    onChange={(changes) => updateFilter(filter.key, changes)}
                    onRemove={() => removeFilter(filter.key)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {countActive(state) > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {period ? (
            <span className={chipCls}>
              <span className="truncate">{period}</span>
              <ChipClose
                label="Tirar o período"
                onClick={() => {
                  setPreset('all');
                  patch({ fromDay: '', toDay: '' });
                }}
              />
            </span>
          ) : null}
          {state.search.trim() ? (
            <span className={chipCls}>
              <span className="truncate">Busca: “{state.search.trim()}”</span>
              <ChipClose label="Limpar a busca" onClick={() => patch({ search: '' })} />
            </span>
          ) : null}
          {activeFilters.map((filter) => (
            <span key={filter.key} className={chipCls} title={describeFilter(columnByKey.get(filter.key), filter)}>
              <span className="truncate">{describeFilter(columnByKey.get(filter.key), filter)}</span>
              <ChipClose label="Tirar este filtro" onClick={() => removeFilter(filter.key)} />
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setPreset('all');
              onChange({ ...EMPTY_FILTERS, dateField: state.dateField });
            }}
            className="text-xs font-semibold text-tx-secondary underline-offset-2 hover:text-primary hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChipClose({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-full p-0.5 hover:bg-primary/20"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

const OPTIONS_SEARCH_FROM = 8;

function FilterEditor({
  column,
  filter,
  onChange,
  onRemove,
}: {
  column: RecordColumn;
  filter: RecordFilter;
  onChange: (changes: Partial<RecordFilter>) => void;
  onRemove: () => void;
}) {
  const [optionQuery, setOptionQuery] = useState('');
  const options =
    column.filter === 'boolean'
      ? [
          { value: 'true', label: 'Sim' },
          { value: 'false', label: 'Não' },
        ]
      : (column.options ?? []);
  const selected = new Set(filter.values ?? []);
  const shown = optionQuery.trim()
    ? options.filter((option) => option.label.toLowerCase().includes(optionQuery.trim().toLowerCase()))
    : options;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ values: [...next] });
  };

  return (
    <div className="grid gap-2 rounded-lg border border-border-default bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-tx-primary">
          {column.label}
          {column.phaseLabel ? <span className="ml-1 font-normal text-tx-muted">· {column.phaseLabel}</span> : null}
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar o filtro ${column.label}`}
          className="rounded p-1 text-tx-muted hover:bg-bg-hover hover:text-tx-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {column.filter === 'text' ? (
        <input
          type="text"
          value={filter.text ?? ''}
          onChange={(event) => onChange({ text: event.target.value })}
          placeholder="Contém…"
          aria-label={`${column.label} contém`}
          className={inputCls}
        />
      ) : (
        <>
          {options.length >= OPTIONS_SEARCH_FROM ? (
            <input
              type="search"
              value={optionQuery}
              onChange={(event) => setOptionQuery(event.target.value)}
              placeholder="Procurar opção…"
              aria-label={`Procurar opção de ${column.label}`}
              className={cn(inputCls, 'h-8 text-xs')}
            />
          ) : null}
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {shown.map((option) => {
              const on = selected.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                    on
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-default bg-bg-surface text-tx-secondary hover:border-primary/40 hover:text-tx-primary',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
            {shown.length === 0 ? <span className="text-xs text-tx-muted">Nenhuma opção.</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
