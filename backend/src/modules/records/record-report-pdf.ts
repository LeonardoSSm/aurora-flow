// `import x from` viraria `x.default` (undefined) sem `esModuleInterop` — mesmo motivo de responses.service.
import pdfmake = require('pdfmake');
import { join } from 'path';
import type { RecordColumn } from './record-columns';
import type { RecordReportConfig } from './record-report-config';

/** Um registro pronto para o relatório: texto de cada coluna e, quando há, o valor para ordenar. */
export interface ReportRow {
  values: Record<string, string>;
  sortValues: Record<string, string | number>;
}

export interface ReportContext {
  processName: string;
  generatedAt: string;
  generatedBy: string;
  /** Filtros aplicados já em texto ("Fase: A, B"). */
  filters: string[];
  /** Ordem das fases, para o agrupamento por fase seguir o Kanban. */
  phaseOrder: string[];
}

const EMPTY_GROUP = '(sem valor)';
const COLORS = { text: '#1f2937', muted: '#6b7280', line: '#d1d5db', headerFill: '#f3f4f6', group: '#1e3a8a' };

/** Colunas curtas (datas, código, status) ficam no tamanho do conteúdo; o resto divide a largura. */
const COMPACT_KEYS = new Set([
  'sys:code',
  'sys:status',
  'sys:priority',
  'sys:sla',
  'sys:origin',
  'sys:createdAt',
  'sys:updatedAt',
  'sys:phaseEnteredAt',
]);

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export function compareRows(a: ReportRow, b: ReportRow, key: string): number {
  const left = a.sortValues[key] ?? a.values[key] ?? '';
  const right = b.sortValues[key] ?? b.values[key] ?? '';
  // Vazio sempre por último, qualquer que seja a direção (quem inverte é o chamador).
  if (left === '' && right !== '') return 1;
  if (right === '' && left !== '') return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return collator.compare(String(left), String(right));
}

export function sortRows(rows: ReportRow[], key: string | null, dir: 'asc' | 'desc'): ReportRow[] {
  if (!key) return rows;
  const factor = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a.sortValues[key] ?? a.values[key] ?? '';
    const right = b.sortValues[key] ?? b.values[key] ?? '';
    if (left === '' || right === '') return compareRows(a, b, key); // vazio no fim nas duas direções
    return factor * compareRows(a, b, key);
  });
}

/** Separa em grupos mantendo a ordem dos registros; grupos por fase seguem a ordem do Kanban. */
export function groupRows(
  rows: ReportRow[],
  key: string | null,
  phaseOrder: string[],
): Array<{ label: string; rows: ReportRow[] }> {
  if (!key) return [{ label: '', rows }];
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const label = row.values[key]?.trim() || EMPTY_GROUP;
    const list = groups.get(label) ?? [];
    list.push(row);
    groups.set(label, list);
  }
  const labels = [...groups.keys()];
  if (key === 'sys:phase') {
    const index = (label: string): number => {
      const position = phaseOrder.indexOf(label);
      return position === -1 ? Number.MAX_SAFE_INTEGER : position;
    };
    labels.sort((a, b) => index(a) - index(b));
  } else {
    labels.sort((a, b) => (a === EMPTY_GROUP ? 1 : b === EMPTY_GROUP ? -1 : collator.compare(a, b)));
  }
  return labels.map((label) => ({ label, rows: groups.get(label) ?? [] }));
}

const plural = (count: number): string => (count === 1 ? '1 registro' : `${count.toLocaleString('pt-BR')} registros`);

type Content = Record<string, unknown> | string | Array<unknown>;

function tableFor(
  columns: Array<{ key: string; label: string }>,
  rows: ReportRow[],
): Content {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: columns.map((column) => (COMPACT_KEYS.has(column.key) && columns.length > 2 ? 'auto' : '*')),
      body: [
        columns.map((column) => ({ text: column.label, style: 'tableHeader' })),
        // Coluna curta (data, status) não quebra linha: "22/10/2026, 12:59" partido em dois fica ilegível.
        ...rows.map((row) =>
          columns.map((column) => ({
            text: row.values[column.key] || '—',
            ...(COMPACT_KEYS.has(column.key) ? { noWrap: true } : {}),
          })),
        ),
      ],
    },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? COLORS.headerFill : null),
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 10],
  };
}

function cardsFor(
  columns: Array<{ key: string; label: string }>,
  rows: ReportRow[],
  width: number,
): Content[] {
  const [lead, ...rest] = columns;
  return rows.map((row) => ({
    unbreakable: true,
    margin: [0, 0, 0, 8],
    stack: [
      { text: row.values[lead.key] || '—', bold: true, fontSize: 1.15 * 9, margin: [0, 0, 0, 3] },
      ...(rest.length
        ? [
            {
              table: {
                widths: ['30%', '*'],
                body: rest.map((column) => [
                  { text: column.label, color: COLORS.muted },
                  { text: row.values[column.key] || '—' },
                ]),
              },
              layout: 'noBorders',
            },
          ]
        : []),
      {
        canvas: [{ type: 'line', x1: 0, y1: 4, x2: width, y2: 4, lineWidth: 0.4, lineColor: COLORS.line }],
      },
    ],
  }));
}

/**
 * O documento do pdfmake para o relatório. Puro: recebe linhas já filtradas, formatadas e com acesso
 * conferido; só decide a forma.
 */
