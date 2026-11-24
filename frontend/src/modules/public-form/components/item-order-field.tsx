import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fetchItemList, itemListKeys } from '../../item-lists/item-lists-api';
import { formatErpTableCell } from '../erp-table';
import {
  computeItemOrderTotals,
  getItemOrderCellErrors,
  getItemOrderColumns,
  getItemOrderItems,
  isItemOrderAnswer,
  newItemOrderAnswers,
  previewItemOrderSettings,
  searchItemOrderItems,
} from '../item-order';
import type { ErpTableCellValue, ErpTableSourceRow, PublicAnswerValue, PublicFormField } from '../types';
import { CellInput } from './erp-table-field';

const searchStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 38,
  padding: '0 12px 0 34px',
  borderRadius: 10,
  border: '1.5px solid var(--tf-border)',
  fontSize: 14,
  color: 'var(--tf-text)',
  background: 'var(--tf-background)',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid var(--tf-border)',
  background: 'var(--tf-background)',
  color: 'var(--tf-text-muted)',
};

const mutedText: React.CSSProperties = { color: 'var(--tf-text-muted)' };

/**
 * Campo "Pedido de itens": em vez de mostrar a lista inteira, a pessoa pesquisa pelo nome ou
 * código, adiciona o item e preenche as colunas do formulário (ex.: Quantidade). Colunas da lista
 * são só leitura; com total configurado, cada item mostra o subtotal e o pedido, o total. Os itens
 * vêm junto do formulário publicado (`settingsJson.items`). Sem `formId` (pré-visualização do
 * construtor, com a pessoa logada), a lista é carregada aqui e montada como o servidor montaria.
 */
export function ItemOrderField({
  field,
  formId,
  ...props
}: ItemOrderFieldProps & {
  /** Formulário publicado: os itens vêm do servidor. Sem ele, pré-visualização do construtor. */
  formId?: string;
}) {
  const previewListId =
    !formId && getItemOrderItems(field.settingsJson).length === 0
      ? field.settingsJson.itemListId
      : undefined;
  const listQuery = useQuery({
    queryKey: itemListKeys.detail(previewListId ?? null),
    queryFn: () => fetchItemList(previewListId as string),
    enabled: Boolean(previewListId),
    staleTime: 30_000,
    retry: false,
  });
  const previewField = useMemo(
    () =>
      previewListId && listQuery.data
        ? { ...field, settingsJson: previewItemOrderSettings(field.settingsJson, listQuery.data) }
        : field,
    [field, previewListId, listQuery.data],
  );

  if (previewListId && listQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm" role="status" style={mutedText}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando os itens da lista…
      </p>
    );
  }
  return <ItemOrderFieldView field={previewField} {...props} />;
}

type ItemOrderFieldProps = {
  field: PublicFormField;
  value: PublicAnswerValue;
  /** O envio já foi tentado: mostra o erro de todas as células, não só das editadas. */
  showErrors?: boolean;
  onChange: (value: PublicAnswerValue) => void;
};

