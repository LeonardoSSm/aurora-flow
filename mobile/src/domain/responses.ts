import type { FieldOption, FormDetail, ResponseItem } from '../api/types';
import { formatCalculatedValue } from '../utils/formula';
import { formatCell } from './item-order';

/*
 * Respostas do formulário na tela — espelho de frontend/src/modules/responses/utils/response-formatters.ts.
 */

export type ResponseFieldMeta = {
  label: string;
  fieldType: string;
  options: FieldOption[];
  settingsJson: Record<string, unknown> | null;
  sectionId: string;
  sectionTitle: string;
  position: number;
};

/** `fieldCode -> campo`, pela versão mais nova do formulário. */
export function buildFieldMetaByCode(
  form: FormDetail | null | undefined,
  /** Versão em que a resposta foi enviada (rótulos e opções daquele dia); sem ela, a mais nova. */
  versionId?: string | null,
): Record<string, ResponseFieldMeta> {
  if (!form || !Array.isArray(form.versions) || form.versions.length === 0) return {};
  const latest =
    form.versions.find((version) => version.id === versionId) ??
    [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const map: Record<string, ResponseFieldMeta> = {};
  let position = 0;
  const sections = [...latest.sections].sort((a, b) => a.order - b.order);
  sections.forEach((section, sectionIndex) => {
    for (const field of [...section.fields].sort((a, b) => a.order - b.order)) {
      map[field.code] = {
        label: field.label,
        fieldType: field.fieldType,
        options: field.options ?? [],
        settingsJson: field.settingsJson,
        sectionId: section.id,
        sectionTitle: section.title?.trim() || `Seção ${sectionIndex + 1}`,
        position: position++,
      };
    }
  });
  return map;
}

export function humanizeFieldCode(code: string): string {
  const text = code.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Pergunta';
}

function optionLabel(raw: unknown, options: FieldOption[]): string {
  if (typeof raw !== 'string') return stringify(raw);
  return options.find((option) => option.internalValue === raw)?.displayLabel ?? raw;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? new Intl.NumberFormat('pt-BR').format(value) : '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function formatIsoDate(text: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text);
  if (dt) return `${dt[3]}/${dt[2]}/${dt[1]} ${dt[4]}:${dt[5]}`;
  return text;
}

type ProductRow = { produto: unknown; values: Record<string, unknown> };

function isProductRows(value: unknown[]): value is ProductRow[] {
  return value.length > 0 && value.every((row) => !!row && typeof row === 'object' && 'produto' in row && 'values' in row);
}

type Snapshot = {
  schemaVersion: 1;
  source?: { kind?: string };
  total?: number | null;
  columns: {
    source: Array<{ key: string; label: string; type: string }>;
    input: Array<{ id: string; label: string; type: string }>;
  };
  rows: Array<{ key: string; sourceValues: Record<string, unknown>; answers: Record<string, unknown> }>;
};

function readSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Partial<Snapshot>;
  if (
    snapshot.schemaVersion !== 1 ||
    !Array.isArray(snapshot.rows) ||
    !snapshot.columns ||
    !Array.isArray(snapshot.columns.source) ||
    !Array.isArray(snapshot.columns.input)
  ) {
    return null;
  }
  return snapshot as Snapshot;
}

export type ResponseUi =
  | { type: 'text'; text: string }
  | { type: 'badge'; text: string; positive: boolean }
  | { type: 'chips'; chips: string[] }
  | { type: 'lines'; lines: string[] }
  | { type: 'table'; title?: string; columns: string[]; rows: Array<{ label: string; cells: string[] }>; total?: string | null };

/** Como mostrar uma resposta: texto, Sim/Não, opções, tabela (produtos, pedido, ERP). */
export function responseItemToUi(item: ResponseItem, field?: ResponseFieldMeta): ResponseUi {
  const snapshot = readSnapshot(item.valueJson);
  if (snapshot) {
    const subtotal = snapshot.columns.input.find((column) => column.id === '__subtotal');
    // Primeira coluna da fonte (nome do item) vira o rótulo da linha.
    const [first, ...restSource] = snapshot.columns.source;
    return {
      type: 'table',
      columns: [...restSource.map((c) => c.label), ...snapshot.columns.input.map((c) => c.label)],
      rows: snapshot.rows.map((row) => ({
        label: first ? formatCell(row.sourceValues?.[first.key] as never, first.type) : row.key,
        cells: [
          ...restSource.map((column) => formatCell(row.sourceValues?.[column.key] as never, column.type)),
          ...snapshot.columns.input.map((column) => formatCell(row.answers?.[column.id] as never, column.type)),
        ],
      })),
      total: typeof snapshot.total === 'number' ? formatCell(snapshot.total, subtotal?.type ?? 'number') : null,
    };
  }

  if (field?.fieldType === 'single_select' && item.valueText) return { type: 'text', text: optionLabel(item.valueText, field.options) };
  if (field?.fieldType === 'multi_select' && Array.isArray(item.valueJson)) {
    const chips = item.valueJson.map((value) => optionLabel(value, field.options)).filter(Boolean);
    return { type: 'chips', chips: chips.length > 0 ? chips : ['—'] };
  }
  if (field?.fieldType === 'calculated') {
    return { type: 'text', text: formatCalculatedValue(item.valueNumber, field.settingsJson) || '—' };
  }
  if (item.valueText && item.valueText.trim()) return { type: 'text', text: formatIsoDate(item.valueText.trim()) };
  if (typeof item.valueNumber === 'number') return { type: 'text', text: new Intl.NumberFormat('pt-BR').format(item.valueNumber) };
  if (typeof item.valueBoolean === 'boolean') return { type: 'badge', text: item.valueBoolean ? 'Sim' : 'Não', positive: item.valueBoolean };
  if (item.valueJson !== null && item.valueJson !== undefined) {
    if (Array.isArray(item.valueJson)) {
      if (isProductRows(item.valueJson)) {
        const columns: string[] = [];
        for (const row of item.valueJson) for (const key of Object.keys(row.values ?? {})) if (!columns.includes(key)) columns.push(key);
        return {
          type: 'table',
          columns,
          rows: item.valueJson.map((row) => ({ label: stringify(row.produto), cells: columns.map((c) => stringify(row.values?.[c])) })),
        };
      }
      const chips = item.valueJson.map(stringify).filter(Boolean);
      return { type: 'chips', chips: chips.length > 0 ? chips : ['—'] };
    }
    if (typeof item.valueJson === 'object') {
      const obj = item.valueJson as Record<string, unknown>;
      // Arquivo enviado pelo formulário antigo ({ url, name }).
      if (typeof obj.name === 'string' && typeof obj.url === 'string') return { type: 'text', text: obj.name };
      // Lista do ERP: { value, label }.
      if (typeof obj.label === 'string') return { type: 'text', text: obj.label };
      const entries = Object.entries(obj);
      if (entries.length === 0) return { type: 'text', text: '—' };
      return { type: 'lines', lines: entries.map(([key, value]) => `${key}: ${stringify(value)}`) };
    }
    return { type: 'text', text: stringify(item.valueJson) };
  }
  return { type: 'text', text: '—' };
}

/** Respostas na ordem do formulário (seção por seção). */
export function sortResponseItems(items: ResponseItem[], meta: Record<string, ResponseFieldMeta>): ResponseItem[] {
  return [...items].sort((a, b) => (meta[a.fieldCode]?.position ?? 1e9) - (meta[b.fieldCode]?.position ?? 1e9));
}
