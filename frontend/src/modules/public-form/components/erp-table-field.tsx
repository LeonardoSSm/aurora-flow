import axios from 'axios';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { getErpTableErrorMessage, loadErpTableField } from '../../erp-lookup/erp-lookup-api';
import type { ErpTableInputColumn, ErpTableSourceColumn } from '../../forms/types';
import {
  buildErpTableAnswer,
  formatErpTableCell,
  getDependencyKey,
  getErpTableCellErrors,
  getErpTableDependencies,
  getErpTableInputColumns,
  hasFilledAnswers,
  isErpTableAnswer,
} from '../erp-table';
import type {
  ErpTableCellValue,
  ErpTableSourceRow,
  PublicAnswerValue,
  PublicFormField,
} from '../types';

/** Linhas por página: tabela grande (até 500 itens) não trava o formulário. */
export const ERP_TABLE_PAGE_SIZE = 50;

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 34,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--tf-border)',
  fontSize: 13,
  color: 'var(--tf-text)',
  background: 'var(--tf-background)',
};

const erpCellStyle: React.CSSProperties = {
  color: 'var(--tf-text)',
  background: 'var(--tf-surface)',
};

const bannerStyle: React.CSSProperties = {
  border: '1px solid var(--tf-border)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--tf-surface)',
  color: 'var(--tf-text)',
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--tf-border)',
  background: 'var(--tf-background)',
  color: 'var(--tf-text)',
  fontSize: 13,
  fontWeight: 600,
};

/** Selo que marca as colunas que vêm do ERP (só leitura). */
function ErpBadge() {
  return (
    <span
      className="ml-1 inline-flex items-center rounded px-1 align-middle text-[10px] font-bold"
      style={{ background: 'var(--tf-border)', color: 'var(--tf-text-muted)' }}
      title="Valor vindo do ERP — não pode ser alterado"
    >
      ERP
    </span>
  );
}

/**
 * Campo "Tabela dinâmica do ERP": uma linha por item que o ERP devolve para o valor dos campos
 * de que a tabela depende (ex.: o pedido escolhido na Lista do ERP). As colunas do ERP são só
 * leitura; as colunas do formulário são preenchidas em cada linha. Sem `formId` (construtor),
 * mostra só a estrutura. Docs/campo_tabela_dinamica_erp_implantacao.md §10.
 */
