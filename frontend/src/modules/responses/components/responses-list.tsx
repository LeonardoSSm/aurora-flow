import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import type { ResponseRecord } from '../types';
import {
  responseItemToUi,
  type ResponseFieldMeta,
} from '../utils/response-formatters';
import { buildResponseScorecard, sortResponseItems } from '../utils/response-scorecard';
import { ResponseScorecardView } from './response-scorecard';

type ResolveField = (fieldCode: string) => ResponseFieldMeta | undefined;

function MaskedValue() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
      title="Dado sensível — sem permissão para visualizar."
    >
      <Lock className="h-3 w-3" />
      Dado sensível
    </span>
  );
}

function ResponseValue({
  item,
  field,
}: {
  item: ResponseRecord['items'][number];
  field?: ResponseFieldMeta;
}) {
  if (item.valueText === '***') {
    return <MaskedValue />;
  }

  const parsed = responseItemToUi(item, field);

  if (parsed.type === 'badge') {
    return (
      <span
        className={['inline-flex rounded-full px-2 py-1 text-xs font-bold', parsed.className].join(
          ' ',
        )}
      >
        {parsed.text}
      </span>
    );
  }

  if (parsed.type === 'chips') {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {parsed.chips.map((chip) => (
          <span
            key={`${item.id}-${chip}`}
            className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
          >
            {chip}
          </span>
        ))}
      </span>
    );
  }

  if (parsed.type === 'table') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full max-w-lg text-xs">
          <thead>
            <tr className="text-left text-tx-secondary">
              <th className="pb-1 pr-3 font-semibold">Produto</th>
              {parsed.columns.map((column) => (
                <th key={column} className="pb-1 pr-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, index) => (
              <tr key={`${item.id}-${index}`} className="border-t border-border-default">
                <td className="py-1 pr-3">{row.produto}</td>
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-1 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (parsed.type === 'erp_table') {
    if (parsed.rows.length === 0) {
      return (
        <span className="text-xs text-tx-secondary">
          {parsed.fromList ? 'Nenhum item no pedido.' : 'Nenhum item no ERP.'}
        </span>
      );
    }
    return (
      <div className="max-h-96 overflow-auto rounded-md border border-border-default">
        <table className="w-full text-xs">
          <caption className="sr-only">
            {parsed.rows.length} item(ns) {parsed.fromList ? 'no pedido' : 'do ERP'}
          </caption>
          <thead className="sticky top-0 bg-bg-surface">
            <tr className="text-left text-tx-secondary">
              {parsed.columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={['px-2 py-1 font-semibold', column.numeric ? 'text-right' : ''].join(' ')}
                >
                  {column.label}
                  {column.fromErp ? (
                    <span
                      className="ml-1 rounded bg-bg-hover px-1 text-[10px] font-bold"
                      title="Valor consultado no ERP no momento do envio"
                    >
                      ERP
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row) => (
              <tr key={`${item.id}-${row.key}`} className="border-t border-border-default">
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={[
                      'px-2 py-1',
                      parsed.columns[cellIndex]?.numeric ? 'text-right' : '',
                    ].join(' ')}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {parsed.total ? (
            <tfoot>
              <tr className="border-t border-border-default font-bold">
                <td colSpan={parsed.columns.length} className="px-2 py-1 text-right">
                  Total: {parsed.total}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    );
  }

  if (parsed.type === 'lines') {
    return (
      <span className="grid gap-1">
        {parsed.lines.map((line) => (
          <span key={`${item.id}-${line}`} className="text-xs text-tx-secondary">
            {line}
          </span>
        ))}
      </span>
    );
  }

  return <span>{parsed.text}</span>;
}

export function ResponseItemsList({
  items,
  resolveFieldLabel,
  resolveField,
  fieldMetaByCode,
}: {
  items: ResponseRecord['items'];
  resolveFieldLabel: (fieldCode: string) => string;
  resolveField?: ResolveField;
  /** Campos do formulário: põe as respostas na ordem das seções e monta o quadro de pontuação. */
  fieldMetaByCode?: Record<string, ResponseFieldMeta>;
}) {
  const ordered = useMemo(
    () => (fieldMetaByCode ? sortResponseItems(items, fieldMetaByCode) : items),
    [items, fieldMetaByCode],
  );
  const scorecard = useMemo(
    () => (fieldMetaByCode ? buildResponseScorecard(items, fieldMetaByCode) : null),
    [items, fieldMetaByCode],
  );
  // Título da seção antes da primeira resposta dela (só quando o formulário tem mais de uma).
  const sectionCount = new Set(ordered.map((item) => fieldMetaByCode?.[item.fieldCode]?.sectionId)).size;

  return (
    <div className="grid gap-3">
      {scorecard ? <ResponseScorecardView scorecard={scorecard} /> : null}
      <ul className="grid gap-2 text-sm text-tx-primary">
        {ordered.map((item, index) => {
          const meta = fieldMetaByCode?.[item.fieldCode];
          const previous = index > 0 ? fieldMetaByCode?.[ordered[index - 1].fieldCode] : undefined;
          const startsSection = sectionCount > 1 && meta?.sectionTitle && meta.sectionId !== previous?.sectionId;
          return (
            <li key={item.id} className="grid gap-2">
              {startsSection ? (
                <span className="pt-2 text-[11px] font-bold uppercase tracking-wider text-tx-secondary">
                  {meta.sectionTitle}
                </span>
              ) : null}
              <div className="grid gap-1 rounded-xl bg-surface-container-low px-3 py-2">
                <strong>{resolveFieldLabel(item.fieldCode)}</strong>
                <ResponseValue item={item} field={resolveField?.(item.fieldCode)} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
