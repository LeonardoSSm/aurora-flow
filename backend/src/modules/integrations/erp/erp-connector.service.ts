import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { type Method } from 'axios';
import { In, LessThan, LessThanOrEqual, QueryFailedError, Repository } from 'typeorm';
import { TokenCipherService } from '../../../common/crypto/token-cipher.service';
import { ErpConnectorEntity } from '../../../database/entities/erp-connector.entity';
import { ErpOperationLogEntity } from '../../../database/entities/erp-operation-log.entity';
import { ErpOperationTemplateEntity } from '../../../database/entities/erp-operation-template.entity';
import { SolicitationEntity } from '../../../database/entities/solicitation.entity';
import { MetricsService } from '../../observability/metrics.service';
import { RabbitMqService } from '../../queue/rabbitmq.service';
import type { FlowExecutionContext } from '../../flows/types/flow.types';
import type { ErpAuthType } from './erp-auth.types';
import { ErpAuthFailedEvent } from './erp-auth-failed.event';
import type { ErpHealthResult } from './erp-health.types';
import { ErpTokenRefreshService } from './erp-token-refresh.service';
import { validateInternalErpUrl } from './erp-url-guard';
import { ERP_RETRY_QUEUE } from './erp.queue';
import type {
  CreateErpConnectorDto,
  CreateErpTemplateDto,
  QueryErpLogsDto,
  UpdateErpConnectorDto,
  UpdateErpTemplateDto,
} from './erp-admin.dto';

export type { ErpHealthResult };

type MaskedConnector = Omit<ErpConnectorEntity, 'bearerToken' | 'refreshCredentials'> & {
  bearerToken: '***';
  refreshCredentials: '***' | null;
};

const BACKOFF_MS = [30_000, 5 * 60_000, 30 * 60_000] as const;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_BATCH = 20;
const MAX_RESPONSE_BYTES = 5 * 1024;
const DEFAULT_LOG_RETENTION_DAYS = 90;

