import type {
  DateField,
  RecordColumn,
  RecordFilter,
  RecordFilters,
  RecordReportConfig,
  RecordsMeta,
} from '../types';

// ─── Período ──────────────────────────────────────────────────────────────

export type PeriodPreset = 'all' | 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

export const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'all', label: 'Todo o período' },
  { value: 'today', label: 'Hoje' },
  { value: 'last7', label: 'Últimos 7 dias' },
  { value: 'last30', label: 'Últimos 30 dias' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês passado' },
  { value: 'custom', label: 'Escolher datas' },
];

/** Data local como "AAAA-MM-DD" (o valor de um <input type="date">). */
export function toDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dias "De" e "Até" de um atalho, contados a partir de `now` (no fuso de quem usa). */
export function presetDays(preset: PeriodPreset, now = new Date()): { from: string; to: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  switch (preset) {
    case 'today':
      return { from: toDayString(today), to: toDayString(today) };
    case 'last7':
      return { from: toDayString(shift(-6)), to: toDayString(today) };
    case 'last30':
      return { from: toDayString(shift(-29)), to: toDayString(today) };
    case 'thisMonth':
      return { from: toDayString(new Date(today.getFullYear(), today.getMonth(), 1)), to: toDayString(today) };
    case 'lastMonth':
      return {
        from: toDayString(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toDayString(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    default:
      return null;
  }
}

/** Início do dia local em ISO — o servidor compara instantes, não datas. */
export function dayStartIso(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function dayEndIso(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}/${m}/${y}` : day;
}

// ─── Filtros ──────────────────────────────────────────────────────────────

export type FilterState = {
  search: string;
  dateField: DateField;
  fromDay: string;
  toDay: string;
  filters: RecordFilter[];
};

export const EMPTY_FILTERS: FilterState = { search: '', dateField: 'createdAt', fromDay: '', toDay: '', filters: [] };

/** Filtro que de fato restringe (algo marcado ou digitado). */
export function isActiveFilter(filter: RecordFilter): boolean {
  return Boolean(filter.text?.trim()) || (filter.values?.length ?? 0) > 0;
}

/** O que vai para o servidor: só o que restringe. */
export function toRequestFilters(state: FilterState): RecordFilters {
  const filters = state.filters
    .filter(isActiveFilter)
    .map((filter) => (filter.text?.trim() ? { key: filter.key, text: filter.text.trim() } : { key: filter.key, values: filter.values }));
  return {
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    dateField: state.dateField,
    ...(state.fromDay ? { from: dayStartIso(state.fromDay) } : {}),
    ...(state.toDay ? { to: dayEndIso(state.toDay) } : {}),
    ...(filters.length ? { filters } : {}),
  };
}

export function countActive(state: FilterState): number {
  return state.filters.filter(isActiveFilter).length + (state.fromDay || state.toDay ? 1 : 0) + (state.search.trim() ? 1 : 0);
}

/** Texto do chip de um filtro: "Fase: Análise, Execução" / "Lote contém “L-12”". */
export function describeFilter(column: RecordColumn | undefined, filter: RecordFilter): string {
  const label = column?.label ?? filter.key;
  if (filter.text?.trim()) return `${label} contém “${filter.text.trim()}”`;
  const values = filter.values ?? [];
  const names = values.map((value) =>
    column?.filter === 'boolean'
      ? value === 'true'
        ? 'Sim'
        : 'Não'
      : (column?.options?.find((option) => option.value === value)?.label ?? value),
  );
  if (names.length > 3) return `${label}: ${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
  return `${label}: ${names.join(', ')}`;
}

export function describePeriod(state: Pick<FilterState, 'dateField' | 'fromDay' | 'toDay'>): string | null {
  const basis = state.dateField === 'updatedAt' ? 'Atualizado' : 'Aberto';
  if (state.fromDay && state.toDay) {
    return state.fromDay === state.toDay
      ? `${basis} em ${formatDay(state.fromDay)}`
      : `${basis} de ${formatDay(state.fromDay)} a ${formatDay(state.toDay)}`;
  }
  if (state.fromDay) return `${basis} desde ${formatDay(state.fromDay)}`;
  if (state.toDay) return `${basis} até ${formatDay(state.toDay)}`;
  return null;
}

// ─── Colunas ──────────────────────────────────────────────────────────────

export const GROUP_LABELS: Record<RecordColumn['group'], string> = {
  system: 'Dados do registro',
  form: 'Respostas do formulário',
  phase: 'Campos das fases',
};

/** Colunas salvas que ainda existem; nenhuma sobrando → as padrão. */
export function sanitizeColumns(saved: string[] | null | undefined, meta: Pick<RecordsMeta, 'columns' | 'defaultColumns'>): string[] {
  const known = new Set(meta.columns.map((column) => column.key));
  const kept = (saved ?? []).filter((key) => known.has(key));
  return kept.length ? kept : meta.defaultColumns.filter((key) => known.has(key));
}

/** Colunas que a tabela da tela sabe ordenar no servidor. */
export const SORTABLE_KEYS = new Set(['sys:createdAt', 'sys:updatedAt', 'sys:phaseEnteredAt', 'sys:title']);

// ─── Relatório ────────────────────────────────────────────────────────────

/** Ponto de partida do montador: as colunas que a pessoa vê na tela, agrupado por fase. */
export function defaultReportConfig(formName: string, visibleColumns: string[]): RecordReportConfig {
  return {
    title: `Registros · ${formName}`,
    subtitle: '',
    layout: 'table',
    orientation: visibleColumns.length > 5 ? 'landscape' : 'portrait',
    columns: visibleColumns.map((key) => ({ key })),
    groupBy: null,
    sortBy: 'sys:createdAt',
    sortDir: 'desc',
    showSummary: true,
    showFilters: true,
    fontSize: visibleColumns.length > 8 ? 'small' : 'normal',
  };
}

/** Modelo salvo pode citar coluna que o processo perdeu: some do relatório, sem erro. */
export function sanitizeReportConfig(config: RecordReportConfig, columns: RecordColumn[]): RecordReportConfig {
  const known = new Set(columns.map((column) => column.key));
  return {
    ...config,
    columns: config.columns.filter((column) => known.has(column.key)),
    groupBy: config.groupBy && known.has(config.groupBy) ? config.groupBy : null,
    sortBy: config.sortBy && known.has(config.sortBy) ? config.sortBy : null,
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revogar no mesmo tick cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rótulo para caber num <select> (que assume a largura da opção mais longa). */
export function shortLabel(label: string, max = 70): string {
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

/** Nome do processo → pedaço seguro de nome de arquivo ("Pedido de Compra" → "pedido-de-compra"). */
export function fileSlug(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'processo';
}
