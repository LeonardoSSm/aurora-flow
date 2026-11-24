import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PRODUCT_NAME } from '../../../common/constants/product';
import { ApprovalStatus } from '../../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../../common/enums/approval-step-status.enum';
import { ApprovalStepEntity } from '../../../database/entities';
import { FlowMailerService } from '../../flows/mailer/flow-mailer.service';
import { allowMockProviders } from '../../notifications/channels/channel-config';
import { classifyError, sanitizeErrorMessage } from '../../notifications/domain/notification-errors';
import { isRetryableCategory } from '../../notifications/domain/notification-retry';
import { SettingsService } from '../../settings/settings.service';
import { buildExternalApprovalEmail } from './external-approval-email';
import { generateApprovalToken } from './external-approval-token';

export const EXTERNAL_APPROVAL_DEFAULT_TTL_HOURS = 168; // 7 dias
export const EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS = 5;
export const MAX_EXTERNAL_APPROVERS_PER_APPROVAL = 10;

export interface IssueLinkResult {
  /** `true` se o SMTP aceitou o e-mail (ou, em desenvolvimento sem SMTP, o link foi só registrado). */
  sent: boolean;
  /** Motivo sanitizado quando `sent` é falso. */
  error?: string;
}

/**
 * Emite e envia o link pessoal de aprovação de um aprovador externo.
 *
 * O link NÃO passa pela caixa de saída de notificações de propósito: lá o corpo da mensagem fica
 * gravado em texto e é visível a quem gerencia fluxos — e este corpo contém um token capaz de
 * decidir a aprovação. Aqui o token só existe na memória e no e-mail; o banco guarda o hash.
 */
@Injectable()
export class ExternalApprovalLinkService {
  private readonly logger = new Logger(ExternalApprovalLinkService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: FlowMailerService,
    private readonly settings: SettingsService,
    @InjectRepository(ApprovalStepEntity)
    private readonly stepsRepo: Repository<ApprovalStepEntity>,
  ) {}

  /** Há como avisar aprovadores externos? (SMTP configurado, ou modo simulado fora de produção.) */
  isDeliverable(): boolean {
    return this.mailer.isConfigured() || allowMockProviders(this.config);
  }

  /** Falha cedo, ANTES de criar a aprovação, se não há como mandar o link (senão ela ficaria presa). */
  assertDeliverable(): void {
    if (!this.isDeliverable()) {
      throw new BadRequestException(
        'O envio de e-mail (SMTP) não está configurado no servidor: não é possível avisar aprovadores externos. Configure SMTP_HOST, SMTP_USER e SMTP_PASS.',
      );
    }
  }

  ttlHours(): number {
    const value = Number(this.config.get<string>('APPROVAL_EXTERNAL_LINK_TTL_HOURS'));
    return Number.isFinite(value) && value > 0 ? Math.min(Math.trunc(value), 24 * 90) : EXTERNAL_APPROVAL_DEFAULT_TTL_HOURS;
  }

  /**
   * Gera um token novo para a etapa (invalidando o anterior, se houver), grava só o hash e envia o
   * e-mail. Usada ao criar a aprovação, ao ativar a próxima etapa de uma sequência e no reenvio.
   */
  async issueAndSend(stepId: string): Promise<IssueLinkResult> {
    const step = await this.stepsRepo.findOne({
      where: { id: stepId },
      relations: { approval: { solicitation: { createdByUser: true, submission: true } } },
    });
    if (!step?.assignedEmail) {
      throw new BadRequestException('Esta etapa não é de um aprovador externo.');
    }
    if (step.status !== ApprovalStepStatus.PENDING || step.approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Esta etapa não está mais pendente.');
    }

    const { token, hash } = generateApprovalToken();
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3_600_000);
    await this.stepsRepo.update(stepId, {
      accessTokenHash: hash,
      accessTokenExpiresAt: expiresAt,
      accessFailedAttempts: 0,
      accessLinkSentAt: null,
    });

    const link = `${this.frontendUrl()}/aprovar/${token}`;

    if (!this.mailer.isConfigured()) {
      if (!allowMockProviders(this.config)) {
        return { sent: false, error: 'SMTP não configurado no servidor.' };
      }
      // Desenvolvimento sem SMTP: o link só aparece no log do servidor (nunca em produção).
      this.logger.warn(`SMTP não configurado — link de aprovação externa (somente desenvolvimento): ${link}`);
      await this.stepsRepo.update(stepId, { accessLinkSentAt: new Date() });
      return { sent: true };
    }

    const solicitation = step.approval.solicitation;
    const email = buildExternalApprovalEmail({
      orgName: await this.orgName(),
      approvalTitle: step.approval.title,
      approvalDescription: step.approval.description,
      solicitationNumber: solicitation.id.slice(0, 8).toUpperCase(),
      solicitationTitle: solicitation.title,
      requesterName: solicitation.submission?.responderName ?? solicitation.createdByUser?.fullName ?? null,
      link,
      expiresAt,
    });

    let lastError = 'falha desconhecida';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const delivery = await this.mailer.sendDetailed({ to: [step.assignedEmail], ...email });
        // O servidor pode aceitar a conexão e mesmo assim recusar o destinatário: isso NÃO é "enviado".
        if (delivery.accepted.length === 0 && delivery.rejected.length > 0) {
          this.logger.warn({ stepId, approvalId: step.approvalId }, 'Endereço do aprovador externo recusado pelo SMTP');
          return { sent: false, error: 'O servidor de e-mail recusou o endereço do aprovador.' };
        }
        await this.stepsRepo.update(stepId, { accessLinkSentAt: new Date() });
        this.logger.log({ stepId, approvalId: step.approvalId, attempt }, 'Link de aprovação externa enviado');
        return { sent: true };
      } catch (error) {
        const classified = classifyError(error);
        lastError = sanitizeErrorMessage(classified.message);
        this.logger.warn(
          { stepId, approvalId: step.approvalId, attempt, category: classified.category },
          'Falha ao enviar o link de aprovação externa',
        );
        if (attempt === 1 && isRetryableCategory(classified.category)) {
          await this.wait(1000);
          continue;
        }
        break;
      }
    }
    return { sent: false, error: lastError };
  }

  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private frontendUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  private async orgName(): Promise<string> {
    return this.settings.getValue<string>('org.name', PRODUCT_NAME).catch(() => PRODUCT_NAME);
  }
}
