import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Info,
  OctagonAlert,
  Radio,
  Send,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DocDiagram } from '../diagrams/doc-diagram';
import type { DiagramRegistry } from '../diagrams/diagram.types';
import type { DocBlock, DocCalloutTone, DocEndpoint } from '../types';
import { type DocDensity, DocTable } from './doc-table';

/**
 * Como renderizar um bloco `live`. Fica a cargo de quem consome o kit: os blocos ao
 * vivo dependem de serviços de API, e o kit não pode arrastar a camada de API da
 * administração para dentro do bundle do manual do usuário.
 */
export type DocLiveRenderer = (block: Extract<DocBlock, { kind: 'live' }>) => ReactNode;

export type DocBlockContext = {
  diagrams?: DiagramRegistry;
  renderLive?: DocLiveRenderer;
  /**
   * `compact`: a densidade da documentação dentro do modal de Administração —
   * texto 14px, blocos com borda em vez de fundo e largura de leitura de 700px.
   */
  density?: DocDensity;
};

const CALLOUT_STYLE: Record<
  DocCalloutTone,
  { icon: typeof Info; color: string; defaultTitle: string }
> = {
  info: { icon: Info, color: '#0EA5E9', defaultTitle: 'Nota' },
  success: { icon: CheckCircle2, color: '#16A34A', defaultTitle: 'Boa prática' },
  warning: { icon: AlertTriangle, color: '#F59E0B', defaultTitle: 'Atenção' },
  danger: { icon: OctagonAlert, color: '#DC2626', defaultTitle: 'Risco' },
};

const METHOD_COLOR: Record<DocEndpoint['method'], string> = {
  GET: '#0EA5E9',
  POST: '#16A34A',
  PATCH: '#F59E0B',
  PUT: '#8B5CF6',
  DELETE: '#DC2626',
};

/**
 * Classes por densidade. Todo bloco que pode ser mais largo que a coluna (código,
 * tabela, diagrama) leva `min-w-0` + `grid-cols-1` no compacto: sem isso a trilha
 * do grid cresce até o min-content e a coluna inteira ganha rolagem horizontal.
 */
const BLOCK_STYLE = {
  default: {
    paragraph: 'text-[15px] leading-relaxed text-tx-secondary',
    list: 'grid gap-1.5 pl-5 text-[15px] leading-relaxed text-tx-secondary',
    steps: 'grid gap-3',
    step: 'flex gap-3',
    stepNumber:
      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white',
    stepBody: 'min-w-0',
    stepTitle: 'text-sm font-bold text-tx-primary',
    stepText: 'text-sm leading-relaxed text-tx-secondary',
    callout: 'flex gap-3 rounded-xl bg-surface-container-lowest p-3',
    calloutBorder: '4px',
    calloutIcon: 'mt-0.5 h-4 w-4 shrink-0',
    calloutBody: 'min-w-0',
    calloutTitle: 'text-sm font-bold text-tx-primary',
    calloutText: 'text-sm leading-relaxed text-tx-secondary',
    codeFigure: 'grid gap-1.5',
    code: 'overflow-x-auto rounded-xl bg-surface-container-high p-3 font-mono text-[12.5px] leading-relaxed text-tx-primary',
    codeCaption: 'text-xs text-tx-secondary',
    entities: 'grid gap-3',
    entity: 'rounded-xl bg-surface-container-lowest p-3',
    entityTable: 'font-mono text-[13px] font-bold text-tx-primary',
    entityName: 'text-xs text-tx-muted',
    entityText: 'mt-1 text-sm text-tx-secondary',
    entityColumns: 'mt-2',
    events: 'grid gap-3 sm:grid-cols-2',
    eventCol: 'rounded-xl bg-surface-container-lowest p-3',
    eventLabel:
      'mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tx-secondary',
    eventList: 'grid gap-1',
    eventCode: 'font-mono text-[12.5px] text-tx-primary',
    files: 'grid gap-1.5',
    fileCode: 'break-all font-mono text-[12.5px] text-tx-primary',
    fileNote: 'text-xs text-tx-secondary',
  },
  compact: {
    paragraph: 'max-w-[700px] text-sm leading-[1.65] text-tx-secondary',
    list: 'grid max-w-[700px] gap-1.5 pl-5 text-sm leading-[1.6] text-tx-secondary',
    steps: 'grid max-w-[700px] gap-3',
    step: 'flex gap-2.5',
    stepNumber:
      'mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-white',
    stepBody: 'grid min-w-0 gap-px',
    stepTitle: 'text-[13px] font-bold text-tx-primary',
    stepText: 'text-[13px] leading-[1.6] text-tx-secondary',
    callout: 'flex max-w-[700px] gap-2.5 rounded-[10px] bg-bg-s2 px-3 py-2.5',
    calloutBorder: '3px',
    calloutIcon: 'mt-0.5 h-[15px] w-[15px] shrink-0',
    calloutBody: 'grid min-w-0 gap-0.5',
    calloutTitle: 'text-[13px] font-bold text-tx-primary',
    calloutText: 'text-[13px] leading-[1.6] text-tx-secondary',
    codeFigure: 'grid min-w-0 grid-cols-1 gap-1.5',
    code: 'overflow-x-auto rounded-[10px] bg-bg-s3 px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-tx-primary',
    codeCaption: 'text-xs text-tx-secondary',
    entities: 'grid min-w-0 grid-cols-1 gap-2.5',
    entity: 'grid min-w-0 grid-cols-1 gap-1.5 rounded-[10px] border border-border-default px-3 py-2.5',
    entityTable: 'font-mono text-[12.5px] font-bold text-tx-primary',
    entityName: 'text-xs text-tx-muted',
    entityText: 'text-[13px] leading-normal text-tx-secondary',
    entityColumns: 'min-w-0',
    events: 'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5',
    eventCol: 'rounded-[10px] border border-border-default px-3 py-2.5',
    eventLabel:
      'mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-tx-secondary',
    eventList: 'grid gap-[3px]',
    eventCode: 'font-mono text-[12px] text-tx-primary',
    files: 'grid gap-[5px]',
    fileCode: 'break-all font-mono text-[12px] text-tx-primary',
    fileNote: 'text-xs text-tx-secondary',
  },
} as const;

