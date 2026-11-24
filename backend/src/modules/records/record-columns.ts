import { FormFieldType } from '../../common/enums/form-field-type.enum';
import type { FormFieldEntity, KanbanPhaseEntity, KanbanPhaseFieldEntity } from '../../database/entities';
import { resolveExportCellValue } from '../responses/responses.service';

/**
 * Colunas da tela Registros e do relatório. Uma coluna é identificada pela chave:
 *   sys:<nome>   dado do card (fase, status, responsável, datas...)
 *   form:<code>  resposta do formulário de abertura
 *   phase:<code> campo preenchido numa fase do Kanban
 * O servidor formata todos os valores (mesmo texto na tabela da tela e no PDF).
 */
export type RecordColumnGroup = 'system' | 'form' | 'phase';

/** Como a coluna se filtra: escolha entre opções, texto contido, sim/não, ou não filtra. */
export type RecordFilterKind = 'choice' | 'text' | 'boolean' | 'none';

export interface RecordColumnOption {
  value: string;
  label: string;
}

export interface RecordColumn {
  key: string;
  label: string;
  group: RecordColumnGroup;
  filter: RecordFilterKind;
  options?: RecordColumnOption[];
  /** Campo sensível que a pessoa não pode ver: sai como *** e não filtra. */
  masked?: boolean;
  /** Fase dona do campo (só `phase:`), para a tela agrupar. */
  phaseLabel?: string;
}

export const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  canceled: 'Cancelado',
  new: 'Novo',
  in_analysis: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  in_progress: 'Em andamento',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  waiting_integration: 'Aguardando integração',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const SLA_LABELS: Record<string, string> = {
  on_track: 'No prazo',
  warning: 'Atenção',
  breached: 'Vencido',
  paused: 'Pausado',
  completed: 'Concluído',
};

export const ORIGIN_LABELS: Record<string, string> = {
  form_submission: 'Formulário',
  manual: 'Manual',
  webhook: 'Integração',
};

const toOptions = (labels: Record<string, string>, values?: Iterable<string>): RecordColumnOption[] =>
  [...(values ?? Object.keys(labels))].map((value) => ({ value, label: labels[value] ?? value }));

/** Tipos que não guardam resposta própria (ou guardam como anexo) — não viram coluna. */
const NOT_A_COLUMN = new Set<string>([
  FormFieldType.TITLE,
  FormFieldType.DESCRIPTION,
  FormFieldType.DIVIDER,
  FormFieldType.FILE_DOWNLOAD,
  FormFieldType.FILE_UPLOAD,
]);

const CHOICE_TYPES = new Set<string>([FormFieldType.SINGLE_SELECT, FormFieldType.MULTI_SELECT]);

function filterKindFor(fieldType: string, hasOptions: boolean): RecordFilterKind {
  if (CHOICE_TYPES.has(fieldType) && hasOptions) return 'choice';
  if (fieldType === FormFieldType.CHECKBOX) return 'boolean';
  return 'text';
}

export interface SystemColumnContext {
  phases: Pick<KanbanPhaseEntity, 'id' | 'label'>[];
  /** Responsáveis que aparecem nos cards do processo. */
  assignees: Array<{ id: string; name: string }>;
  /** Status que aparecem nos cards (os legados também, se houver). */
  statuses: string[];
}

export function systemColumns(ctx: SystemColumnContext): RecordColumn[] {
  return [
    { key: 'sys:code', label: 'Código', group: 'system', filter: 'none' },
    { key: 'sys:title', label: 'Título', group: 'system', filter: 'text' },
    {
      key: 'sys:phase',
      label: 'Fase',
      group: 'system',
      filter: 'choice',
      options: ctx.phases.map((phase) => ({ value: phase.id, label: phase.label })),
    },
    {
      key: 'sys:status',
      label: 'Status',
      group: 'system',
      filter: 'choice',
      options: toOptions(STATUS_LABELS, ctx.statuses.length ? ctx.statuses : undefined),
    },
    { key: 'sys:priority', label: 'Prioridade', group: 'system', filter: 'choice', options: toOptions(PRIORITY_LABELS) },
    {
      key: 'sys:assignee',
      label: 'Responsável',
      group: 'system',
      filter: 'choice',
      options: [
        { value: '__none__', label: 'Sem responsável' },
        ...ctx.assignees.map((user) => ({ value: user.id, label: user.name })),
      ],
    },
    { key: 'sys:requester', label: 'Solicitante', group: 'system', filter: 'text' },
    { key: 'sys:requesterEmail', label: 'E-mail do solicitante', group: 'system', filter: 'text' },
    { key: 'sys:origin', label: 'Origem', group: 'system', filter: 'choice', options: toOptions(ORIGIN_LABELS) },
    { key: 'sys:sla', label: 'SLA', group: 'system', filter: 'choice', options: toOptions(SLA_LABELS) },
    { key: 'sys:createdAt', label: 'Aberto em', group: 'system', filter: 'none' },
    { key: 'sys:updatedAt', label: 'Atualizado em', group: 'system', filter: 'none' },
    { key: 'sys:phaseEnteredAt', label: 'Na fase desde', group: 'system', filter: 'none' },
  ];
}