function ItemOrderFieldView({ field, value, showErrors, onChange }: ItemOrderFieldProps) {
  const { sourceColumns, inputColumns } = getItemOrderColumns(field.settingsJson);
  const items = getItemOrderItems(field.settingsJson);
  const answer = isItemOrderAnswer(value) ? value : null;
  const rows = answer?.rows ?? [];
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const addedKeys = new Set(rows.map((row) => row.key));
  const shownColumns = sourceColumns;
  const total = field.settingsJson.total;
  const subtotalColumn = total ? { label: 'Subtotal', type: total.type } : null;
  const totals = computeItemOrderTotals(field, answer);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const listboxId = useId();
  const rowsRef = useRef<HTMLDivElement>(null);
  const results = searchItemOrderItems(items, query);

  // Item recém-adicionado: o foco vai para a primeira coluna a preencher (ex.: Quantidade).
  useEffect(() => {
    if (!focusKey) return;
    // O item aparece duas vezes (cartão no celular, linha na tabela): vale o que está visível.
    const row = `[data-item-row="${CSS.escape(focusKey)}"]`;
    const inputs = rowsRef.current?.querySelectorAll<HTMLElement>(`${row} input, ${row} select`);
    const target = [...(inputs ?? [])].find((element) => element.offsetParent !== null);
    target?.focus();
    // A quantidade já vem com o mínimo: selecionada, o que for digitado substitui.
    if (target instanceof HTMLInputElement && target.type !== 'checkbox') target.select();
    setFocusKey(null);
  }, [focusKey]);

  if (sourceColumns.length === 0 && items.length === 0) {
    return <ItemOrderStructurePreview field={field} />;
  }

  function add(item: ErpTableSourceRow) {
    setQuery('');
    setOpen(false);
    setHighlight(0);
    if (addedKeys.has(item.key)) {
      setFocusKey(item.key);
      return;
    }
    onChange({
      kind: 'item_order',
      rows: [...rows, { key: item.key, answers: newItemOrderAnswers(inputColumns) }],
    });
    setFocusKey(item.key);
  }

  function remove(key: string) {
    const next = rows.filter((row) => row.key !== key);
    onChange(next.length > 0 ? { kind: 'item_order', rows: next } : null);
  }

  function updateCell(key: string, columnId: string, cellValue: ErpTableCellValue) {
    setTouched((current) => new Set(current).add(`${key}|${columnId}`));
    onChange({
      kind: 'item_order',
      rows: rows.map((row) =>
        row.key === key ? { ...row, answers: { ...row.answers, [columnId]: cellValue } } : row,
      ),
    });
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      // Enter nunca envia o formulário daqui: adiciona o item destacado.
      event.preventDefault();
      const item = results[highlight];
      if (open && item) add(item);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const cellErrors = answer ? getItemOrderCellErrors(field, answer) : {};
  const visibleError = (key: string, columnId: string): string | undefined => {
    const message = cellErrors[key]?.[columnId];
    return message && (showErrors || touched.has(`${key}|${columnId}`)) ? message : undefined;
  };
  const itemLabel = (key: string) => String(itemByKey.get(key)?.values.name ?? 'Item');
  const showResults = open && query.trim().length > 0;
  const numeric = (type: string) => type === 'number' || type === 'currency';

  return (
    // min-w-0: a tabela larga rola dentro do quadro em vez de alargar o formulário.
    <div className="grid min-w-0 gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={mutedText}
          aria-hidden
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showResults && results[highlight] ? `${listboxId}-${highlight}` : undefined}
          aria-label={`Pesquisar item — ${field.label}`}
          placeholder="Pesquisar item pelo nome ou código"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          // Atraso: o clique num resultado chega antes de a lista sumir.
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onSearchKeyDown}
          style={searchStyle}
          className="focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        />
        {showResults ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto"
            style={{
              background: 'var(--tf-surface)',
              border: '1px solid var(--tf-border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            }}
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm" style={mutedText}>
                Nenhum item encontrado.
              </li>
            ) : (
              results.map((item, index) => {
                const added = addedKeys.has(item.key);
                const details = shownColumns
                  .filter((column) => column.key !== 'name')
                  .map((column) => formatErpTableCell(item.values[column.key], column.type))
                  .filter((text) => text !== '—');
                return (
                  <li
                    key={item.key}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={index === highlight}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => add(item)}
                    className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm"
                    style={{
                      background: index === highlight ? 'var(--tf-primary-light)' : 'transparent',
                      color: 'var(--tf-text)',
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{String(item.values.name ?? '')}</span>
                      {details.length > 0 ? (
                        <span className="block truncate text-xs" style={mutedText}>
                          {details.join(' · ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold" style={mutedText}>
                      {added ? 'No pedido' : 'Adicionar'}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>

      <div ref={rowsRef} className="min-w-0">
        {rows.length === 0 ? (
          <p
            className="flex items-center gap-2 rounded-[10px] px-3 py-3 text-sm"
            style={{ ...mutedText, border: '1px dashed var(--tf-border)' }}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
            Nenhum item adicionado. Pesquise acima para adicionar.
          </p>
        ) : (
          <>
            {/* Telas estreitas: um cartão por item. */}
            <div className="grid gap-3 sm:hidden">
              {rows.map((row) => {
                const item = itemByKey.get(row.key);
                return (
                  <div
                    key={row.key}
                    data-item-row={row.key}
                    className="grid gap-2.5"
                    style={{ border: '1.5px solid var(--tf-border)', borderRadius: 12, padding: '12px 14px' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: 'var(--tf-text)' }}>
                        {itemLabel(row.key)}
                      </span>
                      <button
                        type="button"
                        style={iconButtonStyle}
                        aria-label={`Remover ${itemLabel(row.key)}`}
                        onClick={() => remove(row.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {shownColumns
                      .filter((column) => column.key !== 'name')
                      .map((column) => (
                        <div key={column.key} className="flex justify-between gap-2 text-sm">
                          <span style={mutedText}>{column.label}</span>
                          <span style={{ color: 'var(--tf-text)' }}>
                            {formatErpTableCell(item?.values[column.key], column.type)}
                          </span>
                        </div>
                      ))}
                    {inputColumns.map((column) => (
                      <label key={column.id} className="grid gap-1">
                        <span className="text-xs font-bold uppercase tracking-wide" style={mutedText}>
                          {column.label}
                          {column.required ? <span style={{ color: 'var(--tf-danger)' }}> *</span> : null}
                        </span>
                        <CellInput
                          column={column}
                          value={row.answers[column.id]}
                          error={visibleError(row.key, column.id)}
                          ariaLabel={`${column.label} — ${itemLabel(row.key)}`}
                          onChange={(next) => updateCell(row.key, column.id, next)}
                        />
                      </label>
                    ))}
                    {subtotalColumn && totals ? (
                      <div className="flex justify-between gap-2 text-sm font-semibold">
                        <span style={mutedText}>{subtotalColumn.label}</span>
                        <span style={{ color: 'var(--tf-text)' }}>
                          {formatErpTableCell(totals.subtotals[row.key], subtotalColumn.type)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Telas maiores: tabela. */}
            <div
              className="hidden overflow-auto sm:block"
              style={{ border: '1px solid var(--tf-border)', borderRadius: 10 }}
            >
              <table
                className="w-full border-collapse text-sm"
                style={{ minWidth: 110 * (shownColumns.length + inputColumns.length + (subtotalColumn ? 1 : 0)) }}
              >
                <caption className="sr-only">
                  {field.label}: {rows.length} item(ns) no pedido
                </caption>
                <thead>
                  <tr>
                    {shownColumns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className="px-2 py-2 text-xs font-bold uppercase tracking-wide"
                        style={{
                          background: 'var(--tf-surface)',
                          color: 'var(--tf-text-muted)',
                          textAlign: numeric(column.type) ? 'right' : 'left',
                        }}
                      >
                        {column.label}
                      </th>
                    ))}
                    {inputColumns.map((column) => (
                      <th
                        key={column.id}
                        scope="col"
                        className="px-2 py-2 text-left text-xs font-bold uppercase tracking-wide"
                        style={{ background: 'var(--tf-surface)', color: 'var(--tf-text)' }}
                        title={column.helpText ?? undefined}
                      >
                        {column.label}
                        {column.required ? <span style={{ color: 'var(--tf-danger)' }}> *</span> : null}
                      </th>
                    ))}
                    {subtotalColumn ? (
                      <th
                        scope="col"
                        className="px-2 py-2 text-right text-xs font-bold uppercase tracking-wide"
                        style={{ background: 'var(--tf-surface)', color: 'var(--tf-text-muted)' }}
                      >
                        {subtotalColumn.label}
                      </th>
                    ) : null}
                    <th scope="col" style={{ background: 'var(--tf-surface)', width: 44 }}>
                      <span className="sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const item = itemByKey.get(row.key);
                    return (
                      <tr
                        key={row.key}
                        data-item-row={row.key}
                        style={{ borderTop: '1px solid var(--tf-border)', backgroundColor: 'transparent' }}
                      >
                        {shownColumns.map((column) => (
                          <td
                            key={column.key}
                            className="px-2 py-1.5"
                            style={{
                              color: 'var(--tf-text)',
                              fontWeight: column.key === 'name' ? 600 : undefined,
                              textAlign: numeric(column.type) ? 'right' : 'left',
                            }}
                          >
                            {formatErpTableCell(item?.values[column.key], column.type)}
                          </td>
                        ))}
                        {inputColumns.map((column) => (
                          <td key={column.id} className="px-2 py-1 align-top" style={{ minWidth: 110 }}>
                            <CellInput
                              column={column}
                              value={row.answers[column.id]}
                              error={visibleError(row.key, column.id)}
                              ariaLabel={`${column.label} — ${itemLabel(row.key)}`}
                              onChange={(next) => updateCell(row.key, column.id, next)}
                            />
                          </td>
                        ))}
                        {subtotalColumn && totals ? (
                          <td className="px-2 py-1.5 text-right" style={{ color: 'var(--tf-text)' }}>
                            {formatErpTableCell(totals.subtotals[row.key], subtotalColumn.type)}
                          </td>
                        ) : null}
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            style={iconButtonStyle}
                            aria-label={`Remover ${itemLabel(row.key)}`}
                            onClick={() => remove(row.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-sm" style={mutedText}>
              <span>
                {rows.length} {rows.length === 1 ? 'item' : 'itens'} no pedido
              </span>
              {subtotalColumn && totals ? (
                <span className="font-bold" style={{ color: 'var(--tf-text)' }}>
                  Total: {formatErpTableCell(totals.total, subtotalColumn.type)}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Construtor/pré-visualização: os itens vêm da lista quando o formulário for preenchido. */
function ItemOrderStructurePreview({ field }: { field: PublicFormField }) {
  const { inputColumns } = getItemOrderColumns(field.settingsJson);
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={mutedText}
          aria-hidden
        />
        <input
          type="search"
          disabled
          placeholder="Pesquisar item pelo nome ou código"
          aria-label={`Pesquisar item — ${field.label}`}
          style={{ ...searchStyle, opacity: 0.7 }}
        />
      </div>
      <p className="flex items-center gap-2 text-xs" style={mutedText}>
        <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {field.settingsJson.itemListId
          ? `Os itens da lista aparecem na pesquisa quando o formulário for preenchido${
              inputColumns.length > 0 ? `; em cada um: ${inputColumns.map((c) => c.label).join(', ')}.` : '.'
            }`
          : 'Escolha a lista de itens nas configurações do campo.'}
      </p>
    </div>
  );
}
