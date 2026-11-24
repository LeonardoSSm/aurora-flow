import type { ConfigService } from '@nestjs/config';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface ConfigBanco {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionLimit: number;
}

export interface AppConfig {
  porta: number;
  /** `undefined` = nenhuma consulta é autorizada. */
  token?: string;
  /** `undefined` = banco não configurado: consultas respondem 503. */
  db?: ConfigBanco;
  queryTimeoutMs: number;
  fonteExemploHabilitada: boolean;
}

export function lerConfig(config: ConfigService): AppConfig {
  // Vazio vale como ausente: o docker-compose repassa variável não definida como "".
  const texto = (chave: string): string | undefined => {
    const valor = config.get<string>(chave)?.trim();
    if (!valor) return undefined;
    return valor;
  };
  const numero = (chave: string, padrao: number): number => {
    const valor = texto(chave);
    return valor === undefined ? padrao : Number(valor);
  };

  const host = texto('ERP_DB_HOST');
  const database = texto('ERP_DB_NAME');
  const user = texto('ERP_DB_USER');

  return {
    porta: numero('PORT', 3100),
    token: texto('LOOKUP_API_TOKEN'),
    db:
      host && database && user
        ? {
            host,
            port: numero('ERP_DB_PORT', 3306),
            database,
            user,
            password: config.get<string>('ERP_DB_PASSWORD') ?? '',
            connectionLimit: numero('ERP_DB_CONNECTION_LIMIT', 10),
          }
        : undefined,
    queryTimeoutMs: numero('ERP_DB_QUERY_TIMEOUT_MS', 5000),
    fonteExemploHabilitada: texto('FONTE_EXEMPLO_HABILITADA') === 'true',
  };
}
