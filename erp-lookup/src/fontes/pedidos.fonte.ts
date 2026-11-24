import type { RowDataPacket } from 'mysql2/promise';
import type { MysqlService } from '../db/mysql.service';
import type {
  DefinicaoTabela,
  DetalhesItem,
  Fonte,
  ItemFonte,
  ResultadoTabela,
} from './fonte.types';
import {
  type LinhaCabecalho,
  type LinhaDesconto,
  type LinhaItem,
  type LinhaRomaneio,
  montarDetalhes,
  sqlCabecalho,
  sqlDescontos,
  sqlItens,
  sqlRomaneios,
} from './pedidos.detalhes';
import { TABELA_ITENS } from './pedidos.tabelas';
import { montarResultado } from './tabela';

/** `int` com sinal do MySQL: número maior que isso não é um pedido (e nem vai para o SQL). */
const MAX_ID_PEDIDO = 2_147_483_647;

type LinhaPedido = RowDataPacket & {
  value: number;
  cliente: string | null;
  empresa: string | null;
  data_saida: string | null;
  cancelado: number;
};

/**
 * Pedidos de venda do ERP (`ve_pedidos`), definidos com o dono do projeto em 2026-10-07:
 * - pesquisa só pelo número exato do pedido (3,2 mi de pedidos: só a chave primária é instantânea);
 * - um pedido por opção; itens, romaneios e descontos aparecem na ficha (`detalhar`, 2026-10-08);
 * - cancelados aparecem, marcados "CANCELADO".
 * Cliente e empresa por LEFT JOIN: pedido com cadastro incompleto continua aparecendo.
 */
export class PedidosFonte implements Fonte {
  readonly id = 'pedidos';
  readonly label = 'Pedidos de venda';
  readonly modo = 'pesquisa' as const;
  private readonly sql: string;
  private readonly sqlExiste: string;
  private readonly sqlDetalhes: {
    cabecalho: string;
    itens: string;
    romaneios: string;
    descontos: string;
  };

  constructor(
    private readonly db: MysqlService,
    timeoutMs: number,
  ) {
    const hint = `/*+ MAX_EXECUTION_TIME(${Math.floor(timeoutMs)}) */`;
    this.sqlDetalhes = {
      cabecalho: sqlCabecalho(hint),
      itens: sqlItens(hint),
      romaneios: sqlRomaneios(hint),
      descontos: sqlDescontos(hint),
    };
    this.sqlExiste = `SELECT ${hint} 1 AS existe FROM ve_pedidos WHERE idPedido = ? LIMIT 1`;
    this.sql = `SELECT ${hint}
        p.idPedido AS value,
        COALESCE(NULLIF(TRIM(c.nome_fantasia), ''), c.nome) AS cliente,
        COALESCE(NULLIF(TRIM(e.nomeFantasia), ''), e.nome) AS empresa,
        -- O ERP grava "sem data" como 0000-00-00: vira NULL em vez de "00/00/0000".
        IF(p.dataSaida > '1000-01-01', DATE_FORMAT(p.dataSaida, '%d/%m/%Y'), NULL) AS data_saida,
        -- Coluna NOT NULL: "não cancelado" é 0000-00-00 00:00:00; só data real conta.
        p.datahoraCancelamento > '1000-01-01' AS cancelado
      FROM ve_pedidos AS p
      LEFT JOIN clientes AS c ON c.id = p.idCliente
      LEFT JOIN empresas AS e ON e.id = p.idEmpresa
      WHERE p.idPedido = ?
      LIMIT 1`;
  }

  /** Texto que não é um número de pedido não vai ao banco: devolve "nenhum resultado". */
  async pesquisar(q: string): Promise<ItemFonte[]> {
    const item = await this.buscar(q);
    return item ? [item] : [];
  }

  resolver(value: string): Promise<ItemFonte | null> {
    return this.buscar(value);
  }

  /**
   * Cabeçalho primeiro (pedido inexistente para aí); itens, romaneios e descontos em seguida,
   * juntos — cada um pela chave do pedido.
   */
  async detalhar(value: string): Promise<DetalhesItem | null> {
    const id = numeroPedido(value);
    if (id === null) {
      return null;
    }
    const [cabecalho] = await this.db.consultar<LinhaCabecalho>(this.sqlDetalhes.cabecalho, [id]);
    if (!cabecalho) {
      return null;
    }
    const [itens, romaneios, descontos] = await Promise.all([
      this.db.consultar<LinhaItem>(this.sqlDetalhes.itens, [id]),
      this.db.consultar<LinhaRomaneio>(this.sqlDetalhes.romaneios, [id]),
      this.db.consultar<LinhaDesconto>(this.sqlDetalhes.descontos, [id]),
    ]);
    return montarDetalhes(cabecalho, itens, romaneios, descontos);
  }

  tabelas(): DefinicaoTabela[] {
    return [TABELA_ITENS];
  }

  /**
   * Itens do pedido como linhas tipadas. Existência do pedido e itens em paralelo, cada um pela
   * chave: pedido inexistente → `null`; pedido sem itens → `linhas: []`.
   */
  async consultarTabela(
    tabela: string,
    parametros: Record<string, string>,
  ): Promise<ResultadoTabela | null> {
    if (tabela !== TABELA_ITENS.id) {
      throw new Error(`Tabela "${tabela}" não existe na lista de pedidos.`);
    }
    const id = numeroPedido(parametros.pedidoId ?? '');
    if (id === null) {
      return null;
    }
    const [existe, itens] = await Promise.all([
      this.db.consultar<RowDataPacket>(this.sqlExiste, [id]),
      this.db.consultar<LinhaItem>(this.sqlDetalhes.itens, [id]),
    ]);
    return existe.length > 0 ? montarResultado(TABELA_ITENS, itens) : null;
  }

  private async buscar(texto: string): Promise<ItemFonte | null> {
    const id = numeroPedido(texto);
    if (id === null) {
      return null;
    }
    const rows = await this.db.consultar<LinhaPedido>(this.sql, [id]);
    return rows.length > 0 ? paraItem(rows[0]) : null;
  }
}

/** Texto que não é um número de pedido não vai ao banco. */
function numeroPedido(texto: string): number | null {
  const numero = texto.trim();
  if (!/^\d{1,10}$/.test(numero) || Number(numero) > MAX_ID_PEDIDO) {
    return null;
  }
  return Number(numero);
}

/** "Pedido 123 — Cliente — Empresa — saída 20/06/2026 — CANCELADO" (partes vazias somem). */
function paraItem(row: LinhaPedido): ItemFonte {
  const partes = [
    `Pedido ${row.value}`,
    row.cliente?.trim(),
    row.empresa?.trim(),
    row.data_saida ? `saída ${row.data_saida}` : null,
    Number(row.cancelado) === 1 ? 'CANCELADO' : null,
  ].filter((parte): parte is string => !!parte);
  return { value: String(row.value), label: partes.join(' — ') };
}
