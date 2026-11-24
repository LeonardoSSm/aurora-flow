import type { RowDataPacket } from 'mysql2/promise';
import type { AlertaDetalhe, DetalhesItem } from './fonte.types';
import {
  type Bruto,
  campo,
  moeda,
  moedaUnitaria,
  numero,
  presente,
  quantidade,
  rotulo,
  secao,
  semZero,
  simNao,
  tabela,
  texto,
} from './formato';

/*
 * Ficha completa de um pedido de venda (pedida pelo dono do projeto em 2026-10-08).
 * Quatro consultas pela chave do pedido em vez de uma só: juntar romaneios e descontos
 * agrupados por pedido numa subconsulta faz o MySQL agrupar a tabela inteira de romaneios
 * (2,2 mi de linhas) a cada pedido aberto. Assim, cada uma usa o índice de `idPedido`.
 */

/** O ERP grava "sem data" como 0000-00-00 em colunas NOT NULL: só data real é formatada. */
const data = (coluna: string): string =>
  `IF(${coluna} > '1000-01-01', DATE_FORMAT(${coluna}, '%d/%m/%Y'), NULL)`;
const dataHora = (coluna: string): string =>
  `IF(${coluna} > '1000-01-01', DATE_FORMAT(${coluna}, '%d/%m/%Y %H:%i'), NULL)`;

/** Itens e romaneios de um pedido são poucos; o teto só protege contra lixo no ERP. */
const MAX_LINHAS = 500;

export function sqlCabecalho(hint: string): string {
  return `SELECT ${hint}
      p.idPedido AS pedido,
      p.idPedidoTOTVS AS pedido_totvs,
      p.idPedidoAgrosys AS pedido_agrosys,
      p.idPedidoLegus AS pedido_legus,
      p.pedidoClienteLegus AS pedido_cliente_legus,
      p.status,
      p.datahoraCancelamento > '1000-01-01' AS tem_data_cancelamento,
      ${dataHora('p.datahoraCancelamento')} AS data_cancelamento,
      p.motivoCancelamento AS motivo_cancelamento,
      p.pedidoAlteradoSistema AS alterado_sistema,
      p.sincronismoPendente AS sincronismo,
      ${dataHora('p.dataHoraSincTotvs')} AS data_sincronismo,
      ${dataHora('p.datahora')} AS data_digitacao,
      ${data('p.dataEntrega')} AS data_entrega,
      ${data('p.dataSaida')} AS data_saida,
      ${data('p.dataVencimento')} AS data_vencimento,
      ${data('p.dataVencimentoReal')} AS data_vencimento_real,
      ${dataHora('p.dataHoraBaixa')} AS data_baixa,
      e.idFilialTOTVS AS empresa_filial_totvs,
      e.nomeFantasia AS empresa_fantasia,
      e.nome AS empresa_razao,
      e.cnpj AS empresa_cnpj,
      c.idClienteTOTVS AS cliente_totvs,
      c.idLojaTOTVS AS cliente_loja_totvs,
      c.codigoCliente AS cliente_codigo,
      c.nome_fantasia AS cliente_fantasia,
      c.nome AS cliente_razao,
      c.cnpj AS cliente_documento,
      c.inscricao_estadual AS cliente_ie,
      c.telefone1 AS cliente_telefone,
      c.whatsapp AS cliente_whatsapp,
      COALESCE(NULLIF(TRIM(c.emailNfe), ''), c.email_comercial) AS cliente_email,
      c.descontoAutomatico AS cliente_desconto_automatico,
      c.status AS cliente_status,
      c.endereco AS cliente_endereco,
      c.numero AS cliente_numero,
      c.complemento AS cliente_complemento,
      c.bairro AS cliente_bairro,
      -- clientes.cidade é o código IBGE do município.
      COALESCE(mun.nome, NULLIF(c.cidade, 0)) AS cliente_cidade,
      c.siglaEstado AS cliente_uf,
      c.cep AS cliente_cep,
      v.codigo AS vendedor_codigo,
      v.idVendedorTOTVS AS vendedor_totvs,
      v.nomeVendedor AS vendedor_nome,
      gp.grupo AS grupo_produto,
      gp.descricao AS grupo_produto_codigo,
      gp.idGrupoTOTVS AS grupo_produto_totvs,
      p.tipoVenda AS tipo_venda,
      p.cfop,
      p.contasReceber AS contas_receber,
      p.prazo,
      fp.forma_pagamento,
      cp.descricao AS condicao_pagamento,
      cp.prazoPagamento AS condicao_prazo,
      cp.desconto AS condicao_desconto,
      p.observacao,
      p.mensagemCliente AS mensagem_cliente,
      p.motivoPendencia AS motivo_pendencia,
      rota.nomeRota AS rota,
      mot.nomeMotorista AS motorista,
      p.numeroNfe AS nfe_numero,
      p.serieNfe AS nfe_serie,
      p.chaveNfe AS nfe_chave,
      p.nfeGerada AS nfe_gerada,
      p.statusEnvioNfe AS nfe_status_envio,
      ${dataHora('p.dataHoraEnvioNfe')} AS nfe_data_envio,
      p.valorPedido AS valor_pedido,
      p.valorTotalPedido AS valor_total,
      p.desconto AS desconto_comercial,
      p.descontoFinanceiro AS desconto_financeiro,
      p.descontoQuebra AS desconto_quebra,
      p.descontoMortes AS desconto_mortes,
      p.descontoTotal AS desconto_total,
      p.saldoDevedor AS saldo_devedor,
      p.qtdeRecebidaCliente AS qtde_recebida_cliente,
      p.qtdeAves AS qtde_aves,
      p.qtdeAvesMortas AS qtde_aves_mortas,
      p.qtdeOvosQuebra AS qtde_quebra,
      p.analiseAvaria AS analise_avaria,
      p.idPedidoDescontoUtilizado AS pedido_desconto_utilizado
    FROM ve_pedidos AS p
    LEFT JOIN empresas AS e ON e.id = p.idEmpresa
    LEFT JOIN clientes AS c ON c.id = p.idCliente
    LEFT JOIN tab_municipios AS mun ON mun.id = c.cidade
    LEFT JOIN ve_vendedores AS v ON v.idVendedor = p.idVendedor
    LEFT JOIN grupo_produtos AS gp ON gp.id = p.idGrupoProduto
    LEFT JOIN formas_pagamento AS fp ON fp.id = p.idFormaPagamento
    LEFT JOIN ve_condicao_pagamentos AS cp ON cp.id = p.idCondicaoPagamento
    LEFT JOIN cl_rotas AS rota ON rota.idRota = p.idRota
    LEFT JOIN motorista AS mot ON mot.idMotorista = p.idMotorista
    WHERE p.idPedido = ?
    LIMIT 1`;
}

