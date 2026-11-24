/**
 * Ficha de um item da API erp-lookup (`GET /fontes/:fonte/detalhes`). Vem pronta para exibir —
 * o Tijuca não conhece as regras de cada lista —, mas é conferida aqui: só passa o formato
 * esperado, com textos e quantidades limitados.
 */
export interface ErpLookupDetailField {
  label: string;
  valor: string;
  largo?: boolean;
}

export interface ErpLookupDetailTable {
  titulo: string;
  colunas: Array<{ chave: string; label: string; numerica?: boolean }>;
  linhas: Array<Record<string, string>>;
  total?: Record<string, string>;
}

export interface ErpLookupDetails {
  value: string;
  titulo: string;
  alertas: Array<{ tipo: 'perigo' | 'aviso'; texto: string }>;
  resumo: ErpLookupDetailField[];
  secoes: Array<{ titulo: string; campos: ErpLookupDetailField[] }>;
  tabelas: ErpLookupDetailTable[];
}

const MAX_TEXTO = 1000;
const MAX_ROTULO = 120;
const MAX_LISTA = 50;
const MAX_CAMPOS = 60;
const MAX_COLUNAS = 20;
const MAX_LINHAS = 500;

type Bruto = Record<string, unknown>;

function isObject(raw: unknown): raw is Bruto {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw);
}

function str(raw: unknown, max: number): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return typeof raw === 'string' ? raw.slice(0, max) : null;
}

function list<T>(raw: unknown, max: number, map: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, max)
    .map(map)
    .filter((item): item is T => item !== null);
}

function toField(raw: unknown): ErpLookupDetailField | null {
  if (!isObject(raw)) return null;
  const label = str(raw.label, MAX_ROTULO);
  const valor = str(raw.valor, MAX_TEXTO);
  if (label === null || valor === null) return null;
  return raw.largo === true ? { label, valor, largo: true } : { label, valor };
}

function toRow(raw: unknown, chaves: string[]): Record<string, string> | null {
  if (!isObject(raw)) return null;
  return Object.fromEntries(chaves.map((chave) => [chave, str(raw[chave], MAX_TEXTO) ?? '']));
}

function toTable(raw: unknown): ErpLookupDetailTable | null {
  if (!isObject(raw)) return null;
  const titulo = str(raw.titulo, MAX_ROTULO);
  const colunas = list(raw.colunas, MAX_COLUNAS, (coluna) => {
    if (!isObject(coluna)) return null;
    const chave = str(coluna.chave, MAX_ROTULO);
    const label = str(coluna.label, MAX_ROTULO);
    if (chave === null || label === null) return null;
    return coluna.numerica === true ? { chave, label, numerica: true } : { chave, label };
  });
  if (titulo === null || colunas.length === 0) return null;
  const chaves = colunas.map((coluna) => coluna.chave);
  const linhas = list(raw.linhas, MAX_LINHAS, (linha) => toRow(linha, chaves));
  if (linhas.length === 0) return null;
  const total = toRow(raw.total, chaves);
  return total ? { titulo, colunas, linhas, total } : { titulo, colunas, linhas };
}

/** `null` quando a resposta nem parece uma ficha (aí a API está quebrada). */
export function toErpLookupDetails(raw: unknown): ErpLookupDetails | null {
  if (!isObject(raw)) return null;
  const value = str(raw.value, MAX_ROTULO);
  const titulo = str(raw.titulo, MAX_ROTULO);
  if (value === null || titulo === null) return null;
  return {
    value,
    titulo,
    alertas: list(raw.alertas, MAX_LISTA, (alerta) => {
      if (!isObject(alerta)) return null;
      const texto = str(alerta.texto, MAX_TEXTO);
      if (texto === null) return null;
      return { tipo: alerta.tipo === 'perigo' ? ('perigo' as const) : ('aviso' as const), texto };
    }),
    resumo: list(raw.resumo, MAX_LISTA, toField),
    secoes: list(raw.secoes, MAX_LISTA, (secao) => {
      if (!isObject(secao)) return null;
      const tituloSecao = str(secao.titulo, MAX_ROTULO);
      const campos = list(secao.campos, MAX_CAMPOS, toField);
      return tituloSecao !== null && campos.length > 0 ? { titulo: tituloSecao, campos } : null;
    }),
    tabelas: list(raw.tabelas, MAX_LISTA, toTable),
  };
}
