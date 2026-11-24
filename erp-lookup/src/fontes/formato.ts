import type { CampoDetalhe, ColunaDetalhe, SecaoDetalhe, TabelaDetalhe } from './fonte.types';

/** O que chega do mysql2: texto, número (DOUBLE/INT) ou NULL. */
export type Bruto = string | number | null | undefined;

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MOEDA_UNITARIA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** Entidades HTML que o ERP grava em textos livres (ex.: "n&atilde;o" no motivo do cancelamento). */
const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ', // espaço comum: a ficha não precisa do não separável
  ordf: 'ª',
  ordm: 'º',
  deg: '°',
};
/** Acentos combinantes (U+0300...): somados à letra e normalizados viram "ã", "é", "ç". */
const ACENTOS: Record<string, string> = {
  acute: String.fromCharCode(0x301),
  grave: String.fromCharCode(0x300),
  circ: String.fromCharCode(0x302),
  tilde: String.fromCharCode(0x303),
  uml: String.fromCharCode(0x308),
  cedil: String.fromCharCode(0x327),
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, nome: string) => {
    if (nome[0] === '#') {
      const codigo =
        nome[1].toLowerCase() === 'x' ? parseInt(nome.slice(2), 16) : Number(nome.slice(1));
      return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : original;
    }
    if (ENTIDADES[nome]) return ENTIDADES[nome];
    // &atilde; &Ccedil; &eacute; ...: letra + acento combinado.
    const acento = ACENTOS[nome.slice(1)];
    return acento ? (nome[0] + acento).normalize('NFC') : original;
  });
}

/** Texto sem espaços nas pontas; vazio vira `null` (e some da ficha). */
export function texto(valor: Bruto): string | null {
  if (valor === null || valor === undefined) return null;
  const limpo = decodificarEntidades(String(valor)).trim();
  return limpo ? limpo : null;
}

/** Número do banco (DOUBLE vem como number; DECIMAL viria como string). */
export function numero(valor: Bruto): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function moeda(valor: Bruto): string | null {
  const n = numero(valor);
  return n === null ? null : MOEDA.format(n);
}

/** Valor unitário: até 4 casas, como o ERP grava. */
export function moedaUnitaria(valor: Bruto): string | null {
  const n = numero(valor);
  return n === null ? null : MOEDA_UNITARIA.format(n);
}

export function quantidade(valor: Bruto): string | null {
  const n = numero(valor);
  return n === null ? null : NUMERO.format(n);
}

/** Zero no ERP costuma ser "não preenchido": some da ficha. */
export function semZero(valor: Bruto): Bruto {
  return numero(valor) === 0 ? null : valor;
}

export function simNao(valor: Bruto): string | null {
  const n = numero(valor);
  if (n === null) return null;
  return n === 0 ? 'Não' : 'Sim';
}

/**
 * Código → texto, pelos comentários das colunas no ERP. Código fora da tabela aparece como
 * "código N" — melhor que sumir ou inventar um significado.
 */
export function rotulo(valor: Bruto, tabela: Record<string, string>): string | null {
  const chave = texto(valor);
  if (chave === null) return null;
  return tabela[chave] ?? `código ${chave}`;
}

export function campo(label: string, valor: string | null, largo = false): CampoDetalhe | null {
  if (valor === null) return null;
  return largo ? { label, valor, largo } : { label, valor };
}

/** Seção sem nenhum campo preenchido não vai para a ficha. */
export function secao(titulo: string, campos: Array<CampoDetalhe | null>): SecaoDetalhe | null {
  const preenchidos = campos.filter((c): c is CampoDetalhe => c !== null);
  return preenchidos.length > 0 ? { titulo, campos: preenchidos } : null;
}

/**
 * Tabela sem linhas não vai para a ficha. Coluna vazia em todas as linhas (ex.: peso bruto que
 * ninguém preenche) também some, para caber melhor na tela.
 */
export function tabela(
  titulo: string,
  colunas: ColunaDetalhe[],
  linhas: Array<Record<string, string | null>>,
  total?: Record<string, string | null>,
): TabelaDetalhe | null {
  if (linhas.length === 0) return null;
  const visiveis = colunas.filter((coluna) => linhas.some((linha) => !!linha[coluna.chave]));
  const limpar = (linha: Record<string, string | null>): Record<string, string> =>
    Object.fromEntries(visiveis.map(({ chave }) => [chave, linha[chave] ?? '']));
  return {
    titulo,
    colunas: visiveis,
    linhas: linhas.map(limpar),
    ...(total ? { total: limpar(total) } : {}),
  };
}

export function presente<T>(valor: T | null): valor is T {
  return valor !== null;
}
