import { createHash } from 'crypto';
import {
  ERP_TABLE_MAX_TEXT,
  type ErpTableInputColumn,
  type ErpTableSettings,
  type ErpTableSourceColumn,
} from './erp-table.settings';

/*
 * Hash, validação das células e retrato gravado de um campo "Tabela dinâmica do ERP".
 * Docs/campo_tabela_dinamica_erp_implantacao.md, §6, §7.4 e §8.
 */

export type ErpCellValue = string | number | boolean | null;

/** Uma linha como o ERP devolveu (já tipada pela API erp-lookup). */
export interface ErpTableRow {
  key: string;
  values: Record<string, ErpCellValue>;
}

/** O que fica gravado em `value_json`. */
export interface ErpTableAnswer {
  schemaVersion: 1;
  source: {
    dataset: string;
    dependencies: Record<string, string>;
    fetchedAt: string;
    sourceHash: string;
  };
  columns: {
    source: Array<Pick<ErpTableSourceColumn, 'key' | 'label' | 'type'>>;
    input: Array<Pick<ErpTableInputColumn, 'id' | 'label' | 'type' | 'decimals'>>;
  };
  rows: Array<{
    key: string;
    sourceValues: Record<string, ErpCellValue>;
    answers: Record<string, ErpCellValue>;
  }>;
}

/** O que o navegador manda no envio: só o hash, as chaves e as respostas. */
export interface ErpTableSubmission {
  sourceHash: string;
  rows: Array<{ key: string; answers: Record<string, unknown> }>;
}

/** Uma célula do Google Sheets aceita 50.000 caracteres; sobra folga para o sufixo. */
export const ERP_TABLE_SUMMARY_MAX = 45_000;
const MAX_ERRORS_IN_MESSAGE = 5;

/** Só as colunas configuradas, na ordem da configuração: é o que o navegador pode ver. */
export function projectRows(
  rows: ErpTableRow[],
  sourceColumns: ErpTableSourceColumn[],
): ErpTableRow[] {
  return rows.map((row) => ({
    key: row.key,
    values: Object.fromEntries(
      sourceColumns.map((column) => [column.key, row.values[column.key] ?? null]),
    ),
  }));
}

/**
 * Hash do que o formulário mostra: chaves na ordem do ERP + valores das colunas configuradas.
 * Colunas que o formulário não exibe ficam fora — mudar a quantidade faturada não pode dar 409
 * num formulário que nem mostra essa coluna.
 */