export function sqlItens(hint: string): string {
  return `SELECT ${hint}
      i.idItem AS id_item,
      i.nItemPed AS numero_item,
      pf.codigo AS produto_codigo,
      pf.idProdutoTOTVS AS produto_totvs,
      pf.descricao AS produto,
      pf.ncm,
      COALESCE(um_item.abreviacao, um_produto.abreviacao) AS unidade,
      i.qtdeSolicitado AS qtde_solicitada,
      i.qtde AS qtde_faturada,
      i.pesoBruto AS peso_bruto,
      i.valorUnitarioTabelaPreco AS unitario_tabela,
      i.valorUnitario AS unitario_venda,
      i.valorUnitarioFaturamento AS unitario_faturamento,
      i.valorTotal AS valor_total,
      i.qtdeQuebraOvos AS qtde_quebra,
      i.valorQuebraOvos AS valor_quebra
    FROM ve_pedidos_item AS i
    LEFT JOIN cl_produtoFinal AS pf ON pf.idProdutoFinal = i.idProdutoFinal
    LEFT JOIN unidade_medida AS um_item ON um_item.id = i.idUnidadeMedida
    LEFT JOIN unidade_medida AS um_produto ON um_produto.id = pf.idUnidadeMedida
    WHERE i.idPedido = ?
    ORDER BY COALESCE(i.nItemPed, i.idItem), i.idItem
    LIMIT ${MAX_LINHAS}`;
}

export function sqlRomaneios(hint: string): string {
  return `SELECT ${hint} DISTINCT
      ri.idRomaneio AS romaneio,
      ri.sequencia,
      rr.idExpedicao AS expedicao,
      ${data('rr.dataEntrega')} AS data_entrega,
      rr.status,
      mot.nomeMotorista AS motorista
    FROM ve_expedicao_romaneios_itens AS ri
    LEFT JOIN ve_expedicao_romaneios AS rr ON rr.idRomaneio = ri.idRomaneio
    LEFT JOIN motorista AS mot ON mot.idMotorista = rr.idMotorista
    WHERE ri.idPedido = ?
    ORDER BY ri.idRomaneio, ri.sequencia
    LIMIT ${MAX_LINHAS}`;
}

