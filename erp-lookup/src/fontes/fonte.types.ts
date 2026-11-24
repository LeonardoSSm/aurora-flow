/**
 * - `lista`: lista curta, carregada inteira quando o campo abre (pesquisa opcional).
 * - `pesquisa`: lista grande, só responde a partir de alguns caracteres digitados.
 */
export type ModoFonte = 'lista' | 'pesquisa';

/** O contrato com o Tijuca: `value` é o código no ERP, `label` é o que o usuário vê. */
export interface ItemFonte {
  value: string;
  label: string;
}

/** Um rótulo e um valor já formatado (data, moeda, código → texto) para exibir como está. */
export interface CampoDetalhe {
  label: string;
  valor: string;
  /** Ocupa a linha toda (endereço, chave da NF-e, observação). */
  largo?: boolean;
}

export interface SecaoDetalhe {
  titulo: string;
  campos: CampoDetalhe[];
}

export interface ColunaDetalhe {
  chave: string;
  label: string;
  /** Alinha à direita (quantidades e valores). */
  numerica?: boolean;
}

export interface TabelaDetalhe {
  titulo: string;
  colunas: ColunaDetalhe[];
  linhas: Array<Record<string, string>>;
  /** Linha de totais, nas mesmas chaves das colunas. */
  total?: Record<string, string>;
}

export interface AlertaDetalhe {
  tipo: 'perigo' | 'aviso';
  texto: string;
}

/**
 * Ficha de um item para quem preenche o formulário. Vem pronta para exibir: o Tijuca não
 * conhece as regras de cada lista, só desenha alertas, resumo, seções e tabelas na ordem
 * recebida. Campo sem valor não vem; seção ou tabela vazia também não.
 */
export interface DetalhesItem extends ItemFonte {
  titulo: string;
  alertas: AlertaDetalhe[];
  /** Poucos campos em destaque no topo da ficha. */
  resumo: CampoDetalhe[];
  secoes: SecaoDetalhe[];
  tabelas: TabelaDetalhe[];
}

/*
 * Tabelas de uma fonte, para o campo "Tabela dinâmica do ERP" (uma linha do formulário por linha
 * devolvida). Diferente da ficha, os valores vêm tipados — número é número, data é ISO — porque
 * o Tijuca grava o retrato e compara o hash no envio. Ver
 * Docs/campo_tabela_dinamica_erp_implantacao.md (§4.1).
 */
export type TipoColunaTabela = 'texto' | 'numero' | 'moeda' | 'data' | 'booleano';
export type ValorCelula = string | number | boolean | null;

export interface ParametroTabela {
  nome: string;
  tipo: 'texto' | 'numero';
  obrigatorio: boolean;
}

export interface ColunaTabela {
  chave: string;
  label: string;
  tipo: TipoColunaTabela;
}

export interface DefinicaoTabela {
  id: string;
  label: string;
  parametros: ParametroTabela[];
  colunas: ColunaTabela[];
  /** Nome da coluna do resultado que identifica a linha (estável entre consultas). */
  chaveLinha: string;
  maxLinhas: number;
}

export interface LinhaTabela {
  chave: string;
  valores: Record<string, ValorCelula>;
}

export interface ResultadoTabela {
  versao: 1;
  tabela: string;
  consultadoEm: string;
  linhas: LinhaTabela[];
}

export interface Fonte {
  readonly id: string;
  readonly label: string;
  readonly modo: ModoFonte;
  /** `q` vazio = sem filtro (só faz sentido no modo `lista`). */
  pesquisar(q: string, limit: number): Promise<ItemFonte[]>;
  /** `null` quando o código não existe (ou deixou de passar nos filtros da lista). */
  resolver(value: string): Promise<ItemFonte | null>;
  /** Opcional: ficha completa do item. `null` quando o código não existe. */
  detalhar?(value: string): Promise<DetalhesItem | null>;
  /** Opcional: tabelas que a fonte expõe. */
  tabelas?(): DefinicaoTabela[];
  /**
   * Linhas de uma tabela já declarada em `tabelas()`, com os parâmetros já conferidos (presença
   * e tipo) pelo controller. `null` quando o registro pai não existe (ex.: pedido inexistente).
   */
  consultarTabela?(
    tabela: string,
    parametros: Record<string, string>,
  ): Promise<ResultadoTabela | null>;
}
