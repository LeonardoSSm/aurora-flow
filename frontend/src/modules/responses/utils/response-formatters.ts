import { formatCalculatedValue } from '../../forms/formula';
import type {
  ErpTableInputColumn,
  ErpTableSourceColumnType,
  FieldSettings,
  FormDetail,
  FormFieldOption,
} from '../../forms/types';
import { formatErpTableCell } from '../../public-form/erp-table';
import type { ErpTableCellValue } from '../../public-form/types';
import type { ResponseItem } from '../types';

type StatusMeta = {
  label: string;
  className: string;
};

/** O que a formatação de uma resposta precisa saber sobre o campo que a gerou. */
export type ResponseFieldMeta = {
  label: string;
  fieldType: string;
  options: FormFieldOption[];
  settingsJson: FieldSettings;
  /** Seção do campo no formulário (para agrupar as respostas e o quadro de pontuação). */
  sectionId?: string;
  sectionTitle?: string;
  /** Posição do campo no formulário inteiro: seção por seção, campo por campo. */
  position?: number;
};

/** `fieldCode -> metadados do campo`, a partir da última versão de um formulário. */
export function buildFieldMetaByCode(formDetail: FormDetail | null): Record<string, ResponseFieldMeta> {
  if (!formDetail || formDetail.versions.length === 0) return {};
  const latestVersion = [...formDetail.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const map: Record<string, ResponseFieldMeta> = {};
  let position = 0;
  const sections = [...latestVersion.sections].sort((a, b) => a.order - b.order);
  for (const [sectionIndex, section] of sections.entries()) {
    for (const field of [...section.fields].sort((a, b) => a.order - b.order)) {
      map[field.code] = {
        label: field.label,
        fieldType: field.fieldType,
        options: field.options,
        settingsJson: field.settingsJson,
        sectionId: section.id,
        sectionTitle: section.title.trim() || `Seção ${sectionIndex + 1}`,
        position: position++,
      };
    }
  }
  return map;
}

/** Troca o valor interno de uma opção (ex.: "opcao_1") pelo rótulo exibido ao respondente. */
function resolveOptionLabel(rawValue: unknown, options: FormFieldOption[]): string {
  if (typeof rawValue !== 'string') return stringifyUnknown(rawValue);
  const match = options.find((option) => option.internalValue === rawValue);
  return match?.displayLabel ?? rawValue;
}

const statusMap: Record<string, StatusMeta> = {
  submitted: { label: 'Enviada', className: 'bg-emerald-100 text-emerald-800' },
  in_progress: { label: 'Em andamento', className: 'bg-blue-100 text-blue-800' },
  edited: { label: 'Editada', className: 'bg-amber-100 text-amber-800' },
  invalidated: { label: 'Invalidada', className: 'bg-rose-100 text-rose-800' },
  canceled: { label: 'Cancelada', className: 'bg-slate-200 text-slate-700' },
};

// "2026-05-15" → "15/05/2026"
function formatIsoDate(text: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split('-');
    return `${d}/${m}/${y}`;
  }
  return text;
}

function formatResponseText(text: string): string {
  return formatIsoDate(text);
}

type ProductTableRowJson = { produto: unknown; values: Record<string, unknown> };

function isProductTableRows(value: unknown[]): value is ProductTableRowJson[] {
  return (
    value.length > 0 &&
    value.every((row) => !!row && typeof row === 'object' && 'produto' in row && 'values' in row)
  );
}

/** Colunas usadas por pelo menos uma das linhas — a ordem segue a primeira aparição. */
function collectProductTableColumns(rows: ProductTableRowJson[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row.values ?? {})) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

function stringifyUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Intl.NumberFormat('pt-BR').format(value) : '-';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '-';
  }
}

export function getSubmissionStatusMeta(status: string): StatusMeta {
  return (
    statusMap[status] ?? {
      label: status || 'Desconhecido',
      className: 'bg-slate-100 text-slate-700',
    }
  );
}

export function responseItemToPlainText(item: ResponseItem, field?: ResponseFieldMeta): string {
  if (field?.fieldType === 'single_select' && item.valueText) {
    return resolveOptionLabel(item.valueText, field.options);
  }
  if (field?.fieldType === 'multi_select' && Array.isArray(item.valueJson)) {
    return item.valueJson.map((value) => resolveOptionLabel(value, field.options)).join(', ');
  }
  if (field?.fieldType === 'calculated') {
    return formatCalculatedValue(item.valueNumber, field.settingsJson) || '-';
  }

  if (item.valueText && item.valueText.trim()) {
    return formatResponseText(item.valueText.trim());
  }
  if (typeof item.valueNumber === 'number') {
    return new Intl.NumberFormat('pt-BR').format(item.valueNumber);
  }
  if (typeof item.valueBoolean === 'boolean') {
    return item.valueBoolean ? 'Sim' : 'Não';
  }
  if (item.valueJson !== null && item.valueJson !== undefined) {
    if (Array.isArray(item.valueJson)) {
      if (isProductTableRows(item.valueJson)) {
        return item.valueJson
          .map((row) => {
            const cells = Object.entries(row.values ?? {})
              .map(([key, cellValue]) => `${key}: ${stringifyUnknown(cellValue)}`)
              .join(', ');
            return `${stringifyUnknown(row.produto)} (${cells})`;
          })
          .join(' | ');
      }
      return item.valueJson.map((value) => stringifyUnknown(value)).join(', ');
    }

    if (typeof item.valueJson === 'object') {
      return Object.entries(item.valueJson as Record<string, unknown>)
        .map(([key, value]) => `${key}: ${stringifyUnknown(value)}`)
        .join(' | ');
    }

    return stringifyUnknown(item.valueJson);
  }

  return '-';
}