export function sqlDescontos(hint: string): string {
  return `SELECT ${hint}
      fd.id,
      fd.status,
      fd.descontoSituacao AS situacao,
      fd.statusAvaria AS tipo_avaria,
      fd.qtde_quebra,
      fd.desconto_quebra AS valor_quebra,
      fd.qtde_morte AS qtde_mortes,
      fd.desconto_mortes AS valor_mortes,
      fd.observacao
    FROM financeiro_desconto_quebra AS fd
    WHERE fd.idPedido = ?
    ORDER BY fd.id
    LIMIT ${MAX_LINHAS}`;
}

type Linha = RowDataPacket & Record<string, Bruto>;
export type LinhaCabecalho = Linha;
export type LinhaItem = Linha;
export type LinhaRomaneio = Linha;
export type LinhaDesconto = Linha;

/* Significado dos códigos: comentários das colunas no ERP. */
const STATUS_PEDIDO = { '1': 'OK', '2': 'Cancelado' };
const TIPO_VENDA = {
  '1': 'Venda',
  '2': 'Troca',
  '3': 'Bonificação',
  '4': 'Desperdício',
  '5': 'Refeitório',
  '6': 'Consignação (transferência)',
  '7': 'Consignação (venda)',
  '8': 'Consignação - venda',
  '9': 'Transferência',
};
const SINCRONISMO = { '0': 'Pendente', '5': 'OK' };
const ENVIO_NFE = {
  '1': 'Enviado',
  '2': 'Pendente de envio',
  '3': 'XML diferente do PDF',
  '4': 'Somente PDF',
};
const STATUS_CLIENTE = { '1': 'Ativo', '2': 'Desativado' };
const TIPO_AVARIA = { '1': 'Quebra de ovos', '2': 'Mortes de frango', '3': 'Quebra de frango' };
/** O ERP só documenta 0 e 1; a maioria dos pedidos tem 2 (sem significado conhecido): some. */
const ANALISE_AVARIA: Record<string, string> = { '0': 'Bonificação', '1': 'Avaria lançada' };

/** A diferença de um centavo ou mais entre o total do item e qtde × unitário vira alerta. */
const TOLERANCIA_DIVERGENCIA = 0.005;