/** Campo (de formulário ou de fase) no formato que o formatador entende. */
export interface ValueField {
  fieldType: string;
  options: Array<{ internalValue: string; displayLabel: string }>;
  settingsJson: Record<string, unknown> | null;
}

export interface FormFieldWithVersion {
  field: FormFieldEntity;
  versionNumber: number;
  sectionOrder: number;
}

/**
 * Um campo por código, com o rótulo e as opções da versão mais nova que o tem (as opções de versões
 * antigas entram também: resposta antiga continua com o rótulo certo). Ordem: a do formulário mais novo;
 * campos que só existem em versões antigas vão para o fim.
 */
export function collectFormFields(rows: FormFieldWithVersion[]): Map<string, ValueField & { label: string; isSensitive: boolean }> {
  const sorted = [...rows].sort(
    (a, b) =>
      b.versionNumber - a.versionNumber ||
      a.sectionOrder - b.sectionOrder ||
      a.field.order - b.field.order,
  );
  const byCode = new Map<string, ValueField & { label: string; isSensitive: boolean }>();
  for (const { field } of sorted) {
    if (NOT_A_COLUMN.has(field.fieldType)) continue;
    const options = (field.options ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((option) => ({ internalValue: option.internalValue, displayLabel: option.displayLabel }));
    const existing = byCode.get(field.code);
    if (!existing) {
      byCode.set(field.code, {
        label: field.label,
        fieldType: field.fieldType,
        options,
        settingsJson: field.settingsJson ?? null,
        // Sensível em qualquer versão conta: a resposta antiga foi coletada como sensível.
        isSensitive: !!field.isSensitive,
      });
      continue;
    }
    existing.isSensitive = existing.isSensitive || !!field.isSensitive;
    for (const option of options) {
      if (!existing.options.some((known) => known.internalValue === option.internalValue)) existing.options.push(option);
    }
  }
  return byCode;
}

export function formColumns(
  fields: Map<string, ValueField & { label: string; isSensitive: boolean }>,
  canSeeSensitive: boolean,
): RecordColumn[] {
  return [...fields.entries()].map(([code, field]) => {
    const masked = field.isSensitive && !canSeeSensitive;
    const filter = masked ? 'none' : filterKindFor(field.fieldType, field.options.length > 0);
    return {
      key: `form:${code}`,
      label: field.label,
      group: 'form' as const,
      filter,
      ...(filter === 'choice'
        ? { options: field.options.map((option) => ({ value: option.internalValue, label: option.displayLabel })) }
        : {}),
      ...(masked ? { masked: true } : {}),
    };
  });
}

/** Campo de fase como `ValueField` (as opções de fase são `{ value, label }`). */
export function phaseValueField(field: Pick<KanbanPhaseFieldEntity, 'fieldType' | 'optionsJson' | 'settingsJson'>): ValueField {
  return {
    fieldType: field.fieldType,
    options: (field.optionsJson ?? []).map((option) => ({ internalValue: option.value, displayLabel: option.label })),
    settingsJson: field.settingsJson ?? null,
  };
}

/**
 * Campos de fase, um por código (o valor é guardado por card + código). Repetido em duas fases, vale o
 * da fase que vem primeiro.
 */
export function phaseColumns(
  phases: Array<Pick<KanbanPhaseEntity, 'id' | 'label' | 'order'>>,
  fields: Array<Pick<KanbanPhaseFieldEntity, 'phaseId' | 'code' | 'label' | 'fieldType' | 'order' | 'optionsJson' | 'settingsJson'>>,
): { columns: RecordColumn[]; fields: Map<string, ValueField> } {
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const sorted = fields
    .flatMap((field) => {
      const phase = phaseById.get(field.phaseId);
      return phase && !NOT_A_COLUMN.has(field.fieldType) ? [{ field, phase }] : [];
    })
    .sort((a, b) => a.phase.order - b.phase.order || a.field.order - b.field.order);
  const columns: RecordColumn[] = [];
  const valueFields = new Map<string, ValueField>();
  for (const { field, phase } of sorted) {
    if (valueFields.has(field.code)) continue;
    const valueField = phaseValueField(field);
    valueFields.set(field.code, valueField);
    const filter = filterKindFor(field.fieldType, valueField.options.length > 0);
    columns.push({
      key: `phase:${field.code}`,
      label: field.label,
      group: 'phase',
      filter,
      phaseLabel: phase.label,
      ...(filter === 'choice'
        ? { options: valueField.options.map((option) => ({ value: option.internalValue, label: option.displayLabel })) }
        : {}),
    });
  }
  return { columns, fields: valueFields };
}

// ─── Formatação ────────────────────────────────────────────────────────────

const TIME_ZONE = 'America/Sao_Paulo';

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 10 }) : '';
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

