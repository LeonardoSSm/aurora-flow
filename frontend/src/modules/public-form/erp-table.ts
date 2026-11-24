import type {
  ErpTableInputColumn,
  ErpTableSourceColumnType,
  FieldSettings,
} from '../forms/types';
import type {
  ErpTableAnswer,
  ErpTableCellValue,
  ErpTableSourceRow,
  PublicAnswerValue,
  PublicFormField,
} from './types';

/*
 * Regras do campo "Tabela dinâmica do ERP" no formulário público. As mesmas validações de
 * célula rodam de novo no backend (erp-table.snapshot.ts) — aqui é para a pessoa ver o erro
 * na célula antes de enviar. Docs/campo_tabela_dinamica_erp_implantacao.md, §8 e §10.
 */

const MAX_TEXT = 1000;

export function isErpTableAnswer(value: PublicAnswerValue | undefined): value is ErpTableAnswer {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as ErpTableAnswer).kind === 'erp_table'
  );
}

export function getErpTableInputColumns(settings: FieldSettings): ErpTableInputColumn[] {
  return Array.isArray(settings.inputColumns) ? settings.inputColumns : [];
}

/** Valor de um campo usado como parâmetro: código da Lista do ERP, texto, número ou opção. */
function dependencyValue(value: PublicAnswerValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    const code = (value as { value?: unknown }).value;
    return typeof code === 'string' && code.trim() ? code.trim() : null;
  }
  return null;
}

/**
 * Valores atuais dos campos de que a tabela depende. `null` enquanto falta algum — a tabela não
 * consulta o ERP com parâmetro faltando (§10).
 */
export function getErpTableDependencies(
  field: PublicFormField,
  answersByCode: Record<string, PublicAnswerValue>,
): Record<string, string> | null {
  const codes = field.settingsJson.dependsOn ?? [];
  const values: Record<string, string> = {};
  for (const code of codes) {
    const value = dependencyValue(answersByCode[code]);
    if (value === null) return null;
    values[code] = value;
  }
  return values;
}

/** Chave estável dos valores das dependências: muda quando a pessoa troca o pedido. */
export function getDependencyKey(values: Record<string, string>): string {
  return JSON.stringify(Object.keys(values).sort().map((code) => [code, values[code]]));
}

export function hasFilledAnswers(answer: ErpTableAnswer, columns: ErpTableInputColumn[]): boolean {
  return Object.values(answer.answers).some((row) =>
    columns.some((column) => {
      const value = row[column.id];
      if (column.type === 'checkbox') return value === true && column.defaultValue !== true;
      return value !== null && value !== undefined && value !== '' && value !== column.defaultValue;
    }),
  );
}

function defaultAnswers(columns: ErpTableInputColumn[]): Record<string, ErpTableCellValue> {
  const answers: Record<string, ErpTableCellValue> = {};
  for (const column of columns) {
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
      answers[column.id] = column.defaultValue;
    } else if (column.type === 'checkbox') {
      answers[column.id] = false;
    }
  }
  return answers;
}

/**
 * Resposta nova a partir do que o ERP devolveu. Com `previous` (recarga depois de um 409),
 * mantém o que já foi digitado nas linhas que continuam e lista as linhas novas e as removidas
 * para a pessoa conferir antes de enviar de novo (§7.1).
 */
export function buildErpTableAnswer(
  loaded: { sourceHash: string; fetchedAt: string; rows: ErpTableSourceRow[] },
  dependencyKey: string,
  columns: ErpTableInputColumn[],
  previous?: ErpTableAnswer | null,
): ErpTableAnswer {
  const answers: ErpTableAnswer['answers'] = {};
  for (const row of loaded.rows) {
    answers[row.key] = previous?.answers[row.key] ?? defaultAnswers(columns);
  }

  let review: ErpTableAnswer['review'] = null;
  if (previous) {
    const before = new Set(previous.rows.map((row) => row.key));
    const after = new Set(loaded.rows.map((row) => row.key));
    review = {
      added: loaded.rows.filter((row) => !before.has(row.key)).map((row) => row.key),
      removed: previous.rows.filter((row) => !after.has(row.key)),
    };
  }

  return {
    kind: 'erp_table',
    dependencyKey,
    sourceHash: loaded.sourceHash,
    fetchedAt: loaded.fetchedAt,
    rows: loaded.rows,
    answers,
    stale: false,
    review,
  };
}

