import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { WebhookReceivedEvent } from '../../common/events/webhook-events';
import { HmacService } from '../../common/crypto/hmac.service';
import {
  InboundWebhookEventEntity,
  InboundWebhookEventStatus,
} from '../../database/entities/inbound-webhook-event.entity';
import { WebhookDeliveryEntity } from '../../database/entities/webhook-delivery.entity';
import { WebhookEndpointEntity } from '../../database/entities/webhook-endpoint.entity';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import type { QueryWebhookDeliveriesDto } from './dto/query-webhook-deliveries.dto';
import type { QueryWebhookEventsDto } from './dto/query-webhook-events.dto';
import { MetricsService } from '../observability/metrics.service';
import { MAX_WEBHOOK_BATCH_ITEMS } from '../flows/types/flow.types';
import { parseInboundList } from './inbound-list.parser';

export type InboundWebhookHeaders = Record<string, string | string[] | undefined>;

/**
 * Conteúdo recebido pela rota de lista. `rawBody` é o que chegou (o arquivo ou o corpo): é o que
 * a assinatura confere e o que fica no histórico. Os itens vêm de `values` (JSON já em lista) ou,
 * sem ele, da leitura de `text` (ou do próprio `rawBody`) por parseInboundList.
 */
export type InboundListInput = {
  rawBody: string;
  text?: string;
  values?: unknown[];
  source: 'arquivo' | 'texto' | 'json';
  fileName?: string | null;
};

export type WebhookEndpointResponse = {
  id: string;
  name: string;
  token: string;
  isActive: boolean;
  description: string | null;
  flowTriggerEnabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  signingSecretConfigured: boolean;
};

@Injectable()
export class InboundWebhookService {
  constructor(
    @InjectRepository(WebhookEndpointEntity)
    private readonly endpointsRepo: Repository<WebhookEndpointEntity>,
    @InjectRepository(InboundWebhookEventEntity)
    private readonly eventsRepo: Repository<InboundWebhookEventEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveriesRepo: Repository<WebhookDeliveryEntity>,
    private readonly hmacService: HmacService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
  ) {}

  async receiveWebhook(
    token: string,
    headers: InboundWebhookHeaders,
    rawBody: string,
  ): Promise<InboundWebhookEventEntity> {
    return this.accept(token, headers, rawBody, this.parsePayload(rawBody));
  }

  /**
   * Rota de lista (POST /webhooks/in/:token/list): outro sistema manda só os valores — arquivo
   * .txt/.csv, texto no corpo ou JSON — e os fluxos recebem `{ itens: [...] }`, prontos para o
   * Lote do gatilho de webhook (`itens`) virar uma execução por item. Mesmo token e mesma
   * assinatura do endpoint; a assinatura, se houver, é do conteúdo enviado (o arquivo ou o corpo).
   * Lista vazia ou grande demais é recusada (400) e fica registrada como ignorada.
   */
  async receiveList(
    token: string,
    headers: InboundWebhookHeaders,
    input: InboundListInput,
  ): Promise<{ event: InboundWebhookEventEntity; items: number }> {
    const items = Array.isArray(input.values)
      ? [...new Set(input.values.map((value) => String(value ?? '').trim()).filter(Boolean))]
      : parseInboundList(input.text ?? input.rawBody);
    const payload: Record<string, unknown> = {
      itens: items,
      total: items.length,
      origem: input.source,
      ...(input.fileName ? { arquivo: input.fileName } : {}),
    };

    const problem =
      items.length === 0
        ? 'Nenhum valor encontrado no conteúdo enviado.'
        : items.length > MAX_WEBHOOK_BATCH_ITEMS
          ? `A lista tem ${items.length} itens; o máximo por envio é ${MAX_WEBHOOK_BATCH_ITEMS}. Envie em partes.`
          : null;

    const event = await this.accept(token, headers, input.rawBody, payload, problem);
    return { event, items: items.length };
  }

  /**
   * Núcleo comum das rotas de entrada: endpoint ativo, assinatura (de `rawBody`), evento
   * gravado e, se o endpoint dispara fluxos, `webhooks.received`. `problem` = o conteúdo chegou
   * mas não serve: grava como ignorado (para o histórico mostrar o que veio) e responde 400.
   */
  private async accept(
    token: string,
    headers: InboundWebhookHeaders,
    rawBody: string,
    payload: Record<string, unknown> | null,
    problem: string | null = null,
  ): Promise<InboundWebhookEventEntity> {
    const endpoint = await this.endpointsRepo.findOne({ where: { token } });
    if (!endpoint?.isActive) {
      throw new NotFoundException('Endpoint de webhook não encontrado.');
    }

    const safeHeaders = this.headersForPersistence(headers);
    const sourceIdentifier = this.getSourceIdentifier(headers);

    if (endpoint.signingSecret) {
      const signature = this.getSignature(headers);
      const signatureValid = signature
        ? this.hmacService.verify(endpoint.signingSecret, rawBody, signature)
        : false;

      if (!signatureValid) {
        await this.saveEvent({
          endpointToken: token,
          sourceIdentifier,
          headers: safeHeaders,
          payload,
          rawBody,
          signatureValid: false,
          status: InboundWebhookEventStatus.IGNORED,
          errorMessage: 'Assinatura inválida.',
        });
        this.metricsService.incrementInboundWebhookEvents('ignored');
        throw new UnauthorizedException('Assinatura inválida.');
      }
    }

    if (problem) {
      await this.saveEvent({
        endpointToken: token,
        sourceIdentifier,
        headers: safeHeaders,
        payload,
        rawBody,
        signatureValid: true,
        status: InboundWebhookEventStatus.IGNORED,
        errorMessage: problem,
      });
      this.metricsService.incrementInboundWebhookEvents('ignored');
      throw new BadRequestException(problem);
    }

    const event = await this.saveEvent({
      endpointToken: token,
      sourceIdentifier,
      headers: safeHeaders,
      payload,
      rawBody,
      signatureValid: true,
      status: InboundWebhookEventStatus.RECEIVED,
      errorMessage: null,
    });
    this.metricsService.incrementInboundWebhookEvents('received');

    if (endpoint.flowTriggerEnabled) {
      this.eventEmitter.emit(
        'webhooks.received',
        new WebhookReceivedEvent(event.id, endpoint.id, payload),
      );
    }

    return event;
  }