export function ErpTableField({
  field,
  value,
  formId,
  answersByCode,
  showErrors,
  onChange,
}: {
  field: PublicFormField;
  value: PublicAnswerValue;
  formId?: string;
  answersByCode?: Record<string, PublicAnswerValue>;
  /** O envio já foi tentado: mostra o erro de todas as células, não só das que foram editadas. */
  showErrors?: boolean;
  onChange: (value: PublicAnswerValue) => void;
}) {
  const sourceColumns: ErpTableSourceColumn[] = field.settingsJson.sourceColumns ?? [];
  const inputColumns = getErpTableInputColumns(field.settingsJson);
  const answer = isErpTableAnswer(value) ? value : null;
  const dependencies = answersByCode ? getErpTableDependencies(field, answersByCode) : null;
  const dependencyKey = dependencies ? getDependencyKey(dependencies) : null;

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());

  // O efeito de carga não pode depender da identidade de `onChange`/`answer` (mudam a cada
  // render): lê sempre o valor mais recente pelos refs.
  const answerRef = useRef(answer);
  answerRef.current = answer;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!formId) return;
    const current = answerRef.current;
    const emit = (next: PublicAnswerValue) => onChangeRef.current(next);

    if (dependencies === null || dependencyKey === null) {
      // Dependência apagada: sem respostas, a tabela some; com respostas, fica bloqueada.
      if (current && !current.outdated) {
        emit(hasFilledAnswers(current, inputColumns) ? { ...current, outdated: true } : null);
      }
      setLoadError(null);
      return;
    }

    if (current && !current.stale) {
      if (current.dependencyKey === dependencyKey) {
        if (current.outdated) emit({ ...current, outdated: false });
        return;
      }
      if (hasFilledAnswers(current, inputColumns)) {
        // Outro pedido com a tabela já preenchida: só troca quando a pessoa confirmar.
        if (!current.outdated) emit({ ...current, outdated: true });
        return;
      }
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    loadErpTableField(formId, field.code, dependencies, controller.signal)
      .then((result) => {
        const previous = answerRef.current?.stale ? answerRef.current : null;
        emit(buildErpTableAnswer(result, dependencyKey, inputColumns, previous));
        setPage(0);
        setTouched(new Set());
      })
      .catch((error: unknown) => {
        if (axios.isCancel(error) || controller.signal.aborted) return;
        setLoadError(getErpTableErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `dependencies` e `inputColumns` são derivados de `dependencyKey` e do campo; resposta e
    // `onChange` são lidos pelos refs.
  }, [formId, field.code, dependencyKey, answer?.dependencyKey, answer?.stale, retry]);

  if (!formId) {
    return <ErpTableStructurePreview sourceColumns={sourceColumns} inputColumns={inputColumns} />;
  }

  function updateCell(rowKey: string, columnId: string, cellValue: ErpTableCellValue) {
    if (!answer) return;
    setTouched((current) => new Set(current).add(`${rowKey}|${columnId}`));
    onChange({
      ...answer,
      answers: {
        ...answer.answers,
        [rowKey]: { ...(answer.answers[rowKey] ?? {}), [columnId]: cellValue },
      },
    });
  }

  if (dependencies === null && !answer) {
    return (
      <p className="text-sm" style={{ color: 'var(--tf-text-muted)' }}>
        Preencha os campos anteriores para carregar os itens do ERP.
      </p>
    );
  }

  if (loading && !answer) {
    return (
      <p className="flex items-center gap-2 text-sm" role="status" style={{ color: 'var(--tf-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando itens do ERP…
      </p>
    );
  }

  if (loadError && (!answer || answer.stale)) {
    return (
      <div className="grid gap-2" style={bannerStyle} role="alert">
        <span>{loadError}</span>
        <button type="button" style={buttonStyle} onClick={() => setRetry((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!answer) return null;

  const cellErrors = getErpTableCellErrors(field, answer);
  const visibleError = (rowKey: string, columnId: string): string | undefined => {
    const message = cellErrors[rowKey]?.[columnId];
    return message && (showErrors || touched.has(`${rowKey}|${columnId}`)) ? message : undefined;
  };
  const added = new Set(answer.review?.added ?? []);
  const pageCount = Math.max(1, Math.ceil(answer.rows.length / ERP_TABLE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = answer.rows.slice(
    safePage * ERP_TABLE_PAGE_SIZE,
    (safePage + 1) * ERP_TABLE_PAGE_SIZE,
  );
  const rowNumber = (index: number) => safePage * ERP_TABLE_PAGE_SIZE + index + 1;
  const locked = answer.outdated === true;

  return (
    <div className="grid gap-2.5">
      {answer.outdated ? (
        <div className="grid gap-2" style={bannerStyle} role="alert">
          <span>
            {dependencies
              ? 'O registro mudou. Os valores preenchidos abaixo são do registro anterior e serão apagados ao carregar os itens do novo.'
              : 'O campo de que esta tabela depende ficou vazio. Preencha-o de novo para continuar.'}
          </span>
          {dependencies ? (
            <button type="button" style={buttonStyle} onClick={() => onChange(null)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Carregar itens do novo registro
            </button>
          ) : null}
        </div>
      ) : null}

      {answer.review ? (
        <div className="grid gap-2" style={bannerStyle} role="alert">
          <span>
            Os itens foram alterados no ERP.
            {answer.review.added.length > 0
              ? ` ${answer.review.added.length} item(ns) novo(s), destacado(s) na tabela.`
              : ''}
            {answer.review.removed.length > 0
              ? ` ${answer.review.removed.length} item(ns) removido(s):`
              : ''}{' '}
            Os valores das linhas que continuam foram mantidos.
          </span>
          {answer.review.removed.length > 0 ? (
            <ul className="list-disc pl-5 text-xs" style={{ color: 'var(--tf-text-muted)' }}>
              {answer.review.removed.map((row) => (
                <li key={row.key}>{describeRow(row, sourceColumns)}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            style={buttonStyle}
            onClick={() => onChange({ ...answer, review: null })}
          >
            Conferi os itens
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-xs" role="status" style={{ color: 'var(--tf-text-muted)' }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Atualizando itens do ERP…
        </p>
      ) : null}

      {answer.rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--tf-text-muted)' }}>
          Nenhum item encontrado no ERP para este registro.
        </p>
      ) : (
        <fieldset disabled={locked} style={{ opacity: locked ? 0.55 : 1, border: 0, padding: 0, margin: 0 }}>
          {/* Telas estreitas: um cartão por item. */}
          <div className="grid gap-3 sm:hidden">
            {pageRows.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-2.5"
                style={{
                  border: `1.5px solid ${added.has(row.key) ? 'var(--tf-primary)' : 'var(--tf-border)'}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <span className="text-xs font-bold" style={{ color: 'var(--tf-text-muted)' }}>
                  Item {rowNumber(index)}
                  {added.has(row.key) ? ' · novo' : ''}
                </span>
                {sourceColumns.map((column) => (
                  <div key={column.key} className="grid gap-0.5">
                    <span
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--tf-text-muted)' }}
                    >
                      {column.label}
                      <ErpBadge />
                    </span>
                    <span className="text-sm" style={{ color: 'var(--tf-text)' }}>
                      {formatErpTableCell(row.values[column.key], column.type)}
                    </span>
                  </div>
                ))}
                {inputColumns.map((column) => (
                  <label key={column.id} className="grid gap-1">
                    <span
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--tf-text-muted)' }}
                    >
                      {column.label}
                      {column.required ? <span style={{ color: 'var(--tf-danger)' }}> *</span> : null}
                    </span>
                    <CellInput
                      column={column}
                      value={answer.answers[row.key]?.[column.id]}
                      error={visibleError(row.key, column.id)}
                      ariaLabel={`${column.label} — item ${rowNumber(index)}`}
                      onChange={(next) => updateCell(row.key, column.id, next)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>

          {/* Telas maiores: tabela com cabeçalho fixo dentro de uma área com rolagem. */}
          <div
            className="hidden overflow-auto sm:block"
            style={{ maxHeight: 520, border: '1px solid var(--tf-border)', borderRadius: 10 }}
          >
            <table className="w-full border-collapse text-sm" style={{ minWidth: 120 * (sourceColumns.length + inputColumns.length) }}>
              <caption className="sr-only">
                {field.label}: {answer.rows.length} item(ns) do ERP
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 px-2 py-2 text-left text-xs font-bold"
                    style={{ background: 'var(--tf-surface)', color: 'var(--tf-text-muted)', width: 40 }}
                  >
                    #
                  </th>
                  {sourceColumns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="sticky top-0 z-10 px-2 py-2 text-left text-xs font-bold uppercase tracking-wide"
                      style={{ background: 'var(--tf-surface)', color: 'var(--tf-text-muted)' }}
                    >
                      {column.label}
                      <ErpBadge />
                    </th>
                  ))}
                  {inputColumns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className="sticky top-0 z-10 px-2 py-2 text-left text-xs font-bold uppercase tracking-wide"
                      style={{ background: 'var(--tf-surface)', color: 'var(--tf-text)' }}
                      title={column.helpText ?? undefined}
                    >
                      {column.label}
                      {column.required ? <span style={{ color: 'var(--tf-danger)' }}> *</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr
                    key={row.key}
                    style={{
                      borderTop: '1px solid var(--tf-border)',
                      // O tema escuro do app pinta `tbody tr:hover`; o formulário público tem
                      // tema próprio (--tf-*), então a linha não herda esse hover.
                      backgroundColor: 'transparent',
                      boxShadow: added.has(row.key) ? 'inset 3px 0 0 var(--tf-primary)' : undefined,
                    }}
                  >
                    <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--tf-text-muted)' }}>
                      {rowNumber(index)}
                    </td>
                    {sourceColumns.map((column) => (
                      <td
                        key={column.key}
                        className="px-2 py-1.5"
                        style={{
                          ...erpCellStyle,
                          textAlign:
                            column.type === 'number' || column.type === 'currency' ? 'right' : 'left',
                        }}
                      >
                        {formatErpTableCell(row.values[column.key], column.type)}
                      </td>
                    ))}
                    {inputColumns.map((column) => (
                      <td key={column.id} className="px-2 py-1 align-top" style={{ minWidth: 120 }}>
                        <CellInput
                          column={column}
                          value={answer.answers[row.key]?.[column.id]}
                          error={visibleError(row.key, column.id)}
                          ariaLabel={`${column.label} — item ${rowNumber(index)}`}
                          onChange={(next) => updateCell(row.key, column.id, next)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <nav
              className="mt-2 flex items-center justify-between gap-2 text-xs"
              aria-label="Páginas da tabela"
              style={{ color: 'var(--tf-text-muted)' }}
            >
              <button
                type="button"
                style={buttonStyle}
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Anterior
              </button>
              <span>
                Itens {safePage * ERP_TABLE_PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * ERP_TABLE_PAGE_SIZE, answer.rows.length)} de {answer.rows.length}
              </span>
              <button
                type="button"
                style={buttonStyle}
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Próxima
              </button>
            </nav>
          ) : null}
        </fieldset>
      )}
    </div>
  );
}

function describeRow(row: ErpTableSourceRow, columns: ErpTableSourceColumn[]): string {
  const parts = columns
    .slice(0, 2)
    .map((column) => formatErpTableCell(row.values[column.key], column.type))
    .filter((text) => text !== '—');
  return parts.length > 0 ? parts.join(' - ') : row.key;
}

export function CellInput({
  column,
  value,
  error,
  ariaLabel,
  onChange,
}: {
  column: ErpTableInputColumn;
  value: ErpTableCellValue | undefined;
  error?: string;
  ariaLabel: string;
  onChange: (value: ErpTableCellValue) => void;
}) {
  const errorId = useId();
  const style: React.CSSProperties = {
    ...cellInputStyle,
    borderColor: error ? 'var(--tf-danger)' : 'var(--tf-border)',
  };
  const common = {
    'aria-label': ariaLabel,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    title: column.helpText ?? undefined,
  };

  let input: React.ReactNode;
  switch (column.type) {
    case 'checkbox':
      input = (
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--tf-primary)' }}
        />
      );
      break;
    case 'select':
      input = (
        <select
          {...common}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          style={style}
        >
          <option value="">Selecione</option>
          {(column.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
    case 'currency': {
      const decimals = column.decimals ?? (column.type === 'currency' ? 2 : null);
      input = (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          step={decimals === null ? 'any' : decimals === 0 ? 1 : 1 / 10 ** decimals}
          min={column.min ?? undefined}
          max={column.max ?? undefined}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => {
            const raw = event.target.value;
            const parsed = Number(raw);
            onChange(raw === '' ? null : Number.isFinite(parsed) ? parsed : null);
          }}
          style={{ ...style, textAlign: 'right' }}
        />
      );
      break;
    }
    case 'date':
      input = (
        <input
          {...common}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          style={style}
        />
      );
      break;
    case 'long_text':
      input = (
        <textarea
          {...common}
          rows={2}
          maxLength={column.maxLength ?? 1000}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          style={{ ...style, resize: 'vertical' }}
        />
      );
      break;
    default:
      input = (
        <input
          {...common}
          type="text"
          maxLength={column.maxLength ?? 1000}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          style={style}
        />
      );
  }

  return (
    <div className="grid gap-0.5">
      {input}
      {error ? (
        <span id={errorId} className="text-[11px] font-semibold" style={{ color: 'var(--tf-danger)' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Construtor/pré-visualização: só a estrutura (colunas), as linhas vêm do ERP. */
function ErpTableStructurePreview({
  sourceColumns,
  inputColumns,
}: {
  sourceColumns: ErpTableSourceColumn[];
  inputColumns: ErpTableInputColumn[];
}) {
  if (sourceColumns.length === 0 && inputColumns.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--tf-text-muted)' }}>
        Escolha a tabela e as colunas do ERP nas configurações do campo.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto" style={{ border: '1px dashed var(--tf-border)', borderRadius: 10 }}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            {sourceColumns.map((column) => (
              <th
                key={column.key}
                className="px-2 py-2 text-left text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--tf-text-muted)' }}
              >
                {column.label}
                <ErpBadge />
              </th>
            ))}
            {inputColumns.map((column) => (
              <th
                key={column.id}
                className="px-2 py-2 text-left text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--tf-text)' }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              colSpan={Math.max(1, sourceColumns.length + inputColumns.length)}
              className="px-2 py-3 text-center text-xs"
              style={{ color: 'var(--tf-text-muted)' }}
            >
              <Database className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Uma linha por item do ERP, carregada quando o formulário for preenchido.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

