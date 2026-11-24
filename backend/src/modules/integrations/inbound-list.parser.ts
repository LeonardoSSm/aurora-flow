/**
 * Lê uma lista de valores (ex.: números de pedido) enviada como texto ou arquivo .txt/.csv para a
 * rota de lista do webhook (POST /webhooks/in/:token/list). Aceita o que um sistema costuma gerar:
 *
 * - um valor por linha;
 * - valores numa linha só, separados por vírgula, ponto e vírgula, tab, barra vertical ou espaço;
 * - tabela (CSV): todas as linhas com o mesmo número de colunas. Com cabeçalho, vale a coluna cujo
 *   nome lembra pedido/número/código; sem coluna reconhecível, a primeira.
 *
 * Um cabeçalho é a primeira linha sem nenhum dígito (números de pedido sempre têm). Valores vazios
 * somem e repetidos contam uma vez, na ordem em que apareceram.
 */

const DELIMITERS = [';', '\t', '|', ','] as const;
const ORDER_COLUMN = /pedido|numero|nro|num|codigo|order|item/;

function hasDigit(value: string): boolean {
  return /\d/.test(value);
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"').trim()
    : trimmed;
}

/** Um separador só por conteúdo: o primeiro que aparece, nesta ordem (`;` antes de `,` por causa de decimais). */
function pickDelimiter(rows: readonly string[]): string | null {
  return DELIMITERS.find((delimiter) => rows.some((row) => row.includes(delimiter))) ?? null;
}

export function parseInboundList(content: string): string[] {
  const rows = content
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length === 0) return [];

  const delimiter = pickDelimiter(rows);
  const table = rows.map((row) => (delimiter ? row.split(delimiter) : [row]).map(unquote));
  const isTable =
    rows.length > 1 && table[0].length > 1 && table.every((cells) => cells.length === table[0].length);

  let values: string[];
  if (isTable) {
    const header = table[0];
    const hasHeader = !header.some(hasDigit);
    const column = hasHeader
      ? Math.max(0, header.findIndex((name) => ORDER_COLUMN.test(normalizeHeader(name))))
      : 0;
    values = (hasHeader ? table.slice(1) : table).map((cells) => cells[column]);
  } else {
    values = table.flat().flatMap((cell) => cell.split(/\s+/));
    if (values.length > 1 && !hasDigit(values[0]) && values.slice(1).some(hasDigit)) {
      values = values.slice(1);
    }
  }

  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