  async listEndpoints(currentUser: JwtPayload): Promise<WebhookEndpointResponse[]> {
    const endpoints = await this.endpointsRepo.find({
      where: currentUser.role === 'admin' ? {} : { createdBy: currentUser.sub },
      order: { createdAt: 'DESC' },
    });
    return endpoints.map((endpoint) => this.toEndpointResponse(endpoint));
  }

  async createEndpoint(
    dto: CreateWebhookEndpointDto,
    currentUser: JwtPayload,
  ): Promise<WebhookEndpointResponse> {
    const endpoint = await this.endpointsRepo.save(
      this.endpointsRepo.create({
        name: dto.name.trim(),
        token: randomUUID(),
        signingSecret: dto.signingSecret?.trim() ? dto.signingSecret.trim() : null,
        description: dto.description?.trim() ? dto.description.trim() : null,
        flowTriggerEnabled: dto.flowTriggerEnabled ?? true,
        isActive: true,
        createdBy: currentUser.sub,
      }),
    );

    return this.toEndpointResponse(endpoint);
  }

  async deactivateEndpoint(id: string, currentUser: JwtPayload): Promise<void> {
    const endpoint = await this.endpointsRepo.findOne({
      where: currentUser.role === 'admin' ? { id } : { id, createdBy: currentUser.sub },
    });
    if (!endpoint) throw new NotFoundException('Endpoint de webhook não encontrado.');
    endpoint.isActive = false;
    await this.endpointsRepo.save(endpoint);
  }

  async listDeliveries(
    query: QueryWebhookDeliveriesDto,
  ): Promise<PaginatedResponseDto<WebhookDeliveryEntity>> {
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await this.deliveriesRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return PaginatedResponseDto.of(data, total, query.page, query.limit);
  }

  async listEvents(
    query: QueryWebhookEventsDto,
  ): Promise<PaginatedResponseDto<InboundWebhookEventEntity>> {
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await this.eventsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return PaginatedResponseDto.of(data, total, query.page, query.limit);
  }

  private saveEvent(
    data: Pick<
      InboundWebhookEventEntity,
      | 'endpointToken'
      | 'sourceIdentifier'
      | 'headers'
      | 'payload'
      | 'rawBody'
      | 'signatureValid'
      | 'status'
      | 'errorMessage'
    >,
  ): Promise<InboundWebhookEventEntity> {
    return this.eventsRepo.save(
      this.eventsRepo.create({
        ...data,
        processedAt: null,
        flowExecutionId: null,
      }),
    );
  }

  private parsePayload(rawBody: string): Record<string, unknown> | null {
    if (!rawBody.trim()) return null;

    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return null;
    }
  }

  private headersForPersistence(headers: InboundWebhookHeaders): Record<string, string> | null {
    const safeHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this.isSensitiveHeader(key)) continue;
      const stringValue = this.headerToString(value);
      if (stringValue != null) safeHeaders[key] = stringValue;
    }

    return Object.keys(safeHeaders).length > 0 ? safeHeaders : null;
  }

  private getSignature(headers: InboundWebhookHeaders): string | null {
    return (
      this.getHeader(headers, 'x-hub-signature-256') ??
      this.getHeader(headers, 'x-formhub-signature')
    );
  }

  private getSourceIdentifier(headers: InboundWebhookHeaders): string | null {
    const source =
      this.getHeader(headers, 'x-forwarded-for') ??
      this.getHeader(headers, 'x-real-ip') ??
      this.getHeader(headers, 'user-agent');
    return source ? source.substring(0, 255) : null;
  }

  private getHeader(headers: InboundWebhookHeaders, name: string): string | null {
    const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
    return found ? this.headerToString(found[1]) : null;
  }

  private headerToString(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value.join(', ');
    return value ?? null;
  }

  private isSensitiveHeader(key: string): boolean {
    return ['authorization', 'proxy-authorization'].includes(key.toLowerCase());
  }

  private toEndpointResponse(endpoint: WebhookEndpointEntity): WebhookEndpointResponse {
    return {
      id: endpoint.id,
      name: endpoint.name,
      token: endpoint.token,
      isActive: endpoint.isActive,
      description: endpoint.description,
      flowTriggerEnabled: endpoint.flowTriggerEnabled,
      createdBy: endpoint.createdBy,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
      signingSecretConfigured: Boolean(endpoint.signingSecret),
    };
  }
}
