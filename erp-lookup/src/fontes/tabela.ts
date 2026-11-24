import { type Bruto, numero, texto } from './formato';
import type {
  DefinicaoTabela,
  LinhaTabela,
  ResultadoTabela,
  TipoColunaTabela,
  ValorCelula,
} from './fonte.types';

/** Texto de célula maior que isso é cortado: o Tijuca recusa células com mais de 1.000. */
export const MAX_CARACTERES_CELULA = 1000;
/** Chave de linha maior que isso não é chave (o Tijuca recusa acima de 180). */
export const MAX_CARACTERES_CHAVE = 180;

/** O ERP tem linhas com chave repetida ou vazia: dado quebrado, não "zero linhas". */
export class TabelaInvalidaError extends Error {}

/**
 * Valor do banco → valor tipado da célula. Número só como `number` (o mysql2 devolve DECIMAL
 * como texto), data só como ISO `YYYY-MM-DD` (e `0000-00-00` do ERP vira `null`).
 */
export function valorCelula(valor: Bruto | Date | boolean, tipo: TipoColunaTabela): ValorCelula {
  if (valor === null || valor === undefined) return null;
  switch (tipo) {
    case 'numero':
    case 'moeda':
      return typeof valor === 'boolean' || valor instanceof Date ? null : numero(valor);
    case 'booleano': {
      if (typeof valor === 'boolean') return valor;
      if (valor instanceof Date) return null;
      const n = numero(valor);
      return n === null ? null : n !== 0;
    }
    case 'data':
      return dataIso(valor);
    case 'texto': {
      if (valor instanceof Date) return dataIso(valor);
      const limpo = texto(typeof valor === 'boolean' ? String(valor) : valor);
      return limpo === null ? null : limpo.slice(0, MAX_CARACTERES_CELULA);
    }
  }
}

function dataIso(valor: Bruto | Date | boolean): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  if (typeof valor !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
  if (!match || match[1] < '1000') return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Linhas do banco → resultado da tabela: só as colunas declaradas, tipadas, na ordem recebida.
 * Chave de linha vazia ou repetida é erro (o Tijuca compara as linhas pela chave).
 */
export function montarResultado(
  definicao: DefinicaoTabela,
  rows: Array<Record<string, unknown>>,
  agora: Date = new Date(),
): ResultadoTabela {
  const vistas = new Set<string>();
  const linhas: LinhaTabela[] = rows.slice(0, definicao.maxLinhas).map((row) => {
    const chave = texto(row[definicao.chaveLinha] as Bruto);
    if (chave === null || chave.length > MAX_CARACTERES_CHAVE) {
      throw new TabelaInvalidaError(`Tabela "${definicao.id}": linha sem chave válida.`);
    }
    if (vistas.has(chave)) {
      throw new TabelaInvalidaError(`Tabela "${definicao.id}": chave de linha repetida.`);
    }
    vistas.add(chave);
    const valores: Record<string, ValorCelula> = {};
    for (const coluna of definicao.colunas) {
      valores[coluna.chave] = valorCelula(row[coluna.chave] as Bruto | Date, coluna.tipo);
    }
    return { chave, valores };
  });
  return { versao: 1, tabela: definicao.id, consultadoEm: agora.toISOString(), linhas };
}
