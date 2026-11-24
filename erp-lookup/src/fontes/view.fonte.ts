import type { RowDataPacket } from 'mysql2/promise';
import type { MysqlService } from '../db/mysql.service';
import type { Fonte, ItemFonte, ModoFonte } from './fonte.types';
import { ESCAPE_LIKE, padraoContem } from './like';

const NOME_VIEW = /^[A-Za-z0-9_]+$/;

export interface ConfigViewFonte {
  id: string;
  label: string;
  modo: ModoFonte;
  /** View no banco de ERP_DB_NAME com as colunas `value`, `label` e `busca`. */
  view: string;
}

type LinhaItem = RowDataPacket & { value: unknown; label: unknown };

/**
 * Lista servida por uma view com as colunas `value`, `label` e `busca`
 * (ver Docs/campo_lista_erp_plano.md, Fase 0). As regras do ERP — só ativos, empresa etc. —
 * ficam na view; aqui só se pesquisa e se resolve um código.
 */
export class ViewFonte implements Fonte {
  readonly id: string;
  readonly label: string;
  readonly modo: ModoFonte;
  private readonly tabela: string;
  private readonly hint: string;

  constructor(
    private readonly db: MysqlService,
    config: ConfigViewFonte,
    timeoutMs: number,
  ) {
    if (!NOME_VIEW.test(config.view)) {
      throw new Error(`Nome de view inválido na lista "${config.id}": ${config.view}`);
    }
    this.id = config.id;
    this.label = config.label;
    this.modo = config.modo;
    this.tabela = `\`${config.view}\``;
    // O MySQL corta a consulta no servidor; o timeout do mysql2 corta do lado de cá.
    this.hint = `/*+ MAX_EXECUTION_TIME(${Math.floor(timeoutMs)}) */`;
  }

  async pesquisar(q: string, limit: number): Promise<ItemFonte[]> {
    // `LIMIT ?` em prepared statement falha no MySQL 8.0.22+ com número; como o limite é
    // um inteiro validado aqui, vai direto no SQL.
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Limite inválido: ${limit}`);
    }
    const filtro = q ? `WHERE busca LIKE ? ESCAPE '${ESCAPE_LIKE}'` : '';
    const sql = `SELECT ${this.hint} value, label FROM ${this.tabela} ${filtro} ORDER BY label LIMIT ${limit}`;
    const rows = await this.db.consultar<LinhaItem>(sql, q ? [padraoContem(q)] : []);
    return rows.map(paraItem);
  }

  async resolver(value: string): Promise<ItemFonte | null> {
    const sql = `SELECT ${this.hint} value, label FROM ${this.tabela} WHERE value = ? LIMIT 1`;
    const rows = await this.db.consultar<LinhaItem>(sql, [value]);
    return rows.length > 0 ? paraItem(rows[0]) : null;
  }
}

/** A view pode devolver código numérico; o contrato é sempre texto. */
function paraItem(row: LinhaItem): ItemFonte {
  return { value: String(row.value), label: String(row.label) };
}