export function montarDetalhes(
  p: LinhaCabecalho,
  itens: LinhaItem[],
  romaneios: LinhaRomaneio[],
  descontos: LinhaDesconto[],
): DetalhesItem {
  const id = String(p.pedido);
  const cliente = texto(p.cliente_fantasia) ?? texto(p.cliente_razao);
  const empresa = texto(p.empresa_fantasia) ?? texto(p.empresa_razao);
  const cancelado =
    numero(p.status) === 2 ||
    numero(p.tem_data_cancelamento) === 1 ||
    texto(p.motivo_cancelamento) !== null;
  const alertas: AlertaDetalhe[] = [];

  if (cancelado) {
    const quando = texto(p.data_cancelamento);
    const motivo = texto(p.motivo_cancelamento);
    alertas.push({
      tipo: 'perigo',
      texto: [
        `Pedido cancelado${quando ? ` em ${quando}` : ''}.`,
        motivo ? `Motivo: ${motivo}` : null,
      ]
        .filter(presente)
        .join(' '),
    });
  }
  if (numero(p.cliente_status) === 2) {
    alertas.push({ tipo: 'aviso', texto: 'Cliente desativado no ERP.' });
  }
  if (numero(p.sincronismo) === 0) {
    alertas.push({ tipo: 'aviso', texto: 'Sincronismo com o TOTVS pendente.' });
  }

  const linhasItens = itens.map((item, indice) => {
    const qtde = numero(item.qtde_faturada) ?? 0;
    const unitario = numero(semZero(item.unitario_faturamento)) ?? numero(item.unitario_venda) ?? 0;
    const total = numero(item.valor_total) ?? 0;
    const calculado = Math.round(qtde * unitario * 100) / 100;
    const numeroItem = texto(item.numero_item) ?? String(indice + 1);
    if (Math.abs(total - calculado) >= TOLERANCIA_DIVERGENCIA) {
      alertas.push({
        tipo: 'aviso',
        texto: `Item ${numeroItem}: total ${moeda(total)} difere de quantidade × valor unitário (${moeda(calculado)}).`,
      });
    }
    return {
      item: numeroItem,
      codigo: texto(item.produto_codigo),
      totvs: texto(item.produto_totvs),
      produto: texto(item.produto),
      ncm: texto(item.ncm),
      unidade: texto(item.unidade),
      qtde_solicitada: quantidade(semZero(item.qtde_solicitada)),
      qtde_faturada: quantidade(item.qtde_faturada),
      peso_bruto: quantidade(semZero(item.peso_bruto)),
      unitario_tabela: moedaUnitaria(semZero(item.unitario_tabela)),
      unitario_venda: moedaUnitaria(item.unitario_venda),
      unitario_faturamento: moedaUnitaria(semZero(item.unitario_faturamento)),
      valor_total: moeda(item.valor_total),
      quebra: quebraItem(item),
    };
  });

  const unidades = new Set(itens.map((item) => texto(item.unidade)));
  const totalItens =
    itens.length > 1
      ? {
          item: 'Total',
          // Somar quantidades de unidades diferentes (caixa + bandeja) não faz sentido.
          qtde_faturada: unidades.size === 1 ? quantidade(soma(itens, 'qtde_faturada')) : null,
          valor_total: moeda(soma(itens, 'valor_total')),
        }
      : undefined;

  const valorTotal = numero(p.valor_total) ?? 0;
  const descontoTotal = numero(p.desconto_total) ?? 0;
  const percentualDesconto =
    valorTotal !== 0 && descontoTotal !== 0
      ? `${quantidade(Math.round((descontoTotal / valorTotal) * 10000) / 100)}%`
      : null;

  return {
    value: id,
    label: `Pedido ${id}`,
    titulo: `Pedido ${id}`,
    alertas,
    resumo: [
      campo('Cliente', cliente),
      campo('Valor total', moeda(p.valor_total)),
      campo('Entrega', texto(p.data_entrega)),
      campo('Situação', cancelado ? 'Cancelado' : rotulo(p.status, STATUS_PEDIDO)),
      campo('Tipo de venda', rotulo(p.tipo_venda, TIPO_VENDA)),
      campo('Empresa', empresa),
    ].filter(presente),
    secoes: [
      secao('Cliente', [
        campo('Nome fantasia', texto(p.cliente_fantasia)),
        campo('Razão social', texto(p.cliente_razao)),
        campo('CPF/CNPJ', texto(p.cliente_documento)),
        campo('Inscrição estadual', texto(p.cliente_ie)),
        campo(
          'Código',
          juntar([
            texto(p.cliente_codigo),
            codigoTotvs(texto(p.cliente_totvs), texto(p.cliente_loja_totvs)),
          ]),
        ),
        campo('Situação', rotulo(p.cliente_status, STATUS_CLIENTE)),
        campo('Telefone', texto(p.cliente_telefone)),
        campo('WhatsApp', texto(p.cliente_whatsapp)),
        campo('E-mail', texto(p.cliente_email)),
        campo('Desconto automático', rotulo(p.cliente_desconto_automatico, { S: 'Sim', N: 'Não' })),
        campo('Endereço', endereco(p), true),
      ]),
      secao('Valores', [
        campo('Valor do pedido', moeda(p.valor_pedido)),
        campo('Desconto comercial', moeda(semZero(p.desconto_comercial))),
        campo('Desconto financeiro', moeda(semZero(p.desconto_financeiro))),
        campo('Desconto de quebra', moeda(semZero(p.desconto_quebra))),
        campo('Desconto de mortes', moeda(semZero(p.desconto_mortes))),
        campo(
          'Desconto total',
          juntar([moeda(semZero(p.desconto_total)), percentualDesconto], ' — '),
        ),
        campo('Valor total', moeda(p.valor_total)),
        campo('Saldo devedor', moeda(p.saldo_devedor)),
      ]),
      secao('Observações', [
        campo('Observação', texto(p.observacao), true),
        campo('Mensagem ao cliente', texto(p.mensagem_cliente), true),
        // "0|0|0|0|0|" é o vazio desse campo no ERP.
        campo('Motivo da pendência', pendencia(p.motivo_pendencia), true),
      ]),
      secao('Pedido', [
        campo('Número no ERP', id),
        campo('Número no TOTVS', texto(p.pedido_totvs)),
        campo('Número no Agrosys', texto(p.pedido_agrosys)),
        campo('Número no Legus', texto(p.pedido_legus)),
        campo('Pedido do cliente (Legus)', texto(p.pedido_cliente_legus)),
        campo('Alterado pelo sistema', simNao(p.alterado_sistema)),
        campo(
          'Sincronismo TOTVS',
          juntar([rotulo(p.sincronismo, SINCRONISMO), texto(p.data_sincronismo)], ' — '),
        ),
      ]),
      secao('Datas', [
        campo('Digitação', texto(p.data_digitacao)),
        campo('Entrega', texto(p.data_entrega)),
        campo('Saída', texto(p.data_saida)),
        campo('Vencimento', texto(p.data_vencimento)),
        campo('Vencimento real', texto(p.data_vencimento_real)),
        campo('Baixa', texto(p.data_baixa)),
      ]),
      secao('Comercial', [
        campo(
          'Vendedor',
          juntar([
            juntar([texto(p.vendedor_codigo), texto(p.vendedor_nome)], ' — '),
            codigoTotvs(texto(p.vendedor_totvs)),
          ]),
        ),
        campo(
          'Grupo de produto',
          juntar([texto(p.grupo_produto), codigoTotvs(texto(p.grupo_produto_totvs))]),
        ),
        campo('CFOP', texto(p.cfop)),
        campo('Forma de pagamento', texto(p.forma_pagamento)),
        campo('Condição de pagamento', texto(p.condicao_pagamento)),
        campo('Prazo do pedido', dias(p.prazo)),
        campo('Desconto da condição', moeda(semZero(p.condicao_desconto))),
        campo('Contas a receber', simNao(p.contas_receber)),
      ]),
      secao('Entrega', [
        campo('Rota', texto(p.rota)),
        campo('Motorista do pedido', texto(p.motorista)),
      ]),
      secao('Nota fiscal', [
        campo('Número / série', juntar([texto(p.nfe_numero), texto(p.nfe_serie)], ' / ')),
        campo('NF-e gerada', simNao(p.nfe_gerada)),
        campo('Envio da NF-e', rotulo(p.nfe_status_envio, ENVIO_NFE)),
        campo('Enviada em', texto(p.nfe_data_envio)),
        campo('Chave de acesso', texto(p.nfe_chave), true),
      ]),
      secao('Avarias', [
        campo('Quantidade recebida pelo cliente', quantidade(semZero(p.qtde_recebida_cliente))),
        campo('Quantidade de aves', quantidade(semZero(p.qtde_aves))),
        campo('Aves mortas', quantidade(semZero(p.qtde_aves_mortas))),
        campo('Quebra no pedido', quantidade(semZero(p.qtde_quebra))),
        campo('Análise de avaria', ANALISE_AVARIA[texto(p.analise_avaria) ?? ''] ?? null),
        campo('Pedido que usou o desconto', texto(semZero(p.pedido_desconto_utilizado))),
      ]),
      secao('Empresa emitente', [
        campo('Nome', empresa),
        campo('Razão social', texto(p.empresa_razao)),
        campo('CNPJ', texto(p.empresa_cnpj)),
        campo('Filial TOTVS', texto(p.empresa_filial_totvs)),
      ]),
    ].filter(presente),
    tabelas: [
      tabela(
        'Itens',
        [
          { chave: 'item', label: 'Item' },
          { chave: 'codigo', label: 'Código' },
          { chave: 'totvs', label: 'Cód. TOTVS' },
          { chave: 'produto', label: 'Produto' },
          { chave: 'ncm', label: 'NCM' },
          { chave: 'unidade', label: 'Un.' },
          { chave: 'qtde_solicitada', label: 'Qtde solicitada', numerica: true },
          { chave: 'qtde_faturada', label: 'Qtde faturada', numerica: true },
          { chave: 'peso_bruto', label: 'Peso bruto', numerica: true },
          { chave: 'unitario_tabela', label: 'Unit. tabela', numerica: true },
          { chave: 'unitario_venda', label: 'Unit. venda', numerica: true },
          { chave: 'unitario_faturamento', label: 'Unit. faturamento', numerica: true },
          { chave: 'valor_total', label: 'Total', numerica: true },
          { chave: 'quebra', label: 'Quebra', numerica: true },
        ],
        linhasItens,
        totalItens,
      ),
      tabela(
        'Romaneios',
        [
          { chave: 'romaneio', label: 'Romaneio' },
          { chave: 'expedicao', label: 'Expedição' },
          { chave: 'sequencia', label: 'Sequência', numerica: true },
          { chave: 'data_entrega', label: 'Entrega' },
          { chave: 'situacao', label: 'Situação' },
          { chave: 'motorista', label: 'Motorista' },
        ],
        romaneios.map((r) => ({
          romaneio: texto(r.romaneio),
          expedicao: texto(r.expedicao),
          sequencia: texto(r.sequencia),
          data_entrega: texto(r.data_entrega),
          // O ERP só documenta 1 = retornado.
          situacao:
            r.status === null ? null : numero(r.status) === 1 ? 'Retornado' : 'Não retornado',
          motorista: texto(r.motorista),
        })),
      ),
      tabela(
        'Descontos de quebra e mortes (financeiro)',
        [
          { chave: 'registro', label: 'Registro' },
          { chave: 'tipo', label: 'Tipo de avaria' },
          // Códigos sem tabela de significado confiável no ERP: aparecem como estão.
          { chave: 'situacao', label: 'Situação' },
          { chave: 'status', label: 'Status' },
          { chave: 'qtde_quebra', label: 'Qtde quebra', numerica: true },
          { chave: 'valor_quebra', label: 'Valor quebra', numerica: true },
          { chave: 'qtde_mortes', label: 'Qtde mortes', numerica: true },
          { chave: 'valor_mortes', label: 'Valor mortes', numerica: true },
          { chave: 'total', label: 'Total', numerica: true },
          { chave: 'observacao', label: 'Observação' },
        ],
        descontos.map((d) => ({
          registro: texto(d.id),
          tipo: rotulo(d.tipo_avaria, TIPO_AVARIA),
          situacao: texto(d.situacao),
          status: texto(d.status),
          qtde_quebra: quantidade(semZero(d.qtde_quebra)),
          valor_quebra: moeda(semZero(d.valor_quebra)),
          qtde_mortes: quantidade(semZero(d.qtde_mortes)),
          valor_mortes: moeda(semZero(d.valor_mortes)),
          total: moeda((numero(d.valor_quebra) ?? 0) + (numero(d.valor_mortes) ?? 0)),
          observacao: texto(d.observacao),
        })),
        descontos.length > 1
          ? {
              registro: 'Total',
              qtde_quebra: quantidade(soma(descontos, 'qtde_quebra')),
              valor_quebra: moeda(soma(descontos, 'valor_quebra')),
              qtde_mortes: quantidade(soma(descontos, 'qtde_mortes')),
              valor_mortes: moeda(soma(descontos, 'valor_mortes')),
              total: moeda(soma(descontos, 'valor_quebra') + soma(descontos, 'valor_mortes')),
            }
          : undefined,
      ),
    ].filter(presente),
  };
}