type ErpTableSnapshot = {
  schemaVersion: 1;
  /** `item_list`: retrato de um "Pedido de itens" (mesmo formato; colunas vêm da lista). */
  source?: { kind?: string };
  /** Só no "Pedido de itens" com total configurado. */
  total?: number | null;
  columns: {
    source: Array<{ key: string; label: string; type: ErpTableSourceColumnType }>;
    input: Array<{ id: string; label: string; type: ErpTableInputColumn['type'] }>;
  };
  rows: Array<{
    key: string;
    sourceValues: Record<string, ErpTableCellValue>;
    answers: Record<string, ErpTableCellValue>;
  }>;
};

/**
 * Retrato gravado de uma "Tabela dinâmica do ERP" (§6 do documento). Traz os rótulos das
 * colunas do momento do envio: a resposta antiga continua legível sem consultar o ERP nem
 * depender da versão atual do formulário.
 */
function readErpTableSnapshot(valueJson: unknown): ErpTableSnapshot | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const snapshot = valueJson as Partial<ErpTableSnapshot>;
  if (
    snapshot.schemaVersion !== 1 ||
    !Array.isArray(snapshot.rows) ||
    !snapshot.columns ||
    !Array.isArray(snapshot.columns.source) ||
    !Array.isArray(snapshot.columns.input)
  ) {
    return null;
  }
  return snapshot as ErpTableSnapshot;
}

export function responseItemToUi(item: ResponseItem, field?: ResponseFieldMeta) {
  const erpTable = readErpTableSnapshot(item.valueJson);
  if (erpTable) {
    const numeric = (type: string) => type === 'number' || type === 'currency';
    const fromList = erpTable.source?.kind === 'item_list';
    // O total tem o tipo do subtotal (última coluna de respostas do pedido).
    const subtotal = erpTable.columns.input.find((column) => column.id === '__subtotal');
    return {
      type: 'erp_table' as const,
      fromList,
      total:
        typeof erpTable.total === 'number'
          ? formatErpTableCell(erpTable.total, subtotal?.type ?? 'number')
          : null,
      columns: [
        ...erpTable.columns.source.map((column) => ({
          label: column.label,
          fromErp: !fromList,
          numeric: numeric(column.type),
        })),
        ...erpTable.columns.input.map((column) => ({
          label: column.label,
          fromErp: false,
          numeric: numeric(column.type),
        })),
      ],
      rows: erpTable.rows.map((row) => ({
        key: row.key,
        cells: [
          ...erpTable.columns.source.map((column) =>
            formatErpTableCell(row.sourceValues?.[column.key], column.type),
          ),
          ...erpTable.columns.input.map((column) =>
            formatErpTableCell(row.answers?.[column.id], column.type),
          ),
        ],
      })),
    };
  }

  if (field?.fieldType === 'single_select' && item.valueText) {
    return { type: 'text' as const, text: resolveOptionLabel(item.valueText, field.options) };
  }

  if (field?.fieldType === 'multi_select' && Array.isArray(item.valueJson)) {
    const chips = item.valueJson
      .map((value) => resolveOptionLabel(value, field.options))
      .filter(Boolean);
    return { type: 'chips' as const, chips: chips.length > 0 ? chips : ['-'] };
  }

  if (field?.fieldType === 'calculated') {
    const text = formatCalculatedValue(item.valueNumber, field.settingsJson);
    return { type: 'text' as const, text: text || '-' };
  }

  if (item.valueText && item.valueText.trim()) {
    return { type: 'text' as const, text: formatResponseText(item.valueText.trim()) };
  }

  if (typeof item.valueNumber === 'number') {
    return { type: 'text' as const, text: new Intl.NumberFormat('pt-BR').format(item.valueNumber) };
  }

  if (typeof item.valueBoolean === 'boolean') {
    return {
      type: 'badge' as const,
      text: item.valueBoolean ? 'Sim' : 'Não',
      className: item.valueBoolean
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-200 text-slate-700',
    };
  }

  if (item.valueJson !== null && item.valueJson !== undefined) {
    if (Array.isArray(item.valueJson)) {
      if (isProductTableRows(item.valueJson)) {
        const columns = collectProductTableColumns(item.valueJson);
        return {
          type: 'table' as const,
          columns,
          rows: item.valueJson.map((row) => ({
            produto: stringifyUnknown(row.produto),
            cells: columns.map((column) => stringifyUnknown(row.values?.[column])),
          })),
        };
      }
      const items = item.valueJson.map((value) => stringifyUnknown(value)).filter(Boolean);
      return { type: 'chips' as const, chips: items.length > 0 ? items : ['-'] };
    }

    if (typeof item.valueJson === 'object') {
      const entries = Object.entries(item.valueJson as Record<string, unknown>);
      if (entries.length === 0) {
        return { type: 'text' as const, text: '-' };
      }
      return {
        type: 'lines' as const,
        lines: entries.map(([key, value]) => `${key}: ${stringifyUnknown(value)}`),
      };
    }

    return { type: 'text' as const, text: stringifyUnknown(item.valueJson) };
  }

  return { type: 'text' as const, text: '-' };
}
