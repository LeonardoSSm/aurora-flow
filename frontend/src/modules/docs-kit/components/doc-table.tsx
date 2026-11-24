import type { ReactNode } from 'react';

export type DocDensity = 'default' | 'compact';

/**
 * Classes por densidade. A compacta e a da documentacao dentro do modal de
 * Administracao: o fundo ali ja e branco, entao a tabela ganha borda em vez de
 * fundo `surface-lowest`. `nested` e a tabela de colunas dentro de um card de
 * entidade, um degrau menor.
 */
const TABLE_STYLE = {
  default: {
    figure: 'grid gap-2',
    wrapper: 'overflow-x-auto rounded-xl bg-surface-container-lowest',
    table: 'w-full min-w-[520px] border-collapse text-left text-sm',
    headRow: 'border-b border-border-default/40',
    th: 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-tx-secondary',
    row: 'border-b border-border-default/20 last:border-0 align-top',
    td: 'px-3 py-2 text-tx-primary',
    caption: 'text-xs text-tx-secondary',
    empty: 'rounded-xl bg-surface-container-lowest p-3 text-sm text-tx-secondary',
  },
  compact: {
    figure: 'grid min-w-0 grid-cols-1 gap-1.5',
    wrapper: 'overflow-x-auto rounded-[10px] border border-border-default bg-bg-surface',
    table: 'w-full min-w-[520px] border-collapse text-left text-[13px]',
    headRow: 'bg-bg-s2',
    th: 'border-b border-border-default px-3 py-[7px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-tx-secondary',
    row: 'align-top',
    td: 'border-t border-border-subtle px-3 py-[7px] text-tx-primary',
    caption: 'text-xs text-tx-secondary',
    empty: 'rounded-[10px] bg-bg-s2 p-3 text-[13px] text-tx-secondary',
  },
  nested: {
    figure: 'grid min-w-0 grid-cols-1 gap-1.5',
    wrapper: 'overflow-x-auto rounded-lg border border-border-subtle',
    table: 'w-full min-w-[480px] border-collapse text-left text-[12.5px]',
    headRow: 'bg-bg-s2',
    th: 'px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.06em] text-tx-secondary',
    row: 'align-top',
    td: 'border-t border-border-subtle px-2.5 py-[5px] text-tx-primary',
    caption: 'text-xs text-tx-secondary',
    empty: 'rounded-lg bg-bg-s2 p-2.5 text-[12.5px] text-tx-secondary',
  },
} as const;

/**
 * Tabela padrão da documentação. Rola horizontalmente no próprio contêiner —
 * a página nunca deve ganhar barra horizontal por causa de uma tabela larga.
 */
export function DocTable({
  columns,
  rows,
  caption,
  density = 'default',
  nested = false,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
  caption?: string;
  density?: DocDensity;
  /** Tabela dentro de outro bloco (colunas de uma entidade); só vale no compacto. */
  nested?: boolean;
}) {
  const s = TABLE_STYLE[density === 'compact' && nested ? 'nested' : density];

  if (rows.length === 0) {
    return <p className={s.empty}>Nenhum registro encontrado.</p>;
  }

  return (
    <figure className={s.figure}>
      <div className={s.wrapper}>
        <table className={s.table}>
          <thead>
            <tr className={s.headRow}>
              {columns.map((col) => (
                <th key={col} className={s.th}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={s.row}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={s.td}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? <figcaption className={s.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
