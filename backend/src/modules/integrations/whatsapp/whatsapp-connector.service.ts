import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { SolicitationHistoryEventType } from '../../../common/enums/solicitation-history-event-type.enum';
import {
  SolicitationEntity,
  SolicitationHistoryEntity,
  WhatsAppMessageEntity,
} from '../../../database/entities';
import { WhatsAppMessageStatus } from '../../../database/entities/whatsapp-message.entity';
import type { QueryWhatsAppMessagesDto } from './dto/query-whatsapp-messages.dto';
import { WhatsAppClientService } from './whatsapp-client.service';
import type { WhatsAppGroup } from './whatsapp-provider.interface';
import { MetricsService } from '../../observability/metrics.service';

type WhatsAppRecipientType = 'requester' | 'responsible' | 'custom';

export type SendWhatsAppToSolicitationOptions = {
  approvalId?: string;
  recipientType?: WhatsAppRecipientType;
  customPhone?: string;
  flowExecutionId?: string | null;
};

export type WhatsAppIntegrationStatus = {
  provider: string;
  isAvailable: boolean;
  totalSent: number;
  totalFailed: number;
};

/** `isAvailable: false` = sem provedor configurado: não há de onde listar (a tela pede o JID). */
export type WhatsAppGroupsResponse = {
  isAvailable: boolean;
  groups: WhatsAppGroup[];
};

@Injectable()
export class WhatsAppConnectorService {
  private readonly logger = new Logger(WhatsAppConnectorService.name);

  constructor(
    private readonly whatsappClientService: WhatsAppClientService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    @InjectRepository(WhatsAppMessageEntity)
    private readonly messagesRepository: Repository<WhatsAppMessageEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    @InjectRepository(SolicitationHistoryEntity)
    private readonly historyRepository: Repository<SolicitationHistoryEntity>,
  ) {}

  async sendToSolicitation(
    solicitationId: string,
    messageTemplate: string,
    options: SendWhatsAppToSolicitationOptions = {},
  ): Promise<WhatsAppMessageEntity> {
    try {
      const solicitation = await this.solicitationsRepository.findOne({
        where: { id: solicitationId },
        relations: { submission: true, assignee: true, createdByUser: true },
      });

      if (!solicitation) {
        const failed = await this.persistMessage({
          solicitationId: null,
          flowExecutionId: options.flowExecutionId ?? null,
          to: '',
          message: messageTemplate,
          status: WhatsAppMessageStatus.FAILED,
          externalMessageId: null,
          errorMessage: 'Solicitação não encontrada.',
        });
        this.metricsService.incrementWhatsAppMessages('failed', this.providerName);
        return failed;
      }

      const message = this.interpolate(messageTemplate, solicitation, options);
      const to = this.resolveRecipient(solicitation, options);

      if (!to) {
        this.logger.warn(
          { solicitationId: solicitation.id, status: 'failed', provider: this.providerName },
          'WhatsApp send skipped — no recipient phone number',
        );
        const failed = await this.persistMessage({
          solicitationId: solicitation.id,
          flowExecutionId: options.flowExecutionId ?? null,
          to: '',
          message,
          status: WhatsAppMessageStatus.FAILED,
          externalMessageId: null,
          errorMessage: 'Número de telefone não disponível.',
        });
        await this.registerHistory(solicitation.id, failed);
        this.metricsService.incrementWhatsAppMessages('failed', this.providerName);
        return failed;
      }

      const result = await this.whatsappClientService.send({ to, message });
      const status = this.mapStatus(result.status);
      const persisted = await this.persistMessage({
        solicitationId: solicitation.id,
        flowExecutionId: options.flowExecutionId ?? null,
        to,
        message,
        status,
        externalMessageId: result.messageId,
        errorMessage: result.error ?? null,
      });
      this.metricsService.incrementWhatsAppMessages(status.toLowerCase(), this.providerName);
      this.logger.log(
        { solicitationId: solicitation.id, status, provider: this.providerName },
        'WhatsApp message sent',
      );
      await this.registerHistory(solicitation.id, persisted);
      return persisted;
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(
        { solicitationId, status: 'failed', provider: this.providerName, error: message },
        'WhatsApp send failed',
      );
      this.metricsService.incrementWhatsAppMessages('failed', this.providerName);
      return this.persistMessage({
        solicitationId: null,
        flowExecutionId: options.flowExecutionId ?? null,
        to: '',
        message: messageTemplate,
        status: WhatsAppMessageStatus.FAILED,
        externalMessageId: null,
        errorMessage: message,
      });
    }
  }

  async listMessages(
    query: QueryWhatsAppMessagesDto,
  ): Promise<PaginatedResponseDto<WhatsAppMessageEntity>> {
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await this.messagesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return PaginatedResponseDto.of(data, total, query.page, query.limit);
  }

