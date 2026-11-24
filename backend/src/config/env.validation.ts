import {
  IsBooleanString,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsNumberString()
  PORT!: string;

  @IsString()
  API_PREFIX!: string;

  @IsString()
  DB_HOST!: string;

  @IsNumberString()
  DB_PORT!: string;

  @IsString()
  DB_USER!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

  @IsBooleanString()
  DB_SYNC!: string;

  @IsOptional()
  @IsNumberString()
  DB_SLOW_QUERY_THRESHOLD_MS?: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  /** Chave que a LOPS IA envia (X-API-Key) nas rotas /ai. Sem ela, a integração fica desligada. */
  @IsOptional()
  @IsString()
  LOPS_AI_INBOUND_API_KEY?: string;

  /** Validade do token de sessão da LOPS IA, em minutos (padrão 480, máx. 1440). */
  @IsOptional()
  @IsString()
  LOPS_AI_SESSION_TTL_MINUTES?: string;

  /** IPs da LOPS IA, separados por vírgula. Vazio = qualquer origem. */
  @IsOptional()
  @IsString()
  LOPS_AI_ALLOWED_IPS?: string;

  // Required when GOOGLE_OAUTH_CLIENT_ID is set — must be a non-empty domain string
  @ValidateIf((o: EnvironmentVariables) => Boolean(o.GOOGLE_OAUTH_CLIENT_ID))
  @IsString()
  GOOGLE_WORKSPACE_DOMAIN?: string;

  @IsOptional()
  @IsString()
  GOOGLE_OAUTH_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_OAUTH_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_OAUTH_CALLBACK_URL?: string;

  // Required when GOOGLE_OAUTH_CLIENT_ID is set; min 44 chars = base64 of ≥32 bytes
  @ValidateIf((o: EnvironmentVariables) => Boolean(o.GOOGLE_OAUTH_CLIENT_ID))
  @IsString()
  @MinLength(44)
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  TURNSTILE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  TURNSTILE_VERIFY_URL?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsNumberString()
  SMTP_PORT?: string;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM?: string;

  /** Validade (em horas) do link de aprovação enviado a aprovadores externos. Padrão 168 (7 dias). */
  @IsOptional()
  @IsNumberString()
  APPROVAL_EXTERNAL_LINK_TTL_HOURS?: string;

  @IsOptional()
  @IsBooleanString()
  RABBITMQ_ENABLED?: string;

  @IsOptional()
  @IsString()
  RABBITMQ_URL?: string;

  @IsOptional()
  @IsString()
  RABBITMQ_FLOW_SUBMISSION_QUEUE?: string;

  @IsOptional()
  @IsNumberString()
  RABBITMQ_PREFETCH?: string;

  @IsOptional()
  @IsString()
  METRICS_SECRET_TOKEN?: string;

  @IsOptional()
  @IsString()
  RABBITMQ_MANAGEMENT_URL?: string;

  @IsOptional()
  @IsString()
  RABBITMQ_USER?: string;

  @IsOptional()
  @IsString()
  RABBITMQ_PASSWORD?: string;

  /** Mesmo nome do .env da raiz (docker-compose); o backend usa RABBITMQ_PASSWORD e cai neste se faltar. */
  @IsOptional()
  @IsString()
  RABBITMQ_PASS?: string;

  // Mapa de serviços (Admin): endereços internos checados por GET /admin/service-map/status.
  // Sem valor, valem os da aurora-flow-network do docker-compose.
  @IsOptional()
  @IsString()
  SERVICE_MAP_RABBITMQ_URL?: string;

  @IsOptional()
  @IsString()
  SERVICE_MAP_EVOLUTION_URL?: string;

  @IsOptional()
  @IsString()
  SERVICE_MAP_ERP_LOOKUP_URL?: string;

  @IsOptional()
  @IsString()
  SERVICE_MAP_PROMETHEUS_URL?: string;

  @IsOptional()
  @IsString()
  SERVICE_MAP_GRAFANA_URL?: string;

  @IsOptional()
  @IsString()
  SERVICE_MAP_PGADMIN_URL?: string;

  @IsOptional()
  @IsString()
  SERVICE_MAP_ERP_MYSQL_DEV_ADDR?: string;

  @IsOptional()
  @IsNumberString()
  SERVICE_MAP_RABBIT_QUEUE_WARN?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_PROVIDER?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_EVOLUTION_BASE_URL?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_EVOLUTION_API_KEY?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_EVOLUTION_INSTANCE?: string;

  @IsOptional()
  @IsNumberString()
  WHATSAPP_TIMEOUT_MS?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_FROM_NUMBER?: string;

  @IsOptional()
  @IsString()
  ALLOWED_ERP_HOSTS?: string;



  @IsOptional()
  @IsBooleanString()
  NOTIFICATIONS_WORKER_ENABLED?: string;

  @IsOptional()
  @IsBooleanString()
  NOTIFICATIONS_ALLOW_MOCK_PROVIDERS?: string;

  /** Atributo `secure` do cookie de refresh. Ausente = só em produção. Ver refresh-cookie.helper.ts. */
  @IsOptional()
  @IsBooleanString()
  AUTH_COOKIE_SECURE?: string;

  /** Campo "Tabela dinâmica do ERP" (`erp_table`). Desligado por padrão; ver Docs/campo_tabela_dinamica_erp_implantacao.md §15. */
  @IsOptional()
  @IsBooleanString()
  ERP_TABLE_ENABLED?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_MAX_RECIPIENTS_PER_NODE?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_MAX_RECIPIENTS_PER_FLOW_PER_HOUR?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_RETENTION_DAYS?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_SEND_TIMEOUT_MS?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_STALE_PROCESSING_MS?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_DISPATCH_CONCURRENCY?: string;

  @IsOptional()
  @IsNumberString()
  NOTIFICATIONS_DEFAULT_COUNTRY_CODE?: string;
}