export function buildReportDocument(
  config: RecordReportConfig,
  catalog: RecordColumn[],
  rows: ReportRow[],
  context: ReportContext,
): Record<string, unknown> {
  const byKey = new Map(catalog.map((column) => [column.key, column]));
  // Título vazio nunca chega aqui: normalizeReportConfig só guarda `label` quando há texto.
  const columns = config.columns.flatMap((column) => {
    const known = byKey.get(column.key);
    return known ? [{ key: column.key, label: column.label ?? known.label }] : [];
  });

  const groupKey = config.groupBy && byKey.has(config.groupBy) ? config.groupBy : null;
  const sortKey = config.sortBy && byKey.has(config.sortBy) ? config.sortBy : null;
  const groups = groupRows(sortRows(rows, sortKey, config.sortDir), groupKey, context.phaseOrder);
  const groupLabel = groupKey ? (byKey.get(groupKey)?.label ?? '') : '';
  // Agrupado pela coluna, repetir a coluna em cada linha é ruído.
  const bodyColumns = groupKey && columns.length > 1 ? columns.filter((column) => column.key !== groupKey) : columns;

  // A4 menos as margens laterais (32 + 32): largura útil para as linhas desenhadas.
  const contentWidth = (config.orientation === 'landscape' ? 841.89 : 595.28) - 64;
  const content: Content[] = [
    { text: config.title, style: 'title' },
    ...(config.subtitle ? [{ text: config.subtitle, style: 'subtitle' }] : []),
    {
      text: `${context.processName} · ${plural(rows.length)} · gerado em ${context.generatedAt} por ${context.generatedBy}`,
      style: 'meta',
    },
    ...(config.showFilters && context.filters.length
      ? [{ text: `Filtros: ${context.filters.join(' · ')}`, style: 'meta' }]
      : []),
    { canvas: [{ type: 'line', x1: 0, y1: 2, x2: contentWidth, y2: 2, lineWidth: 0.6, lineColor: COLORS.line }], margin: [0, 2, 0, 10] },
  ];

  if (rows.length === 0) {
    content.push({ text: 'Nenhum registro encontrado com os filtros aplicados.', color: COLORS.muted, italics: true });
  }

  for (const group of rows.length ? groups : []) {
    if (groupKey) {
      content.push({
        text: [
          { text: `${groupLabel}: `, color: COLORS.muted },
          { text: group.label, bold: true },
          { text: `  ·  ${plural(group.rows.length)}`, color: COLORS.muted },
        ],
        style: 'groupHeader',
      });
    }
    if (config.layout === 'cards') content.push(...cardsFor(bodyColumns, group.rows, contentWidth));
    else content.push(tableFor(bodyColumns, group.rows));
  }

  if (config.showSummary && rows.length) {
    content.push({ text: 'Resumo', style: 'groupHeader', margin: [0, 8, 0, 4] });
    const summaryBody: Array<Array<Record<string, unknown>>> = groupKey
      ? groups.map((group) => [{ text: group.label }, { text: String(group.rows.length), alignment: 'right' }])
      : [];
    summaryBody.push([{ text: 'Total', bold: true }, { text: String(rows.length), bold: true, alignment: 'right' }]);
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: groupKey ? groupLabel : '', style: 'tableHeader' }, { text: 'Registros', style: 'tableHeader', alignment: 'right' }],
          ...summaryBody,
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 0],
      unbreakable: summaryBody.length <= 30,
    });
  }

  const baseSize = config.fontSize === 'small' ? 7.5 : 9;
  return {
    pageSize: 'A4',
    pageOrientation: config.orientation,
    pageMargins: [32, 36, 32, 40],
    info: { title: config.title, subject: context.processName },
    defaultStyle: { font: 'Roboto', fontSize: baseSize, color: COLORS.text },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        // O título padrão já traz o processo ("Registros · Compras"); não repete no rodapé.
        {
          text: config.title.includes(context.processName) ? config.title : `${config.title} · ${context.processName}`,
          color: COLORS.muted,
          fontSize: 7,
        },
        { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', color: COLORS.muted, fontSize: 7 },
      ],
      margin: [32, 12, 32, 0],
    }),
    styles: {
      title: { fontSize: baseSize + 9, bold: true },
      subtitle: { fontSize: baseSize + 2, color: COLORS.muted, margin: [0, 2, 0, 0] },
      meta: { fontSize: baseSize - 0.5, color: COLORS.muted, margin: [0, 3, 0, 0] },
      groupHeader: { fontSize: baseSize + 2, color: COLORS.group, margin: [0, 6, 0, 4] },
      tableHeader: { bold: true, color: COLORS.text },
    },
  };
}

/** Renderiza com o mesmo arranjo de fontes de responses.service (Roboto do próprio pacote). */
export async function renderPdf(document: Record<string, unknown>): Promise<Buffer> {
  const fontesRoboto = join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto');
  // A 0.3 nega leitura de arquivo local por padrão; libera só a pasta das fontes. O pdfmake é uma
  // instância única no processo — outro serviço pode ter mudado a política, então reaplica sempre.
  pdfmake.setLocalAccessPolicy((caminho: string) => caminho.startsWith(fontesRoboto));
  // O relatório não busca nada na rede (imagem remota num valor viraria requisição do servidor).
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.addFonts({
    Roboto: {
      normal: join(fontesRoboto, 'Roboto-Regular.ttf'),
      bold: join(fontesRoboto, 'Roboto-Medium.ttf'),
      italics: join(fontesRoboto, 'Roboto-Italic.ttf'),
      bolditalics: join(fontesRoboto, 'Roboto-MediumItalic.ttf'),
    },
  });
  return pdfmake.createPdf(document).getBuffer();
}