interface TableSnapshot {
  schemaVersion: 1;
  total?: number | null;
  columns: {
    source: Array<{ key: string; label: string }>;
    input: Array<{ id: string; label: string }>;
  };
  rows: Array<{ sourceValues?: Record<string, unknown>; answers?: Record<string, unknown> }>;
}

function readTableSnapshot(value: unknown): TableSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Partial<TableSnapshot>;
  if (
    snapshot.schemaVersion !== 1 ||
    !Array.isArray(snapshot.rows) ||
    !snapshot.columns ||
    !Array.isArray(snapshot.columns.source) ||
    !Array.isArray(snapshot.columns.input)
  ) {
    return null;
  }
  return snapshot as TableSnapshot;
}

/**
 * "Tabela do ERP" / "Pedido de itens" numa linha: cada item com a primeira coluna da fonte como nome e
 * as colunas preenchidas entre parênteses. "Parafuso (Quantidade: 2); Porca (Quantidade: 5) · Total: 7"
 */
function summarizeTable(snapshot: TableSnapshot): string {
  const nameColumn = snapshot.columns.source[0]?.key;
  const parts = snapshot.rows.map((row) => {
    const name = nameColumn ? stringifyCell(row.sourceValues?.[nameColumn]) : '';
    const answers = snapshot.columns.input
      .filter((column) => column.id !== '__subtotal')
      .map((column) => {
        const cell = stringifyCell(row.answers?.[column.id]);
        return cell ? `${column.label}: ${cell}` : '';
      })
      .filter(Boolean)
      .join(', ');
    return answers ? `${name || 'Item'} (${answers})` : name;
  });
  const body = parts.filter(Boolean).join('; ');
  return typeof snapshot.total === 'number' ? `${body} · Total: ${formatNumber(snapshot.total)}` : body;
}

export interface StoredValue {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
}

/** Valor guardado (resposta ou campo de fase) como o texto que a tela e o PDF mostram. */
export function formatRecordValue(item: StoredValue, field: ValueField | undefined): string {
  const snapshot = readTableSnapshot(item.valueJson);
  if (snapshot) return summarizeTable(snapshot);

  const type = field?.fieldType;
  if (type === FormFieldType.DATE && item.valueText && /^\d{4}-\d{2}-\d{2}$/.test(item.valueText)) {
    const [y, m, d] = item.valueText.split('-');
    return `${d}/${m}/${y}`;
  }
  if (type === FormFieldType.DATETIME && item.valueText) {
    return formatDateTime(item.valueText) || item.valueText;
  }
  if (type === FormFieldType.CURRENCY && typeof item.valueNumber === 'number') {
    return item.valueNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (typeof item.valueBoolean === 'boolean' && item.valueText === null) {
    return item.valueBoolean ? 'Sim' : 'Não';
  }

  // Select, multi-select, calculado e tabela de produtos já têm regra no export das Respostas.
  const resolved = resolveExportCellValue(item, field as unknown as FormFieldEntity | undefined);
  if (typeof resolved === 'number' && type !== FormFieldType.CALCULATED) return formatNumber(resolved);
  if (typeof resolved === 'string' && item.valueJson && typeof item.valueJson === 'object' && resolved.startsWith('{')) {
    // Objeto sem regra própria (ex.: escolha do ERP sem rótulo): "chave: valor | ..."
    return Object.entries(item.valueJson as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${stringifyCell(value)}`)
      .join(' | ');
  }
  if (Array.isArray(item.valueJson) && typeof resolved === 'string' && resolved.startsWith('[')) {
    return (item.valueJson as unknown[]).map(stringifyCell).filter(Boolean).join(', ');
  }
  return stringifyCell(resolved);
}

/** Texto curto do id do card (o mesmo que o detalhe mostra como código). */
export function shortCode(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
