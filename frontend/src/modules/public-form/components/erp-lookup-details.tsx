import { AlertTriangle, Loader2, OctagonAlert, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type {
  ErpLookupDetailField,
  ErpLookupDetailTable,
  ErpLookupDetails,
} from '../../erp-lookup/erp-lookup-api';

/** Acima disso, a coluna ganha largura mínima em vez de quebrar a cada palavra. */
const LONG_TEXT = 24;

const ALERT_COLORS = {
  perigo: 'var(--tf-danger)',
  aviso: 'var(--tf-warning)',
} as const;

/**
 * Colunas que não ganham coluna própria: vão numa linha discreta sob a coluna principal
 * ("Cód. 833 · TOTVS PA13000171 · BD"). Chave → prefixo do valor.
 */
const SECONDARY_COLUMNS: Record<string, string> = {
  codigo: 'Cód.',
  totvs: 'TOTVS',
  cod_totvs: 'TOTVS',
  unidade: '',
};
/** Coluna que recebe a linha secundária. */
const HOST_COLUMN = 'produto';

/** "Situação" do resumo sai da grade e vira um selo no cabeçalho da ficha. */
const STATUS_LABEL = 'Situação';
const STATUS_TONES: Record<string, string> = {
  OK: 'var(--tf-success)',
  Cancelado: 'var(--tf-danger)',
};

function StatusChip({ valor }: { valor: string }) {
  const color = STATUS_TONES[valor] ?? 'var(--tf-text-muted)';
  return (
    <span
      className="shrink-0 rounded-full font-bold"
      style={{
        fontSize: 11,
        padding: '2px 8px',
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {valor}
    </span>
  );
}

function FieldGrid({ fields, emphasis }: { fields: ErpLookupDetailField[]; emphasis?: boolean }) {
  return (
    <dl
      className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
      style={{ gap: '10px 16px', margin: 0 }}
    >
      {fields.map((field, index) => (
        <div
          key={`${field.label}-${index}`}
          className="min-w-0"
          style={field.largo ? { gridColumn: '1 / -1' } : undefined}
        >
          <dt
            className="font-semibold uppercase"
            style={{ fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--tf-text-muted)' }}
          >
            {field.label}
          </dt>
          <dd
            className="[overflow-wrap:anywhere]"
            style={{
              margin: '1px 0 0',
              fontSize: emphasis ? 14 : 12.5,
              fontWeight: emphasis ? 700 : 400,
              color: 'var(--tf-text)',
            }}
          >
            {field.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailTable({ table }: { table: ErpLookupDetailTable }) {
  const hasHost = table.colunas.some((col) => col.chave === HOST_COLUMN);
  const secondary = hasHost
    ? table.colunas.filter((col) => col.chave in SECONDARY_COLUMNS)
    : [];
  const columns = table.colunas.filter((col) => !secondary.includes(col));
  // Coluna de texto longo (descrição, observação) não pode virar uma tripa de 4 linhas.
  const longText = new Set(
    columns
      .filter((col) => table.linhas.some((row) => (row[col.chave] ?? '').length > LONG_TEXT))
      .map((col) => col.chave),
  );
  const secondaryLine = (row: Record<string, string>) =>
    secondary
      .map((col) => {
        const value = row[col.chave];
        if (!value) return null;
        const prefix = SECONDARY_COLUMNS[col.chave];
        return prefix ? `${prefix} ${value}` : value;
      })
      .filter(Boolean)
      .join(' · ');

  // Cor e fundo no próprio elemento: o formulário público usa as cores fixas da marca, e o
  // `.dark table td` / `tr:hover` globais do app (tema escuro) não podem vazar para cá.
  const cell = (col: ErpLookupDetailTable['colunas'][number]): React.CSSProperties => ({
    color: 'var(--tf-text)',
    padding: '6px 8px',
    textAlign: col.numerica ? 'right' : 'left',
    whiteSpace: col.numerica ? 'nowrap' : 'normal',
    verticalAlign: 'top',
    fontWeight: col.label === 'Total' ? 700 : undefined,
    minWidth: col.chave === HOST_COLUMN ? 180 : longText.has(col.chave) ? '14rem' : undefined,
  });
  return (
    // Muitas colunas: rola na horizontal dentro da ficha (último recurso), nunca a página.
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--tf-border)' }}>
      <table className="w-full border-collapse" style={{ fontSize: 12, color: 'var(--tf-text)' }}>
        <thead>
          <tr style={{ background: 'var(--tf-background)' }}>
            {columns.map((col) => (
              <th
                key={col.chave}
                scope="col"
                style={{
                  ...cell(col),
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: 'var(--tf-text-muted)',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.linhas.map((row, index) => (
            <tr
              key={index}
              style={{ borderTop: '1px solid var(--tf-border)', background: 'transparent' }}
            >
              {columns.map((col) => {
                const extra = col.chave === HOST_COLUMN ? secondaryLine(row) : '';
                return (
                  <td key={col.chave} style={cell(col)}>
                    {extra ? (
                      <>
                        <div className="font-semibold">{row[col.chave]}</div>
                        <div style={{ fontSize: 11, color: 'var(--tf-text-muted)' }}>{extra}</div>
                      </>
                    ) : (
                      row[col.chave]
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {table.total ? (
          <tfoot>
            <tr
              className="font-bold"
              style={{ borderTop: '2px solid var(--tf-border)', background: 'transparent' }}
            >
              {columns.map((col) => (
                <td key={col.chave} style={{ ...cell(col), fontWeight: 700 }}>
                  {table.total?.[col.chave]}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/**
 * Alertas da ficha (pedido cancelado, bloqueado…). Também aparecem soltos sob o campo quando a
 * ficha fica na gaveta: ninguém deveria precisar abri-la para saber que o pedido tem problema.
 */
export function ErpLookupAlerts({
  alertas,
  className = '',
  style,
}: {
  alertas: ErpLookupDetails['alertas'];
  className?: string;
  style?: React.CSSProperties;
}) {
  if (alertas.length === 0) return null;
  return (
    <ul className={`grid gap-1.5 ${className}`} style={{ margin: 0, padding: 0, ...style }}>
      {alertas.map((alert, index) => {
        const color = ALERT_COLORS[alert.tipo];
        const Icon = alert.tipo === 'perigo' ? OctagonAlert : AlertTriangle;
        return (
          <li
            key={index}
            role={alert.tipo === 'perigo' ? 'alert' : undefined}
            className="flex items-start gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              color: 'var(--tf-text)',
              border: `1px solid ${color}`,
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
            }}
          >
            <Icon aria-hidden className="mt-px h-4 w-4 shrink-0" style={{ color }} />
            <span className="min-w-0 break-words">{alert.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}

type DetailTab = {
  key: string;
  label: string;
  count?: number;
  render: () => React.ReactNode;
};

function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const baseId = useId();
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === activeKey),
  );
  const active = tabs[activeIndex];
  if (!active) return null;

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActiveKey(tabs[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]" style={{ gap: 12 }}>
      <div
        role="tablist"
        aria-label="Detalhes"
        className="flex flex-wrap"
        style={{ columnGap: 18, rowGap: 4, borderBottom: '1px solid var(--tf-border)' }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') focusTab(activeIndex + 1);
          else if (event.key === 'ArrowLeft') focusTab(activeIndex - 1);
          else if (event.key === 'Home') focusTab(0);
          else if (event.key === 'End') focusTab(tabs.length - 1);
          else return;
          event.preventDefault();
        }}
      >
        {tabs.map((tab, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={tab.key}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveKey(tab.key)}
              className="flex items-center gap-1.5 transition-colors hover:text-[color:var(--tf-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--tf-primary)]"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${selected ? 'var(--tf-primary)' : 'transparent'}`,
                marginBottom: -1,
                padding: '0 0 8px',
                fontSize: 12.5,
                fontWeight: selected ? 700 : 500,
                color: selected ? 'var(--tf-primary)' : 'var(--tf-text-muted)',
              }}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className="rounded-full font-bold"
                  style={{
                    fontSize: 10.5,
                    padding: '1px 6px',
                    background: 'var(--tf-primary-light)',
                    color: 'var(--tf-primary)',
                  }}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${activeIndex}`}
        className="min-w-0"
      >
        {active.render()}
      </div>
    </div>
  );
}

/**
 * Ficha do item escolhido num campo "Lista do ERP": alertas e resumo sempre à vista; tabelas
 * (ex.: itens do pedido) e seções em abas, as tabelas primeiro.
 * - `inline`: dentro do campo (telas estreitas);
 * - `side`: no painel ao lado do formulário, como um cartão irmão dele, entrando em cascata.
 */
export function ErpLookupDetailsCard({
  details,
  layout = 'inline',
  onDismiss,
}: {
  details: ErpLookupDetails;
  layout?: 'inline' | 'side';
  /** Botão X no cabeçalho: no painel, mesma ação do "Trocar" do campo; na gaveta, fecha. */
  onDismiss?: () => void;
}) {
  const side = layout === 'side';
  // Cada parte entra um pouco depois da anterior, enquanto o painel termina de abrir.
  const enter = (delayMs: number): { className: string; style?: React.CSSProperties } =>
    side
      ? { className: 'motion-safe:animate-erp-side-in', style: { animationDelay: `${delayMs}ms` } }
      : { className: '' };
  const status = details.resumo.find((field) => field.label === STATUS_LABEL);
  const resumo = details.resumo.filter((field) => field !== status);  const tabs: DetailTab[] = [
    ...details.tabelas.map((table) => ({
      key: `t:${table.titulo}`,
      label: table.titulo,
      count: table.linhas.length,
      render: () => <DetailTable table={table} />,
    })),
    ...details.secoes.map((section) => ({
      key: `s:${section.titulo}`,
      label: section.titulo,
      render: () => <FieldGrid fields={section.campos} emphasis={section.titulo === 'Valores'} />,
    })),
  ];

  return (
    <section
      aria-label={`Detalhes: ${details.titulo}`}
      className={
        side
          ? 'grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] content-start overflow-y-auto motion-safe:animate-erp-side-in'
          : 'grid min-w-0 grid-cols-[minmax(0,1fr)] content-start'
      }
      style={
        side
          ? {
              gap: 14,
              padding: '16px 20px',
              borderRadius: 14,
              background: 'var(--tf-surface)',
              boxShadow: '0 12px 28px -14px rgba(26,60,143,0.18)',
              borderTop: '3px solid var(--tf-primary)',
            }
          : {
              gap: 12,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--tf-border)',
              background: 'var(--tf-surface)',
            }
      }
    >
      <div className={`flex items-center gap-2.5 ${enter(150).className}`} style={enter(150).style}>
        <h4
          className="min-w-0 font-extrabold"
          style={{ fontSize: side ? 15 : 13, color: side ? 'var(--tf-primary)' : 'var(--tf-text)' }}
        >
          {details.titulo}
        </h4>
        {status ? <StatusChip valor={status.valor} /> : null}
        <span className="flex-1" />
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar detalhes"
            className="flex shrink-0 items-center justify-center transition-colors hover:bg-[color:var(--tf-primary-light)]"
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none' }}
          >
            <X aria-hidden className="h-4 w-4" style={{ color: 'var(--tf-text-muted)' }} />
          </button>
        ) : null}
      </div>

      <ErpLookupAlerts
        alertas={details.alertas}
        className={enter(220).className}
        style={enter(220).style}
      />

      {resumo.length > 0 ? (
        <dl
          className={`grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] ${enter(220).className}`}
          style={{ gap: 6, margin: 0, ...enter(220).style }}
        >
          {resumo.map((field, index) => (
            <div
              key={`${field.label}-${index}`}
              className="min-w-0"
              style={{ background: 'var(--tf-background)', borderRadius: 6, padding: '7px 10px' }}
            >
              <dt className="font-semibold" style={{ fontSize: 10.5, color: 'var(--tf-text-muted)' }}>
                {field.label}
              </dt>
              <dd
                className="break-words font-bold"
                style={{ margin: '1px 0 0', fontSize: 12.5, lineHeight: 1.3, color: 'var(--tf-text)' }}
              >
                {field.valor}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {tabs.length > 0 ? (
        <div className={`min-w-0 ${enter(290).className}`} style={enter(290).style}>
          <DetailTabs tabs={tabs} />
        </div>
      ) : null}
    </section>
  );
}

export function ErpLookupDetailsLoading() {
  return (
    <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--tf-text-muted)' }}>
      <Loader2
        aria-hidden
        className="h-3.5 w-3.5 animate-spin"
        style={{ color: 'var(--tf-primary)' }}
      />
      Carregando detalhes…
    </p>
  );
}