/** Mesma regra do backend (`validateCell`). `null` = célula ok. */
export function validateErpTableCell(
  column: ErpTableInputColumn,
  raw: ErpTableCellValue | undefined,
): string | null {
  if (column.type === 'checkbox') {
    return column.required && raw !== true ? 'Obrigatório.' : null;
  }
  const empty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());
  if (empty) return column.required ? 'Obrigatório.' : null;

  switch (column.type) {
    case 'text':
    case 'long_text': {
      const max = column.maxLength ?? MAX_TEXT;
      return typeof raw === 'string' && raw.trim().length > max ? `Até ${max} caracteres.` : null;
    }
    case 'number':
    case 'currency': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'Número inválido.';
      if (column.min !== null && column.min !== undefined && raw < column.min) {
        return `Mínimo ${column.min}.`;
      }
      if (column.max !== null && column.max !== undefined && raw > column.max) {
        return `Máximo ${column.max}.`;
      }
      const decimals = column.decimals ?? (column.type === 'currency' ? 2 : null);
      if (decimals !== null && Number(raw.toFixed(decimals)) !== raw) {
        return `Até ${decimals} casa(s) decimal(is).`;
      }
      return null;
    }
    case 'date':
      return typeof raw === 'string' && isIsoDate(raw) ? null : 'Data inválida.';
    case 'select':
      return typeof raw === 'string' && (column.options ?? []).includes(raw)
        ? null
        : 'Opção inválida.';
  }
  return null;
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** Erros por linha e coluna: `{ [chaveDaLinha]: { [idDaColuna]: mensagem } }`. */
export function getErpTableCellErrors(
  field: PublicFormField,
  answer: ErpTableAnswer,
): Record<string, Record<string, string>> {
  const columns = getErpTableInputColumns(field.settingsJson);
  const errors: Record<string, Record<string, string>> = {};
  for (const row of answer.rows) {
    for (const column of columns) {
      const message = validateErpTableCell(column, answer.answers[row.key]?.[column.id]);
      if (message) {
        errors[row.key] = { ...(errors[row.key] ?? {}), [column.id]: message };
      }
    }
  }
  return errors;
}

/** Erro do campo inteiro (aparece embaixo da tabela e bloqueia o envio). */
export function validateErpTableAnswer(
  field: PublicFormField,
  value: PublicAnswerValue,
): string | null {
  const answer = isErpTableAnswer(value) ? value : null;
  if (!answer || answer.stale) {
    return field.required ? 'Carregue a tabela do ERP antes de enviar.' : null;
  }
  if (answer.outdated) {
    return 'O registro mudou. Carregue os itens do novo registro antes de enviar.';
  }
  if (answer.review) {
    return 'Os itens mudaram no ERP. Confira a tabela e confirme antes de enviar.';
  }
  if (field.required && answer.rows.length === 0) {
    return 'O registro não tem itens no ERP.';
  }
  const errors = getErpTableCellErrors(field, answer);
  const count = Object.values(errors).reduce((sum, row) => sum + Object.keys(row).length, 0);
  if (count > 0) {
    return count === 1 ? 'Corrija 1 célula da tabela.' : `Corrija ${count} células da tabela.`;
  }
  return null;
}

/** O que vai no envio: hash, todas as linhas pela chave e só as colunas preenchíveis. */
export function toErpTableSubmitValue(field: PublicFormField, answer: ErpTableAnswer) {
  const columns = getErpTableInputColumns(field.settingsJson);
  return {
    sourceHash: answer.sourceHash,
    rows: answer.rows.map((row) => {
      const current = answer.answers[row.key] ?? {};
      const answers: Record<string, ErpTableCellValue> = {};
      for (const column of columns) {
        const value = current[column.id];
        if (value === undefined || value === null || value === '') continue;
        answers[column.id] = typeof value === 'string' ? value.trim() : value;
      }
      return { key: row.key, answers };
    }),
  };
}

const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });
const CURRENCY = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 4,
});

/** Célula vinda do ERP (ou gravada no retrato) formatada para exibir. */
export function formatErpTableCell(
  value: ErpTableCellValue | undefined,
  type: ErpTableSourceColumnType | ErpTableInputColumn['type'],
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    return type === 'currency' ? CURRENCY.format(value) : NUMBER.format(value);
  }
  if (type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return value;
}
