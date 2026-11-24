import { BadRequestException } from '@nestjs/common';

/**
 * Como o relatório PDF dos Registros é montado. Vem da tela (montador) e é o que um modelo salvo
 * guarda em `record_report_templates.config`.
 */
export interface RecordReportConfig {
  title: string;
  subtitle: string;
  /** Tabela (uma linha por registro) ou ficha (um bloco por registro, rótulo: valor). */
  layout: 'table' | 'cards';
  orientation: 'portrait' | 'landscape';
  /** Colunas na ordem do relatório; `label` troca o título da coluna só no PDF. */
  columns: Array<{ key: string; label?: string }>;
  /** Chave de coluna que separa os registros em grupos (ex.: sys:phase). */
  groupBy: string | null;
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  /** Quantos registros em cada grupo e no total, no fim. */
  showSummary: boolean;
  /** Filtros aplicados escritos no cabeçalho. */
  showFilters: boolean;
  fontSize: 'small' | 'normal';
}

export const MAX_REPORT_COLUMNS = 40;
const MAX_TEXT = 160;
const KEY_PATTERN = /^(sys|form|phase):[\w.-]{1,120}$/;

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new BadRequestException(`Relatório: "${field}" deve ser texto.`);
  return value.trim().slice(0, max);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function columnKey(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) {
    throw new BadRequestException(`Relatório: coluna inválida em "${field}".`);
  }
  return value;
}

/** Confere e completa uma configuração vinda de fora (tela ou modelo salvo). */
export function normalizeReportConfig(raw: unknown): RecordReportConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Relatório: configuração ausente.');
  }
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.columns) || input.columns.length === 0) {
    throw new BadRequestException('Relatório: escolha ao menos uma coluna.');
  }
  if (input.columns.length > MAX_REPORT_COLUMNS) {
    throw new BadRequestException(`Relatório: no máximo ${MAX_REPORT_COLUMNS} colunas.`);
  }
  const seen = new Set<string>();
  const columns: RecordReportConfig['columns'] = [];
  for (const entry of input.columns) {
    const item = (entry && typeof entry === 'object' ? entry : { key: entry }) as Record<string, unknown>;
    const key = columnKey(item.key, 'columns');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label = text(item.label, 'columns.label', 120);
    columns.push(label ? { key, label } : { key });
  }
  if (columns.length === 0) throw new BadRequestException('Relatório: escolha ao menos uma coluna.');

  return {
    title: text(input.title, 'title') || 'Relatório de registros',
    subtitle: text(input.subtitle, 'subtitle', 300),
    layout: oneOf(input.layout, ['table', 'cards'] as const, 'table'),
    orientation: oneOf(input.orientation, ['portrait', 'landscape'] as const, 'landscape'),
    columns,
    groupBy: columnKey(input.groupBy, 'groupBy'),
    sortBy: columnKey(input.sortBy, 'sortBy'),
    sortDir: oneOf(input.sortDir, ['asc', 'desc'] as const, 'asc'),
    showSummary: input.showSummary !== false,
    showFilters: input.showFilters !== false,
    fontSize: oneOf(input.fontSize, ['small', 'normal'] as const, 'normal'),
  };
}