@Injectable()
export class ErpConnectorService {
  private readonly logger = new Logger(ErpConnectorService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ErpConnectorEntity)
    private readonly connectorsRepo: Repository<ErpConnectorEntity>,
    @InjectRepository(ErpOperationTemplateEntity)
    private readonly templatesRepo: Repository<ErpOperationTemplateEntity>,
    @InjectRepository(ErpOperationLogEntity)
    private readonly logsRepo: Repository<ErpOperationLogEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    private readonly tokenCipher: TokenCipherService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
    private readonly tokenRefreshService: ErpTokenRefreshService,
  ) {}

  /**
   * Rejects URLs that resolve to internet-facing hosts.
   * Accepts: private IPs (10.x, 172.16-31.x, 192.168.x), localhost,
   * hostnames without a TLD, and domains listed in ALLOWED_ERP_HOSTS.
   */
  validateInternalUrl(url: string): void {
    validateInternalErpUrl(url, this.getAllowedHosts());
  }

  private getAllowedHosts(): string[] {
    return (this.configService.get<string>('ALLOWED_ERP_HOSTS', '') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
  }

  decryptToken(connector: ErpConnectorEntity): string {
    return this.tokenCipher.decrypt(connector.bearerToken);
  }

  async executeOperation(
    templateId: string,
    context: FlowExecutionContext,
  ): Promise<ErpOperationLogEntity> {
    const template = await this.templatesRepo.findOne({
      where: { id: templateId },
      relations: ['connector'],
    });
    if (!template) throw new NotFoundException(`Template ERP "${templateId}" não encontrado.`);

    const connector = template.connector;
    const requestUrl = `${connector.baseUrl.replace(/\/$/, '')}${template.endpointPath}`;
    this.validateInternalUrl(requestUrl);

    const token = await this.getValidToken(connector);
    const interpolatedBody = template.bodyTemplate
      ? this.interpolate(template.bodyTemplate, context)
      : null;

    const log = this.logsRepo.create({
      templateId: template.id,
      connectorId: connector.id,
      solicitationId: context.solicitation?.id ?? null,
      flowExecutionId: context.flowExecutionId ?? null,
      status: 'pending',
      requestUrl,
      requestBody: interpolatedBody,
      responseStatus: null,
      responseBody: null,
      errorMessage: null,
      attemptCount: 0,
      nextAttemptAt: null,
      durationMs: null,
    });
    await this.logsRepo.save(log);

    return this.performRequest(log, connector, template, token, interpolatedBody);
  }

  async retryOperation(logId: string): Promise<ErpOperationLogEntity> {
    const log = await this.logsRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException(`Log ERP "${logId}" não encontrado.`);
    if (!['failed', 'retrying'].includes(log.status)) {
      throw new BadRequestException(
        `Log ERP "${logId}" não pode ser reexecutado no status "${log.status}".`,
      );
    }

    const connector = await this.connectorsRepo.findOne({ where: { id: log.connectorId } });
    if (!connector) throw new NotFoundException(`Conector ERP "${log.connectorId}" não encontrado.`);

    let template: ErpOperationTemplateEntity | null = null;
    if (log.templateId) {
      template = await this.templatesRepo.findOne({ where: { id: log.templateId } });
    }

    this.validateInternalUrl(log.requestUrl);
    const token = await this.getValidToken(connector);

    return this.performRequest(log, connector, template, token, log.requestBody);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkErpRetries(): Promise<void> {
    const logs = await this.logsRepo.find({
      where: {
        status: 'retrying',
        nextAttemptAt: LessThanOrEqual(new Date()),
      },
      order: { nextAttemptAt: 'ASC', createdAt: 'ASC' },
      take: MAX_RETRY_BATCH,
    });

    for (const log of logs) {
      try {
        await this.rabbitMqService.publishJson(ERP_RETRY_QUEUE, { logId: log.id });
      } catch (error) {
        this.logger.warn(
          { logId: log.id, error: error instanceof Error ? error.message : String(error) },
          'Falha ao enfileirar retry ERP',
        );
      }
    }

    if (logs.length > 0) {
      this.logger.log(`${logs.length} retries ERP enfileirados.`);
    }
  }

  /**
   * Prunes finished (success/failed) operation logs older than the retention
   * window, so erp_operation_logs — which stores request/response bodies —
   * doesn't grow unbounded. Logs still pending/retrying are never touched.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldLogs(): Promise<void> {
    const retentionDays = Number(
      this.configService.get<string>(
        'ERP_LOG_RETENTION_DAYS',
        String(DEFAULT_LOG_RETENTION_DAYS),
      ),
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.logsRepo.delete({
      status: In(['success', 'failed']),
      createdAt: LessThan(cutoff),
    });

    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`${deleted} log(s) ERP com mais de ${retentionDays} dias removido(s).`);
    }
  }

  private async performRequest(
    log: ErpOperationLogEntity,
    connector: ErpConnectorEntity,
    template: ErpOperationTemplateEntity | null,
    token: string,
    body: string | null,
  ): Promise<ErpOperationLogEntity> {
    const startedAt = Date.now();
    log.attemptCount = (log.attemptCount ?? 0) + 1;
    log.status = 'pending';

    const method = ((template?.method ?? 'POST').toUpperCase()) as Method;
    const extraHeaders = (connector.defaultHeaders as Record<string, string> | null) ?? {};

    try {
      const response = await axios.request({
        url: log.requestUrl,
        method,
        // Authorization is intentionally excluded from requestBody / logs
        headers: { ...extraHeaders, Authorization: `Bearer ${token}` },
        data: method !== 'GET' && body ? body : undefined,
        timeout: connector.timeoutMs,
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
        validateStatus: () => true,
      });

      log.responseStatus = response.status;
      log.responseBody = this.truncateResponse(
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      );
      log.durationMs = Date.now() - startedAt;
      log.errorMessage = null;

      if (response.status === 401) {
        log.status = 'failed';
        log.nextAttemptAt = null;
        log.errorMessage = 'Token expirado ou inválido (401). Atualize as credenciais do conector.';
        this.metricsService.recordErpOperation(connector.name, 'auth_error', log.durationMs);
        this.metricsService.incrementErpAuthFailures(connector.name);
        this.eventEmitter.emit('erp.auth.failed', new ErpAuthFailedEvent(connector.id, connector.name));
        return this.logsRepo.save(log);
      }

      const successCodes = template?.successStatusCodes ?? [200, 201];
      if (successCodes.includes(response.status)) {
        log.status = 'success';
        log.nextAttemptAt = null;
        this.metricsService.recordErpOperation(connector.name, 'success', log.durationMs);

        if (template?.saveResponseField && log.solicitationId) {
          await this.saveErpResponseField(
            log.solicitationId,
            template.saveResponseField,
            response.data,
          );
        }
      } else {
        this.applyFailure(log, `ERP respondeu ${response.status}`);
        this.metricsService.recordErpOperation(connector.name, 'failed', log.durationMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.durationMs = Date.now() - startedAt;
      log.responseStatus = axios.isAxiosError(error) ? (error.response?.status ?? null) : null;
      log.errorMessage = message;

      const isTimeout = axios.isAxiosError(error) && error.code === 'ECONNABORTED';
      this.applyFailure(log, message);
      this.metricsService.recordErpOperation(connector.name, isTimeout ? 'timeout' : 'failed', log.durationMs ?? 0);
    }

    // Retries são enfileirados exclusivamente pelo cron checkErpRetries, que
    // respeita nextAttemptAt — nunca republicar aqui, para não pular o backoff.
    return this.logsRepo.save(log);
  }

  private applyFailure(log: ErpOperationLogEntity, errorMessage: string): void {
    log.errorMessage = errorMessage;
    if (log.attemptCount < MAX_ATTEMPTS) {
      log.status = 'retrying';
      log.nextAttemptAt = new Date(Date.now() + this.getBackoffMs(log.attemptCount));
    } else {
      log.status = 'failed';
      log.nextAttemptAt = null;
    }
  }

  private getBackoffMs(attemptCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(attemptCount - 1, 0), BACKOFF_MS.length - 1)];
  }

  /** Mirrors FlowExecutionEngine.interpolate — resolves {{variable}} placeholders */
  private interpolate(template: string, ctx: FlowExecutionContext): string {
    const sol = ctx.solicitation;
    const requester =
      sol?.submission?.responderName ??
      sol?.submission?.responderEmail ??
      sol?.createdByUser?.fullName ??
      null;
    const requesterEmail =
      sol?.submission?.responderEmail ?? sol?.createdByUser?.email ?? null;

    return template
      .replace(/\{\{responder_name\}\}/g, ctx.submission?.responderName ?? '')
      .replace(/\{\{responder_email\}\}/g, ctx.submission?.responderEmail ?? '')
      .replace(/\{\{form_name\}\}/g, ctx.form?.name ?? '')
      .replace(/\{\{solicitation_number\}\}/g, sol?.id ?? '')
      .replace(/\{\{solicitation_title\}\}/g, sol?.title ?? '')
      .replace(/\{\{solicitation_status\}\}/g, sol?.status ?? '')
      .replace(/\{\{solicitation_priority\}\}/g, sol?.priority ?? '')
      .replace(/\{\{solicitation_requester_name\}\}/g, requester ?? '')
      .replace(/\{\{solicitation_requester_email\}\}/g, requesterEmail ?? '')
      .replace(/\{\{solicitation_responsible_name\}\}/g, sol?.assignee?.fullName ?? '')
      .replace(/\{\{(\w+)\}\}/g, (_, code: string) =>
        String(ctx.fields?.[code] ?? ctx.metadata?.[code] ?? ''),
      );
  }

  private truncateResponse(text: string | null | undefined): string | null {
    if (text == null) return null;
    const buf = Buffer.from(text, 'utf8');
    return buf.byteLength <= MAX_RESPONSE_BYTES
      ? text
      : buf.subarray(0, MAX_RESPONSE_BYTES).toString('utf8');
  }

  private async saveErpResponseField(
    solicitationId: string,
    fieldKey: string,
    rawData: unknown,
  ): Promise<void> {
    try {
      let parsed: unknown = rawData;
      if (typeof rawData === 'string') {
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = rawData;
        }
      }

      const extracted =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)[fieldKey]
          : parsed;

      const sol = await this.solicitationsRepo.findOne({ where: { id: solicitationId } });
      if (!sol) return;

      const currentRefs = (sol.externalRefs ?? {}) as Record<string, unknown>;
      const currentErp = (currentRefs['erp'] ?? {}) as Record<string, unknown>;

      await this.solicitationsRepo.update(solicitationId, {
        externalRefs: {
          ...currentRefs,
          erp: { ...currentErp, [fieldKey]: extracted },
        },
      });
    } catch (error) {
      this.logger.warn(
        { solicitationId, fieldKey, error: error instanceof Error ? error.message : String(error) },
        'Falha ao salvar campo da resposta ERP em externalRefs',
      );
    }
  }

  // ─── Token management ────────────────────────────────────────────────────

  /** Público para o ErpLookupService, que chama a API erp-lookup com o mesmo conector. */
  async getValidToken(connector: ErpConnectorEntity): Promise<string> {
    const authType: ErpAuthType = connector.authType ?? 'bearer_static';

    if (authType === 'bearer_static') {
      return this.tokenCipher.decrypt(connector.bearerToken);
    }

    if (!this.needsTokenRefresh(connector)) {
      return this.tokenCipher.decrypt(connector.bearerToken);
    }

    try {
      const { token, expiresAt } = await this.tokenRefreshService.refreshToken(connector);
      const encrypted = this.tokenCipher.encrypt(token);
      await this.connectorsRepo.update(connector.id, { bearerToken: encrypted, tokenExpiresAt: expiresAt });
      connector.bearerToken = encrypted;
      connector.tokenExpiresAt = expiresAt;
      return token;
    } catch (err) {
      throw new Error(
        `Falha ao renovar token do ERP. Verifique as credenciais. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private needsTokenRefresh(connector: ErpConnectorEntity): boolean {
    const MARGIN_MS = 5 * 60 * 1000;
    const DEFAULT_VALIDITY_MS = 50 * 60 * 1000;
    const now = Date.now();

    if (connector.tokenExpiresAt) {
      return connector.tokenExpiresAt.getTime() <= now + MARGIN_MS;
    }

    // basic_login (no expiry): treat updatedAt as last-refresh timestamp
    const lastUpdate = connector.updatedAt?.getTime() ?? 0;
    return now - lastUpdate >= DEFAULT_VALIDITY_MS;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async refreshExpiringTokens(): Promise<void> {
    const threshold = new Date(Date.now() + 30 * 60 * 1000);

    const connectors = await this.connectorsRepo
      .createQueryBuilder('c')
      .where('c.is_active = :active', { active: true })
      .andWhere('c.auth_type != :staticType', { staticType: 'bearer_static' })
      .andWhere(
        '(c.token_expires_at IS NULL OR c.token_expires_at < :threshold)',
        { threshold },
      )
      .getMany();

    if (connectors.length === 0) return;

    this.logger.log(`Renovação proativa de tokens: ${connectors.length} conector(es).`);

    await Promise.allSettled(
      connectors.map(async (connector) => {
        try {
          const { token, expiresAt } = await this.tokenRefreshService.refreshToken(connector);
          const encrypted = this.tokenCipher.encrypt(token);
          await this.connectorsRepo.update(connector.id, {
            bearerToken: encrypted,
            tokenExpiresAt: expiresAt,
          });
          this.logger.log(`Token renovado proativamente para "${connector.name}".`);
        } catch (err) {
          this.logger.error(
            { connectorId: connector.id, error: err instanceof Error ? err.message : String(err) },
            `Falha na renovação proativa de token para "${connector.name}"`,
          );
          this.eventEmitter.emit(
            'erp.auth.failed',
            new ErpAuthFailedEvent(connector.id, connector.name),
          );
        }
      }),
    );
  }

  // ─── Health check ────────────────────────────────────────────────────────

  async checkHealth(connectorId: string): Promise<ErpHealthResult> {
    const connector = await this.connectorsRepo.findOne({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Conector ERP "${connectorId}" não encontrado.`);

    const result = await this.probeConnectorHealth(connector);
    await this.connectorsRepo.update(connectorId, {
      lastHealthCheck: result,
      lastHealthCheckedAt: result.checkedAt,
    });
    return result;
  }

  async getAllConnectorsHealthCached(): Promise<ErpHealthResult[]> {
    const connectors = await this.connectorsRepo.find({ where: { isActive: true } });
    return connectors.map((c) => c.lastHealthCheck ?? {
      connectorId: c.id,
      connectorName: c.name,
      reachable: false,
      authValid: null,
      statusCode: null,
      responseTimeMs: 0,
      checkedAt: c.lastHealthCheckedAt ?? c.createdAt,
      error: 'Health check ainda não executado.',
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkAllConnectorsHealth(): Promise<void> {
    const connectors = await this.connectorsRepo.find({ where: { isActive: true } });
    if (connectors.length === 0) return;

    await Promise.allSettled(
      connectors.map(async (connector) => {
        try {
          const result = await this.probeConnectorHealth(connector);
          await this.connectorsRepo.update(connector.id, {
            lastHealthCheck: result,
            lastHealthCheckedAt: result.checkedAt,
          });
          const isUp = result.reachable && result.authValid === true;
          this.metricsService.setErpConnectorUp(connector.id, connector.name, isUp);
        } catch (err) {
          this.logger.warn(
            { connectorId: connector.id, error: err instanceof Error ? err.message : String(err) },
            'Falha ao verificar health do conector ERP',
          );
        }
      }),
    );
  }

  private async probeConnectorHealth(connector: ErpConnectorEntity): Promise<ErpHealthResult> {
    const startedAt = Date.now();
    const base: Omit<ErpHealthResult, 'reachable' | 'authValid' | 'statusCode' | 'responseTimeMs' | 'checkedAt' | 'error'> = {
      connectorId: connector.id,
      connectorName: connector.name,
    };

    try {
      this.validateInternalUrl(connector.baseUrl);
      const token = await this.getValidToken(connector);
      const response = await axios.get(connector.baseUrl, {
        timeout: 5000,
        validateStatus: () => true,
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
        // Authorization intentionally not logged
        headers: { Authorization: `Bearer ${token}` },
      });

      const responseTimeMs = Date.now() - startedAt;
      const statusCode = response.status;

      if (statusCode === 401) {
        return { ...base, reachable: true, authValid: false, statusCode, responseTimeMs, checkedAt: new Date() };
      }
      if (statusCode >= 200 && statusCode < 300) {
        return { ...base, reachable: true, authValid: true, statusCode, responseTimeMs, checkedAt: new Date() };
      }
      return { ...base, reachable: true, authValid: null, statusCode, responseTimeMs, checkedAt: new Date() };
    } catch (err) {
      const responseTimeMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      return { ...base, reachable: false, authValid: null, statusCode: null, responseTimeMs, checkedAt: new Date(), error: message };
    }
  }

  // ─── Admin CRUD ──────────────────────────────────────────────────────────

  async findAllConnectors(): Promise<MaskedConnector[]> {
    const connectors = await this.connectorsRepo.find({ order: { createdAt: 'DESC' } });
    return connectors.map((c) => this.maskConnector(c));
  }

  async createConnector(dto: CreateErpConnectorDto, actorId: string): Promise<MaskedConnector> {
    this.validateInternalUrl(dto.baseUrl);

    const authType: ErpAuthType = (dto.authType as ErpAuthType) ?? 'bearer_static';

    if (authType === 'bearer_static' && !dto.bearerToken) {
      throw new BadRequestException('bearerToken é obrigatório para o tipo bearer_static.');
    }

    const encryptedToken = this.tokenCipher.encrypt(dto.bearerToken ?? '');
    const encryptedCreds = dto.refreshCredentials
      ? this.tokenCipher.encrypt(JSON.stringify(dto.refreshCredentials))
      : null;

    // For dynamic auth without an initial token: epoch forces refresh on first use
    const tokenExpiresAt = authType !== 'bearer_static' && !dto.bearerToken ? new Date(0) : null;

    const connector = this.connectorsRepo.create({
      name: dto.name,
      baseUrl: dto.baseUrl,
      bearerToken: encryptedToken,
      authType,
      refreshCredentials: encryptedCreds,
      tokenExpiresAt,
      defaultHeaders: dto.defaultHeaders ?? null,
      timeoutMs: dto.timeoutMs ?? 15000,
      isActive: true,
      createdBy: actorId,
    });
    const saved = await this.saveConnectorOrThrowFriendly(connector);
    return this.maskConnector(saved);
  }

  async updateConnector(id: string, dto: UpdateErpConnectorDto): Promise<MaskedConnector> {
    const connector = await this.connectorsRepo.findOne({ where: { id } });
    if (!connector) throw new NotFoundException(`Conector ERP "${id}" não encontrado.`);

    if (dto.baseUrl) this.validateInternalUrl(dto.baseUrl);

    if (dto.name !== undefined) connector.name = dto.name;
    if (dto.baseUrl !== undefined) connector.baseUrl = dto.baseUrl;
    if (dto.bearerToken !== undefined && dto.bearerToken.trim() !== '') {
      connector.bearerToken = this.tokenCipher.encrypt(dto.bearerToken);
      connector.tokenExpiresAt = null;
    }
    if (dto.authType !== undefined) connector.authType = dto.authType as ErpAuthType;
    if (dto.refreshCredentials !== undefined && dto.refreshCredentials !== null) {
      // Only overwrite the fields that arrived with a non-empty value;
      // existing fields not included in the payload are preserved.
      const incoming = Object.fromEntries(
        (Object.entries(dto.refreshCredentials) as [string, string | undefined][]).filter(
          (entry): entry is [string, string] =>
            entry[1] !== null && entry[1] !== undefined && entry[1].trim() !== '',
        ),
      );
      if (Object.keys(incoming).length > 0) {
        let existing: Record<string, unknown> = {};
        if (connector.refreshCredentials) {
          try {
            existing = JSON.parse(
              this.tokenCipher.decrypt(connector.refreshCredentials),
            ) as Record<string, unknown>;
          } catch {
            existing = {};
          }
        }
        connector.refreshCredentials = this.tokenCipher.encrypt(
          JSON.stringify({ ...existing, ...incoming }),
        );
      }
    }
    if (dto.defaultHeaders !== undefined) connector.defaultHeaders = dto.defaultHeaders ?? null;
    if (dto.timeoutMs !== undefined) connector.timeoutMs = dto.timeoutMs;

    const saved = await this.saveConnectorOrThrowFriendly(connector);
    // Re-verify connectivity in background — fire-and-forget
    this.checkHealth(id).catch(() => {});
    return this.maskConnector(saved);
  }

  private async saveConnectorOrThrowFriendly(
    connector: ErpConnectorEntity,
  ): Promise<ErpConnectorEntity> {
    try {
      return await this.connectorsRepo.save(connector);
    } catch (error) {
      if (this.isUniqueNameViolation(error)) {
        throw new ConflictException(`Já existe um conector ERP chamado "${connector.name}".`);
      }
      throw error;
    }
  }

  private isUniqueNameViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return driverError?.code === '23505' && driverError.constraint === 'UQ_erp_connectors_name';
  }

  async deactivateConnector(id: string): Promise<void> {
    const connector = await this.connectorsRepo.findOne({ where: { id } });
    if (!connector) throw new NotFoundException(`Conector ERP "${id}" não encontrado.`);
    await this.connectorsRepo.update(id, { isActive: false });
  }

  async deleteConnector(id: string, force = false): Promise<void> {
    const connector = await this.connectorsRepo.findOne({ where: { id } });
    if (!connector) throw new NotFoundException(`Conector ERP "${id}" não encontrado.`);

    const logsCount = await this.logsRepo.count({ where: { connectorId: id } });

    if (logsCount > 0 && !force) {
      throw new ConflictException(
        'Este conector tem histórico de execuções. Use Desativar para preservar o histórico, ou confirme a exclusão forçada.',
      );
    }

    if (force && logsCount > 0) {
      await this.logsRepo.delete({ connectorId: id });
    }

    // Templates são deletados em cascata pela constraint do banco (onDelete: CASCADE)
    await this.connectorsRepo.delete(id);
  }

  async findTemplates(connectorId: string): Promise<ErpOperationTemplateEntity[]> {
    const connector = await this.connectorsRepo.findOne({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Conector ERP "${connectorId}" não encontrado.`);
    return this.templatesRepo.find({ where: { connectorId }, order: { createdAt: 'DESC' } });
  }

  async createTemplate(
    connectorId: string,
    dto: CreateErpTemplateDto,
  ): Promise<ErpOperationTemplateEntity> {
    const connector = await this.connectorsRepo.findOne({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Conector ERP "${connectorId}" não encontrado.`);

    const template = this.templatesRepo.create({
      connectorId,
      name: dto.name,
      description: dto.description ?? null,
      method: dto.method,
      endpointPath: dto.endpointPath,
      bodyTemplate: dto.bodyTemplate ?? null,
      successStatusCodes: dto.successStatusCodes ?? [200, 201],
      saveResponseField: dto.saveResponseField ?? null,
      isActive: true,
    });
    return this.templatesRepo.save(template);
  }

  async updateTemplate(id: string, dto: UpdateErpTemplateDto): Promise<ErpOperationTemplateEntity> {
    const template = await this.templatesRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException(`Template ERP "${id}" não encontrado.`);

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description ?? null;
    if (dto.method !== undefined) template.method = dto.method;
    if (dto.endpointPath !== undefined) template.endpointPath = dto.endpointPath;
    if (dto.bodyTemplate !== undefined) template.bodyTemplate = dto.bodyTemplate ?? null;
    if (dto.successStatusCodes !== undefined) template.successStatusCodes = dto.successStatusCodes ?? [200, 201];
    if (dto.saveResponseField !== undefined) template.saveResponseField = dto.saveResponseField ?? null;

    return this.templatesRepo.save(template);
  }

  async deactivateTemplate(id: string): Promise<void> {
    const template = await this.templatesRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException(`Template ERP "${id}" não encontrado.`);
    await this.templatesRepo.update(id, { isActive: false });
  }

  async testConnection(
    connectorId: string,
  ): Promise<{ reachable: boolean; authValid: boolean | null; statusCode?: number; durationMs: number }> {
    const connector = await this.connectorsRepo.findOne({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Conector ERP "${connectorId}" não encontrado.`);

    this.validateInternalUrl(connector.baseUrl);

    const startedAt = Date.now();
    try {
      // Includes the real Authorization header, same as the periodic health check,
      // so "Testar" actually validates credentials instead of just host reachability.
      const token = await this.getValidToken(connector);
      const response = await axios.get(connector.baseUrl, {
        timeout: 5000,
        validateStatus: () => true,
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
        headers: { Authorization: `Bearer ${token}` },
      });
      const authValid = response.status === 401 ? false : true;
      return {
        reachable: true,
        authValid,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
      };
    } catch {
      return { reachable: false, authValid: null, durationMs: Date.now() - startedAt };
    }
  }

  async findLogs(
    filters: QueryErpLogsDto,
  ): Promise<{ data: Partial<ErpOperationLogEntity>[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, status, connectorId } = filters;

    const qb = this.logsRepo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('log.status = :status', { status });
    if (connectorId) qb.andWhere('log.connectorId = :connectorId', { connectorId });

    const [logs, total] = await qb.getManyAndCount();

    const DISPLAY_LIMIT = 1024;
    const data = logs.map((log) => {
      const { requestBody: _rb, ...rest } = log;
      void _rb;
      let responseBody = rest.responseBody;
      if (responseBody && Buffer.byteLength(responseBody, 'utf8') > DISPLAY_LIMIT) {
        responseBody =
          Buffer.from(responseBody, 'utf8').subarray(0, DISPLAY_LIMIT).toString('utf8') +
          ' [truncated]';
      }
      return { ...rest, responseBody };
    });

    return { data, total, page, limit };
  }

  async manualRetryLog(logId: string): Promise<ErpOperationLogEntity> {
    return this.retryOperation(logId);
  }

  private maskConnector(connector: ErpConnectorEntity): MaskedConnector {
    const { bearerToken: _bt, refreshCredentials: _rc, ...rest } = connector;
    void _bt;
    return {
      ...rest,
      bearerToken: '***',
      refreshCredentials: _rc !== null ? '***' : null,
    } as MaskedConnector;
  }
}
