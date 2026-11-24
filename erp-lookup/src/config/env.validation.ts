import { IsBooleanString, IsNumberString, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Tudo opcional de propósito: sem banco configurado a API sobe mesmo assim, responde
 * `db: "nao_configurado"` no /health e 503 nas consultas. Assim o `docker compose up` do resto
 * do Tijuca nunca quebra (nem o container fica reiniciando) antes de o MySQL do ERP estar pronto.
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  /** Sem token a API recusa toda consulta: nunca fica aberta por esquecimento. */
  @IsOptional()
  @IsString()
  @MinLength(32)
  LOOKUP_API_TOKEN?: string;

  @IsOptional()
  @IsString()
  ERP_DB_HOST?: string;

  @IsOptional()
  @IsNumberString()
  ERP_DB_PORT?: string;

  @IsOptional()
  @IsString()
  ERP_DB_NAME?: string;

  @IsOptional()
  @IsString()
  ERP_DB_USER?: string;

  @IsOptional()
  @IsString()
  ERP_DB_PASSWORD?: string;

  @IsOptional()
  @IsNumberString()
  ERP_DB_CONNECTION_LIMIT?: string;

  @IsOptional()
  @IsNumberString()
  ERP_DB_QUERY_TIMEOUT_MS?: string;

  /** Só desenvolvimento: liga a lista "exemplo", que lê a view criada por dev/seed.sql. */
  @IsOptional()
  @IsBooleanString()
  FONTE_EXEMPLO_HABILITADA?: string;
}