export function computeErpTableHash(
  rows: ErpTableRow[],
  sourceColumns: ErpTableSourceColumn[],
): string {
  const keys = sourceColumns.map((column) => column.key);
  const payload = {
    columns: keys,
    rows: rows.map((row) => [row.key, keys.map((key) => row.values[key] ?? null)]),
  };
  return `sha256-${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

/** Lê o `valueJson` do envio sem confiar em nada além do formato. `null` = formato inválido. */
export function readErpTableSubmission(valueJson: unknown): ErpTableSubmission | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const { sourceHash, rows } = valueJson as { sourceHash?: unknown; rows?: unknown };
  if (typeof sourceHash !== 'string' || sourceHash.length > 100 || !Array.isArray(rows)) {
    return null;
  }
  const parsed: ErpTableSubmission['rows'] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const { key, answers } = row as { key?: unknown; answers?: unknown };
    if (typeof key !== 'string' || key.length === 0) return null;
    if (
      answers !== undefined &&
      (!answers || typeof answers !== 'object' || Array.isArray(answers))
    ) {
      return null;
    }
    parsed.push({ key, answers: (answers ?? {}) as Record<string, unknown> });
  }
  return { sourceHash, rows: parsed };
}

/**
 * Cruza as linhas do ERP (consultadas agora, no servidor) com as respostas do navegador e
 * valida cada célula. As linhas têm de ser exatamente as do ERP: faltando, sobrando ou repetida
 * é adulteração (o hash já bateu, então o navegador viu as mesmas linhas).
 */
export function buildErpTableAnswerRows(
  settings: ErpTableSettings,
  serverRows: ErpTableRow[],
  submitted: ErpTableSubmission,
): { rows: ErpTableAnswer['rows']; errors: string[] } {
  const errors: string[] = [];
  const submittedByKey = new Map<string, Record<string, unknown>>();
  for (const row of submitted.rows) {
    if (submittedByKey.has(row.key)) {
      return { rows: [], errors: ['As linhas enviadas não conferem com o ERP.'] };
    }
    submittedByKey.set(row.key, row.answers);
  }
  const serverKeys = new Set(serverRows.map((row) => row.key));
  if (
    submittedByKey.size !== serverRows.length ||
    [...submittedByKey.keys()].some((key) => !serverKeys.has(key))
  ) {
    return { rows: [], errors: ['As linhas enviadas não conferem com o ERP.'] };
  }

  const inputIds = new Set(settings.inputColumns.map((column) => column.id));
  const rows = serverRows.map((serverRow, index) => {
    const raw = submittedByKey.get(serverRow.key) ?? {};
    const unknown = Object.keys(raw).filter((id) => !inputIds.has(id));
    if (unknown.length > 0) {
      errors.push(`Item ${index + 1}: coluna desconhecida (${unknown.join(', ')}).`);
    }
    const answers: Record<string, ErpCellValue> = {};
    for (const column of settings.inputColumns) {
      const result = validateCell(column, raw[column.id]);
      if ('error' in result) {
        errors.push(
          `Item ${index + 1} (${rowLabel(settings, serverRow)}): ${column.label} — ${result.error}`,
        );
        answers[column.id] = null;
      } else {
        answers[column.id] = result.value;
      }
    }
    return {
      key: serverRow.key,
      sourceValues: Object.fromEntries(
        settings.sourceColumns.map((column) => [column.key, serverRow.values[column.key] ?? null]),
      ),
      answers,
    };
  });

  return { rows, errors };
}

/** Mensagem única para o campo: as primeiras falhas e quantas mais há. */
export function summarizeErrors(errors: string[]): string {
  const shown = errors.slice(0, MAX_ERRORS_IN_MESSAGE).join(' ');
  const rest = errors.length - MAX_ERRORS_IN_MESSAGE;
  return rest > 0 ? `${shown} E mais ${rest} problema(s).` : shown;
}

function rowLabel(settings: ErpTableSettings, row: ErpTableRow): string {
  const first = settings.sourceColumns[0];
  const value = first ? row.values[first.key] : null;
  return value === null || value === undefined ? row.key : String(value);
}

type CellResult = { value: ErpCellValue } | { error: string };

export function validateCell(column: ErpTableInputColumn, raw: unknown): CellResult {
  const empty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());

  if (column.type === 'checkbox') {
    if (raw !== undefined && raw !== null && typeof raw !== 'boolean') {
      return { error: 'valor inválido.' };
    }
    const checked = raw === true;
    return column.required && !checked ? { error: 'obrigatório.' } : { value: checked };
  }

  if (empty) {
    return column.required ? { error: 'obrigatório.' } : { value: null };
  }

  switch (column.type) {
    case 'text':
    case 'long_text': {
      if (typeof raw !== 'string') return { error: 'deve ser texto.' };
      const value = raw.trim();
      const max = column.maxLength ?? ERP_TABLE_MAX_TEXT;
      return value.length > max ? { error: `até ${max} caracteres.` } : { value };
    }
    case 'number':
    case 'currency': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: 'deve ser um número.' };
      if (column.min !== null && raw < column.min) return { error: `mínimo ${column.min}.` };
      if (column.max !== null && raw > column.max) return { error: `máximo ${column.max}.` };
      if (column.decimals !== null && Number(raw.toFixed(column.decimals)) !== raw) {
        return { error: `até ${column.decimals} casa(s) decimal(is).` };
      }
      return { value: raw };
    }
    case 'date': {
      if (typeof raw !== 'string' || !isIsoDate(raw)) return { error: 'data inválida.' };
      return { value: raw };
    }
    case 'select': {
      if (typeof raw !== 'string' || !column.options.includes(raw)) {
        return { error: 'opção inválida.' };
      }
      return { value: raw };
    }
  }
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });
const CURRENCY = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 4,
});

export function formatErpCell(value: ErpCellValue, type: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number')
    return type === 'currency' ? CURRENCY.format(value) : NUMBER.format(value);
  if (type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return value;
}

/**
 * Texto gravado em `value_text` — o que CSV, Excel, Google Sheets e `{{campo}}` dos fluxos
 * mostram. Uma linha por item: as duas primeiras colunas do ERP juntas ("101 - Produto A"), as
 * demais como "rótulo: valor". Cortado em 45.000 caracteres com "… (+N itens)".
 */
export function buildErpTableSummary(answer: Pick<ErpTableAnswer, 'columns' | 'rows'>): string {
  const lines = answer.rows.map((row) => {
    const [first, second, ...restSource] = answer.columns.source;
    const head = [first, second]
      .filter((column): column is NonNullable<typeof column> => !!column)
      .map((column) => formatErpCell(row.sourceValues[column.key] ?? null, column.type))
      .filter((value): value is string => value !== null)
      .join(' - ');
    const labelled = [
      ...restSource.map((column) => ({
        label: column.label,
        value: formatErpCell(row.sourceValues[column.key] ?? null, column.type),
      })),
      ...answer.columns.input.map((column) => ({
        label: column.label,
        value: formatErpCell(row.answers[column.id] ?? null, column.type),
      })),
    ]
      .filter((part) => part.value !== null)
      .map((part) => `${part.label}: ${part.value}`);
    return [head, ...labelled].filter(Boolean).join(' | ');
  });

  let summary = '';
  for (let index = 0; index < lines.length; index++) {
    const next = summary ? `${summary}\n${lines[index]}` : lines[index];
    if (next.length > ERP_TABLE_SUMMARY_MAX) {
      return `${summary}\n… (+${lines.length - index} itens)`;
    }
    summary = next;
  }
  return summary;
}