function juntar(partes: Array<string | null>, separador = ' · '): string | null {
  const preenchidas = partes.filter(presente);
  return preenchidas.length > 0 ? preenchidas.join(separador) : null;
}

function codigoTotvs(codigo: string | null, loja: string | null = null): string | null {
  if (!codigo) return null;
  return `TOTVS ${codigo}${loja ? `/${loja}` : ''}`;
}

function dias(valor: Bruto): string | null {
  const n = numero(valor);
  if (n === null) return null;
  return n === 1 ? '1 dia' : `${quantidade(n)} dias`;
}

function pendencia(valor: Bruto): string | null {
  const limpo = texto(valor);
  return limpo && /[^0|\s]/.test(limpo) ? limpo : null;
}

function quebraItem(item: LinhaItem): string | null {
  const qtde = quantidade(semZero(item.qtde_quebra));
  const valor = moeda(semZero(item.valor_quebra));
  return juntar([qtde, valor], ' — ');
}

function soma(linhas: Linha[], chave: string): number {
  const total = linhas.reduce((acc, linha) => acc + (numero(linha[chave]) ?? 0), 0);
  return Math.round(total * 1000) / 1000;
}

/** Rua, número, complemento, bairro, cidade/UF e CEP — o número não se repete se já está na rua. */
function endereco(p: LinhaCabecalho): string | null {
  const rua = texto(p.cliente_endereco);
  const num = texto(p.cliente_numero);
  const cep = texto(p.cliente_cep);
  const cidadeUf = juntar([texto(p.cliente_cidade), texto(p.cliente_uf)], '/');
  return juntar(
    [
      rua,
      num && !(rua && new RegExp(`\\b${escaparRegex(num)}$`).test(rua)) ? num : null,
      texto(p.cliente_complemento),
      texto(p.cliente_bairro),
      cidadeUf,
      cep && /^\d{8}$/.test(cep) ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : cep,
    ],
    ', ',
  );
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
