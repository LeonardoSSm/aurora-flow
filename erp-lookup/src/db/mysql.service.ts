import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export class BancoNaoConfiguradoError extends Error {
  constructor() {
    super('Banco do ERP não configurado (ERP_DB_HOST, ERP_DB_NAME e ERP_DB_USER).');
  }
}

/** Qualquer falha ao consultar: conexão recusada, timeout, view inexistente, sem permissão. */
export class BancoIndisponivelError extends Error {
  constructor(readonly causa: unknown) {
    super('Banco do ERP indisponível.');
  }

  /** Código do driver (ECONNREFUSED, ER_NO_SUCH_TABLE, PROTOCOL_SEQUENCE_TIMEOUT...) para o log. */
  get codigo(): string {
    const code = (this.causa as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : 'DESCONHECIDO';
  }
}

export type ParametroSql = string | number;

const PING_TIMEOUT_MS = 2000;

@Injectable()
export class MysqlService implements OnModuleDestroy {
  private readonly logger = new Logger(MysqlService.name);
  private readonly pool: Pool | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const db = config.db;
    // O pool só abre conexão na primeira consulta: a API sobe mesmo com o MySQL fora.
    this.pool = db
      ? createPool({
          host: db.host,
          port: db.port,
          database: db.database,
          user: db.user,
          password: db.password,
          // Pool pequeno e fila limitada: o banco é do ERP e não pode ser sobrecarregado.
          connectionLimit: db.connectionLimit,
          queueLimit: db.connectionLimit * 5,
          waitForConnections: true,
          connectTimeout: 5000,
          enableKeepAlive: true,
        })
      : null;

    if (!this.pool) {
      this.logger.warn(
        'Banco do ERP não configurado: as consultas vão responder 503 até ERP_DB_HOST, ERP_DB_NAME e ERP_DB_USER serem definidos.',
      );
    }
  }

  get configurado(): boolean {
    return this.pool !== null;
  }

  /** Sempre com parâmetros (`?`): nenhum texto vindo do usuário entra no SQL. */
  async consultar<T extends RowDataPacket>(
    sql: string,
    params: ParametroSql[],
    timeoutMs = this.config.queryTimeoutMs,
  ): Promise<T[]> {
    if (!this.pool) {
      throw new BancoNaoConfiguradoError();
    }
    try {
      const [rows] = await this.pool.execute<T[]>({ sql, timeout: timeoutMs }, params);
      return rows;
    } catch (err) {
      throw new BancoIndisponivelError(err);
    }
  }

  async ping(): Promise<'ok' | 'down' | 'nao_configurado'> {
    if (!this.pool) {
      return 'nao_configurado';
    }
    try {
      await this.consultar('SELECT 1', [], PING_TIMEOUT_MS);
      return 'ok';
    } catch (err) {
      const codigo = err instanceof BancoIndisponivelError ? err.codigo : 'DESCONHECIDO';
      this.logger.warn(`Health: banco do ERP fora (${codigo}).`);
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