  async listGroups(): Promise<WhatsAppGroupsResponse> {
    if (!this.whatsappClientService.isAvailable()) {
      return { isAvailable: false, groups: [] };
    }
    try {
      return { isAvailable: true, groups: await this.whatsappClientService.listGroups() };
    } catch (error) {
      this.logger.warn(
        `WhatsApp group listing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException(
        'Não foi possível consultar os grupos no provedor de WhatsApp. Tente de novo ou informe o ID do grupo.',
      );
    }
  }

  async getStatus(): Promise<WhatsAppIntegrationStatus> {
    const [totalSent, totalFailed] = await Promise.all([
      this.messagesRepository.count({ where: { status: WhatsAppMessageStatus.SENT } }),
      this.messagesRepository.count({ where: { status: WhatsAppMessageStatus.FAILED } }),
    ]);

    return {
      provider: this.providerName,
      isAvailable: this.whatsappClientService.isAvailable(),
      totalSent,
      totalFailed,
    };
  }

  private async persistMessage(data: {
    solicitationId: string | null;
    flowExecutionId: string | null;
    to: string;
    message: string;
    status: WhatsAppMessageStatus;
    externalMessageId: string | null;
    errorMessage: string | null;
  }): Promise<WhatsAppMessageEntity> {
    return this.messagesRepository.save(
      this.messagesRepository.create({
        ...data,
        provider: this.providerName,
        sentAt: data.status === WhatsAppMessageStatus.SENT ? new Date() : null,
      }),
    );
  }

  private async registerHistory(
    solicitationId: string,
    message: WhatsAppMessageEntity,
  ): Promise<void> {
    const success = message.status === WhatsAppMessageStatus.SENT;
    const history = this.historyRepository.create({
      solicitationId,
      eventType: SolicitationHistoryEventType.COMMENT,
      actorId: null,
      fromValue: null,
      toValue: null,
      message: success
        ? `Mensagem WhatsApp enviada para ${message.to}.`
        : `Falha ao enviar WhatsApp: ${message.errorMessage ?? 'erro desconhecido'}`,
      metadata: {
        provider: message.provider,
        whatsappMessageId: message.id,
        externalMessageId: message.externalMessageId,
        status: message.status,
        to: message.to,
      },
    });
    await this.historyRepository.save(history);
  }

  private resolveRecipient(
    solicitation: SolicitationEntity,
    options: SendWhatsAppToSolicitationOptions,
  ): string | null {
    const recipientType = options.recipientType ?? 'requester';
    if (recipientType === 'custom') return this.normalizePhone(options.customPhone);
    if (recipientType === 'responsible') return this.normalizePhone(solicitation.responsiblePhone);
    return (
      this.normalizePhone(solicitation.requesterPhone) ??
      this.normalizePhone(solicitation.responsiblePhone)
    );
  }

  private interpolate(
    template: string,
    solicitation: SolicitationEntity,
    options: SendWhatsAppToSolicitationOptions,
  ): string {
    const requesterName =
      solicitation.submission?.responderName ??
      solicitation.submission?.responderEmail ??
      solicitation.createdByUser?.fullName ??
      '';
    const responsibleName = solicitation.assignee?.fullName ?? '';
    const approvalLink = options.approvalId ? this.buildApprovalLink(options.approvalId) : '';

    return template
      .replace(/\{\{solicitation_number\}\}/g, solicitation.id)
      .replace(/\{\{solicitation_title\}\}/g, solicitation.title)
      .replace(/\{\{solicitation_status\}\}/g, solicitation.status)
      .replace(/\{\{solicitation_requester_name\}\}/g, requesterName)
      .replace(/\{\{solicitation_responsible_name\}\}/g, responsibleName)
      .replace(/\{\{approval_link\}\}/g, approvalLink);
  }

  private buildApprovalLink(approvalId: string): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('APP_URL') ??
      'http://localhost:5173';
    return `${frontendUrl.replace(/\/$/, '')}/aprovacoes?id=${encodeURIComponent(approvalId)}`;
  }

  private mapStatus(status: 'sent' | 'failed' | 'queued'): WhatsAppMessageStatus {
    if (status === 'sent') return WhatsAppMessageStatus.SENT;
    if (status === 'queued') return WhatsAppMessageStatus.QUEUED;
    return WhatsAppMessageStatus.FAILED;
  }

  private normalizePhone(value: string | null | undefined): string | null {
    const phone = value?.trim();
    return phone ? phone.substring(0, 30) : null;
  }

  private get providerName(): string {
    const configured = (this.configService.get<string>('WHATSAPP_PROVIDER') ?? 'mock')
      .trim()
      .toLowerCase();
    if (!configured || configured === 'mock') return 'mock';
    return this.whatsappClientService.isAvailable() ? configured : 'mock';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