/**
 * Realça `trechos entre crases` e **negrito** sem trazer um parser de markdown.
 * Só esses dois — qualquer sintaxe além disso apareceria crua na tela.
 */
function withInlineCode(text: string): ReactNode {
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return segments.map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-surface-container-high px-1 py-0.5 font-mono text-[0.85em] text-tx-primary"
        >
          {segment.slice(1, -1)}
        </code>
      );
    }
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return (
        <strong key={index} className="font-bold text-tx-primary">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{segment}</span>;
  });
}

function EndpointList({ items }: { items: DocEndpoint[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((endpoint) => (
        <li
          key={`${endpoint.method}-${endpoint.path}`}
          className="rounded-xl bg-surface-container-lowest p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 font-mono text-[11px] font-bold text-white"
              style={{ backgroundColor: METHOD_COLOR[endpoint.method] }}
            >
              {endpoint.method}
            </span>
            <code className="break-all font-mono text-[13px] font-semibold text-tx-primary">
              {endpoint.path}
            </code>
            {endpoint.public ? (
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tx-secondary">
                público
              </span>
            ) : null}
            {endpoint.permission ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                {endpoint.permission}
              </span>
            ) : null}
            {endpoint.rateLimit ? (
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-tx-secondary">
                {endpoint.rateLimit}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-tx-secondary">{withInlineCode(endpoint.description)}</p>
          {endpoint.note ? (
            <p className="mt-1 text-xs italic text-tx-muted">{withInlineCode(endpoint.note)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Compacto: uma lista com borda única e divisórias, em vez de um card por rota. */
function CompactEndpointList({ items }: { items: DocEndpoint[] }) {
  return (
    <ul className="grid overflow-hidden rounded-[10px] border border-border-default">
      {items.map((endpoint) => (
        <li
          key={`${endpoint.method}-${endpoint.path}`}
          className="grid gap-1 border-t border-border-default px-3 py-[9px] first:border-t-0"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-[5px] px-1.5 py-px font-mono text-[10.5px] font-bold text-white"
              style={{ backgroundColor: METHOD_COLOR[endpoint.method] }}
            >
              {endpoint.method}
            </span>
            <code className="break-all font-mono text-[12.5px] font-semibold text-tx-primary">
              {endpoint.path}
            </code>
            {endpoint.public ? (
              <span className="rounded-full bg-bg-s3 px-[7px] py-px text-[10px] font-bold uppercase tracking-[0.04em] text-tx-secondary">
                público
              </span>
            ) : null}
            {endpoint.permission ? (
              <span className="rounded-full bg-primary/10 px-[7px] py-px font-mono text-[10px] font-bold text-primary">
                {endpoint.permission}
              </span>
            ) : null}
            {endpoint.rateLimit ? (
              <span className="rounded-full bg-bg-s3 px-[7px] py-px text-[10px] font-semibold text-tx-secondary">
                {endpoint.rateLimit}
              </span>
            ) : null}
          </div>
          <p className="text-[13px] leading-normal text-tx-secondary">
            {withInlineCode(endpoint.description)}
          </p>
          {endpoint.note ? (
            <p className="text-xs italic text-tx-muted">{withInlineCode(endpoint.note)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DocBlockView({
  block,
  diagrams,
  renderLive,
  density = 'default',
}: { block: DocBlock } & DocBlockContext) {
  const s = BLOCK_STYLE[density];

  switch (block.kind) {
    case 'paragraph':
      return <p className={s.paragraph}>{withInlineCode(block.text)}</p>;

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={`${s.list} ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, index) => (
            <li key={index}>{withInlineCode(item)}</li>
          ))}
        </Tag>
      );
    }

    case 'steps':
      return (
        <ol className={s.steps}>
          {block.steps.map((step, index) => (
            <li key={index} className={s.step}>
              <span className={s.stepNumber}>{index + 1}</span>
              <div className={s.stepBody}>
                <p className={s.stepTitle}>{withInlineCode(step.title)}</p>
                <p className={s.stepText}>{withInlineCode(step.text)}</p>
              </div>
            </li>
          ))}
        </ol>
      );

    case 'callout': {
      const style = CALLOUT_STYLE[block.tone];
      const Icon = style.icon;
      return (
        <div className={s.callout} style={{ borderLeft: `${s.calloutBorder} solid ${style.color}` }}>
          <Icon className={s.calloutIcon} style={{ color: style.color }} />
          <div className={s.calloutBody}>
            <p className={s.calloutTitle}>{withInlineCode(block.title ?? style.defaultTitle)}</p>
            <p className={s.calloutText}>{withInlineCode(block.text)}</p>
          </div>
        </div>
      );
    }

    case 'code':
      return (
        <figure className={s.codeFigure}>
          <pre className={s.code}>
            <code>{block.code}</code>
          </pre>
          {block.caption ? <figcaption className={s.codeCaption}>{block.caption}</figcaption> : null}
        </figure>
      );

    case 'table':
      return (
        <DocTable
          columns={block.columns}
          rows={block.rows.map((row) =>
            row.map((cell, cellIndex) => <span key={cellIndex}>{withInlineCode(cell)}</span>),
          )}
          caption={block.caption}
          density={density}
        />
      );

    case 'endpoints':
      return density === 'compact' ? (
        <CompactEndpointList items={block.items} />
      ) : (
        <EndpointList items={block.items} />
      );

    case 'entities':
      return (
        <div className={s.entities}>
          {block.items.map((entity) => (
            <div key={entity.table} className={s.entity}>
              <div className="flex flex-wrap items-baseline gap-2">
                <code className={s.entityTable}>{entity.table}</code>
                <span className={s.entityName}>{entity.entity}</span>
              </div>
              <p className={s.entityText}>{withInlineCode(entity.description)}</p>
              {entity.columns?.length ? (
                <div className={s.entityColumns}>
                  <DocTable
                    columns={['Coluna', 'Tipo', 'Observação']}
                    density={density}
                    nested
                    rows={entity.columns.map((c) => [
                      <code key={c.name} className="font-mono text-[12px]">
                        {c.name}
                      </code>,
                      <span key={`${c.name}-t`} className="text-tx-secondary">
                        {c.type}
                      </span>,
                      <span key={`${c.name}-n`} className="text-tx-secondary">
                        {c.note ? withInlineCode(c.note) : '—'}
                      </span>,
                    ])}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      );

    case 'events':
      return (
        <div className={s.events}>
          {block.emits?.length ? (
            <div className={s.eventCol}>
              <p className={s.eventLabel}>
                <Send className="h-3.5 w-3.5" /> Emite
              </p>
              <ul className={s.eventList}>
                {block.emits.map((event) => (
                  <li key={event}>
                    <code className={s.eventCode}>{event}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {block.listens?.length ? (
            <div className={s.eventCol}>
              <p className={s.eventLabel}>
                <Radio className="h-3.5 w-3.5" /> Escuta
              </p>
              <ul className={s.eventList}>
                {block.listens.map((event) => (
                  <li key={event}>
                    <code className={s.eventCode}>{event}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );

    case 'diagram': {
      const def = diagrams?.[block.id];
      if (!def) return null;
      return <DocDiagram def={def} caption={block.caption} />;
    }

    case 'live':
      return <>{renderLive?.(block) ?? null}</>;

    case 'files':
      return (
        <ul className={s.files}>
          {block.items.map((file) => (
            <li key={file.path} className="flex flex-wrap items-baseline gap-2">
              <FileCode2 className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-tx-muted" />
              <code className={s.fileCode}>{file.path}</code>
              {file.note ? (
                <span className={s.fileNote}>— {withInlineCode(file.note)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      );
  }
}
