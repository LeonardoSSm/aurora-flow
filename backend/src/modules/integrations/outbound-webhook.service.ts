import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { LessThanOrEqual, type Repository } from 'typeorm';
import {
  WebhookDeliveryEntity,
  WebhookDeliveryStatus,
} from '../../database/entities/webhook-delivery.entity';
import { truncateTextBytes } from '../../database/entities/webhook-entity-helpers';
import { WEBHOOK_SIGNATURE_HEADER } from '../../common/constants/product';
import { HmacService } from '../../common/crypto/hmac.service';
import { assertSafeOutboundUrl } from '../../common/security/outbound-url.guard';
import { MetricsService } from '../observability/metrics.service';

const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_RETRY_BATCH_SIZE = 50;
const BACKOFF_MS = [30_000, 5 * 60_000, 30 * 60_000] as const;
const SIGNATURE_HEADER = WEBHOOK_SIGNATURE_HEADER;
const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'proxy-authorization']);

export type OutboundWebhookMethod = 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';

export interface OutboundWebhookDto {
  url: string;
  method: OutboundWebhookMethod;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown> | unknown[] | null;
  signingSecret?: string;
  maxAttempts?: number;
  flowExecutionId?: string | null;
  connectorId?: string | null;
  timeoutMs?: number;
  deliveryId?: string;
}

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveriesRepo: Repository<WebhookDeliveryEntity>,
    private readonly hmacService: HmacService,
    private readonly metricsService: MetricsService,
  ) {}

  async send(dto: OutboundWebhookDto): Promise<WebhookDeliveryEntity> {
    await assertSafeOutboundUrl(dto.url);
    const rawBody = this.normalizeBody(dto.body);
    const requestHeaders = this.buildRequestHeaders(dto.headers, dto.signingSecret, rawBody ?? '');
    const delivery = dto.deliveryId
      ? await this.prepareExistingDelivery(dto, rawBody, requestHeaders)
      : await this.createDelivery(dto, rawBody, requestHeaders);

    const result = await this.attemptDelivery(delivery, requestHeaders, rawBody, dto.timeoutMs);

    const urlWithoutQuery = dto.url.split('?')[0];
    const logCtx = {
      webhookDeliveryId: result.id,
      url: urlWithoutQuery,
      status: result.status,
      responseStatus: result.responseStatus ?? undefined,
      durationMs: result.duration ?? undefined,
      attemptCount: result.attemptCount,
    };
    if (result.status === WebhookDeliveryStatus.SUCCESS) {
      this.logger.log(logCtx, 'Webhook delivery succeeded');
      this.metricsService.incrementWebhookDeliveries('success');
    } else if (result.status === WebhookDeliveryStatus.RETRYING) {
      this.logger.warn(logCtx, 'Webhook delivery failed or retrying');
      this.metricsService.incrementWebhookDeliveries('retried');
    } else {
      this.logger.warn(logCtx, 'Webhook delivery failed or retrying');
      this.metricsService.incrementWebhookDeliveries('failed');
    }

    return result;
  }

  async retry(deliveryId: string): Promise<WebhookDeliveryEntity> {
    const delivery = await this.findDeliveryOrFail(deliveryId);

    return this.send({
      deliveryId: delivery.id,
      url: delivery.url,
      method: this.normalizeMethod(delivery.method),
      headers: this.headersFromPersisted(delivery.requestHeaders),
      body: delivery.requestBody,
      maxAttempts: delivery.maxAttempts,
      flowExecutionId: delivery.flowExecutionId,
      connectorId: delivery.connectorId,
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryPendingDeliveries(): Promise<void> {
    const deliveries = await this.deliveriesRepo.find({
      where: {
        status: WebhookDeliveryStatus.RETRYING,
        nextAttemptAt: LessThanOrEqual(new Date()),
      },
      order: { nextAttemptAt: 'ASC', createdAt: 'ASC' },
      take: MAX_RETRY_BATCH_SIZE,
    });

    for (const delivery of deliveries) {
      try {
        await this.retry(delivery.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          { webhookDeliveryId: delivery.id, error: message },
          'Webhook delivery retry failed',
        );
      }
    }
  }

  private async createDelivery(
    dto: OutboundWebhookDto,
    rawBody: string | null,
    requestHeaders: Record<string, string>,
  ): Promise<WebhookDeliveryEntity> {
    const delivery = this.deliveriesRepo.create({
      connectorId: dto.connectorId ?? null,
      flowExecutionId: dto.flowExecutionId ?? null,
      url: dto.url,
      method: this.normalizeMethod(dto.method),
      requestHeaders: this.headersForPersistence(requestHeaders),
      requestBody: rawBody,
      status: WebhookDeliveryStatus.PENDING,
      attemptCount: 0,
      maxAttempts: this.normalizeMaxAttempts(dto.maxAttempts),
      nextAttemptAt: null,
      errorMessage: null,
      duration: null,
      responseStatus: null,
      responseBody: null,
    });

    return this.deliveriesRepo.save(delivery);
  }

  private async prepareExistingDelivery(
    dto: OutboundWebhookDto,
    rawBody: string | null,
    requestHeaders: Record<string, string>,
  ): Promise<WebhookDeliveryEntity> {
    if (!dto.deliveryId) {
      throw new Error('deliveryId é obrigatório para reutilizar entrega existente.');
    }

    const delivery = await this.findDeliveryOrFail(dto.deliveryId);
    delivery.url = dto.url;
    delivery.method = this.normalizeMethod(dto.method);
    delivery.connectorId = dto.connectorId ?? delivery.connectorId;
    delivery.flowExecutionId = dto.flowExecutionId ?? delivery.flowExecutionId;
    delivery.requestHeaders = this.headersForPersistence(requestHeaders);
    delivery.requestBody = rawBody;
    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.maxAttempts = this.normalizeMaxAttempts(dto.maxAttempts ?? delivery.maxAttempts);
    delivery.nextAttemptAt = null;
    delivery.errorMessage = null;
    delivery.duration = null;
    delivery.responseStatus = null;
    delivery.responseBody = null;

    return this.deliveriesRepo.save(delivery);
  }

  private async attemptDelivery(
    delivery: WebhookDeliveryEntity,
    requestHeaders: Record<string, string>,
    rawBody: string | null,
    timeoutMs?: number,
  ): Promise<WebhookDeliveryEntity> {
    const startedAt = Date.now();
    delivery.attemptCount = (delivery.attemptCount ?? 0) + 1;

    try {
      const response = await axios.request({
        url: delivery.url,
        method: delivery.method as Method,
        headers: requestHeaders,
        data: delivery.method === 'GET' ? undefined : rawBody,
        timeout: this.getTimeoutMs(timeoutMs),
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
        validateStatus: () => true,
      } satisfies AxiosRequestConfig);

      delivery.responseStatus = response.status;
      delivery.responseBody = truncateTextBytes(this.toResponseText(response.data));
      delivery.duration = Date.now() - startedAt;

      if (response.status >= 200 && response.status < 300) {
        delivery.status = WebhookDeliveryStatus.SUCCESS;
        delivery.errorMessage = null;
        delivery.nextAttemptAt = null;
        return this.deliveriesRepo.save(delivery);
      }

      this.applyFailure(
        delivery,
        `Webhook falhou: ${response.status} ${response.statusText ?? ''}`.trim(),
      );
      return this.deliveriesRepo.save(delivery);
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      delivery.responseStatus = axiosError?.response?.status ?? null;
      delivery.responseBody = truncateTextBytes(this.toResponseText(axiosError?.response?.data));
      delivery.duration = Date.now() - startedAt;
      delivery.errorMessage =
        axiosError?.message ?? (error instanceof Error ? error.message : String(error));
      this.applyFailure(delivery, delivery.errorMessage);
      return this.deliveriesRepo.save(delivery);
    }
  }

  private applyFailure(delivery: WebhookDeliveryEntity, errorMessage: string): void {
    delivery.errorMessage = errorMessage;

    if (delivery.attemptCount < delivery.maxAttempts) {
      delivery.status = WebhookDeliveryStatus.RETRYING;
      delivery.nextAttemptAt = new Date(Date.now() + this.getBackoffMs(delivery.attemptCount));
      return;
    }

    delivery.status = WebhookDeliveryStatus.FAILED;
    delivery.nextAttemptAt = null;
  }

  private buildRequestHeaders(
    headers: Record<string, string> | undefined,
    signingSecret: string | undefined,
    rawBody: string,
  ): Record<string, string> {
    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (value != null) requestHeaders[key] = String(value);
    }

    if (signingSecret) {
      requestHeaders[SIGNATURE_HEADER] = `sha256=${this.hmacService.sign(signingSecret, rawBody)}`;
    }

    return requestHeaders;
  }

  private headersForPersistence(headers: Record<string, string>): Record<string, string> | null {
    const safeHeaders = Object.fromEntries(
      Object.entries(headers).filter(([key]) => !SENSITIVE_HEADER_NAMES.has(key.toLowerCase())),
    );

    return Object.keys(safeHeaders).length > 0 ? safeHeaders : null;
  }

  private headersFromPersisted(headers: Record<string, unknown> | null): Record<string, string> {
    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) || value == null) continue;
      requestHeaders[key] = String(value);
    }
    return requestHeaders;
  }

  private normalizeBody(body: OutboundWebhookDto['body']): string | null {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    return JSON.stringify(body);
  }

  private normalizeMethod(method: string | undefined): OutboundWebhookMethod {
    const normalized = (method ?? 'POST').toUpperCase();
    if (['POST', 'GET', 'PUT', 'PATCH', 'DELETE'].includes(normalized)) {
      return normalized as OutboundWebhookMethod;
    }
    return 'POST';
  }

  private normalizeMaxAttempts(maxAttempts: number | undefined): number {
    const normalized = Number(maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    if (!Number.isFinite(normalized)) return DEFAULT_MAX_ATTEMPTS;
    return Math.max(1, Math.trunc(normalized));
  }

  private getTimeoutMs(timeoutMs: number | undefined): number {
    const configured = Number(
      timeoutMs ??
        this.configService.get<string>('WEBHOOK_TIMEOUT_MS') ??
        DEFAULT_WEBHOOK_TIMEOUT_MS,
    );
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_WEBHOOK_TIMEOUT_MS;
    return Math.trunc(configured);
  }

  private getBackoffMs(attemptCount: number): number {
    return BACKOFF_MS[Math.min(Math.max(attemptCount - 1, 0), BACKOFF_MS.length - 1)];
  }

  private toResponseText(data: unknown): string | null {
    if (data == null) return null;
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private async findDeliveryOrFail(deliveryId: string): Promise<WebhookDeliveryEntity> {
    const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Entrega de webhook não encontrada.');
    return delivery;
  }
}
