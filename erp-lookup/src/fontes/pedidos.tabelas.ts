import type { DefinicaoTabela } from './fonte.types';

/**
 * Itens de um pedido como tabela (campo "Tabela dinâmica do ERP", 2026-10-08). Mesma consulta
 * da ficha (`sqlItens`): as colunas são os apelidos daquele SELECT, com os valores crus do
 * banco — quem escolhe o que aparece no formulário é o construtor.
 */
export const TABELA_ITENS: DefinicaoTabela = {
  id: 'itens',
  label: 'Itens do pedido',
  parametros: [{ nome: 'pedidoId', tipo: 'numero', obrigatorio: true }],
  chaveLinha: 'id_item',
  maxLinhas: 500,
  colunas: [
    { chave: 'numero_item', label: 'Item', tipo: 'texto' },
    { chave: 'produto_codigo', label: 'Código', tipo: 'texto' },
    { chave: 'produto_totvs', label: 'Cód. TOTVS', tipo: 'texto' },
    { chave: 'produto', label: 'Produto', tipo: 'texto' },
    { chave: 'ncm', label: 'NCM', tipo: 'texto' },
    { chave: 'unidade', label: 'Un.', tipo: 'texto' },
    { chave: 'qtde_solicitada', label: 'Qtde solicitada', tipo: 'numero' },
    { chave: 'qtde_faturada', label: 'Qtde faturada', tipo: 'numero' },
    { chave: 'peso_bruto', label: 'Peso bruto', tipo: 'numero' },
    { chave: 'unitario_tabela', label: 'Unit. tabela', tipo: 'moeda' },
    { chave: 'unitario_venda', label: 'Unit. venda', tipo: 'moeda' },
    { chave: 'unitario_faturamento', label: 'Unit. faturamento', tipo: 'moeda' },
    { chave: 'valor_total', label: 'Total', tipo: 'moeda' },
    { chave: 'qtde_quebra', label: 'Qtde quebra', tipo: 'numero' },
    { chave: 'valor_quebra', label: 'Valor quebra', tipo: 'moeda' },
  ],
};
