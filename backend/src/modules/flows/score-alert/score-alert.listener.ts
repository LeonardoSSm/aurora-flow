import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, In } from 'typeorm';
import { FormFieldType } from '../../../common/enums/form-field-type.enum';
import { SolicitationOriginType } from '../../../common/enums/solicitation-origin-type.enum';
import type { SolicitationCreatedEvent } from '../../../common/events/solicitation-events';
import {
  FormFieldEntity,
  SolicitationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../../database/entities';
import { EMAIL_IMAGE_CID_PREFIX } from '../../notifications/email-assets/email-inline-images';
import { EmailImagesService } from '../../notifications/email-images/email-images.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationRecipientResolver } from '../notification/notification-recipient.resolver';
import type { FlowExecutionContext } from '../types/flow.types';
import {
  buildScoreAlertMessage,
  evaluateScoreAlerts,
  getScoreAlertSettings,
  trimmedOrNull,
  type ScoreAlert,
  type ScoreAlertContext,
  type ScoreAlertField,
} from './score-alert';
import { buildScoreAlertEmailHtml, buildScoreOverview, scoreAlertPreheader, type ScoreOverview } from './score-alert-email';

/**
 * Envia o aviso de pontuação quando o card de um formulário enviado é criado (as notas já estão
 * gravadas: o backend recalcula tudo no envio). Nunca derruba nada: falha vira log.
 * Idempotente por envio + canal + destinatários — reprocessar o evento não manda de novo.
 */
@Injectable()
export class ScoreAlertListener {
  private readonly logger = new Logger(ScoreAlertListener.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly resolver: NotificationRecipientResolver,
    private readonly config: ConfigService,
    private readonly emailImages: EmailImagesService,
  ) {}

  /**
   * Arte de fundo do e-mail: a do formulário, senão a geral da Administração, senão a padrão (null).
   * Imagem que não existe mais é ignorada.
   */
  private async backgroundCidFor(alert: ScoreAlert): Promise<string | null> {
    for (const id of [alert.backgroundImageId, await this.emailImages.scoreAlertBackgroundId()]) {
      if (await this.emailImages.exists(id)) return `${EMAIL_IMAGE_CID_PREFIX}${id}`;
    }
    return null;
  }

  @OnEvent('solicitations.created')
  async handleSolicitationCreated(event: SolicitationCreatedEvent): Promise<void> {
    if (event.originType !== SolicitationOriginType.FORM_SUBMISSION || !event.submissionId) return;
    try {
      await this.process(event.solicitationId, event.submissionId);
    } catch (error) {
      this.logger.error(
        { solicitationId: event.solicitationId, submissionId: event.submissionId, err: error instanceof Error ? error.message : String(error) },
        'Score alert failed',
      );
    }
  }

  /** Avalia e envia; devolve quantas notificações novas foram criadas (para testes e log). */
  async process(solicitationId: string, submissionId: string): Promise<number> {
    const submission = await this.dataSource
      .getRepository(SubmissionEntity)
      .findOne({ where: { id: submissionId }, relations: { form: true } });
    if (!submission) return 0;

    const fields = await this.dataSource.getRepository(FormFieldEntity).find({
      where: { formVersionId: submission.formVersionId, fieldType: FormFieldType.CALCULATED },
      relations: { section: true },
    });
    const alertFields: ScoreAlertField[] = fields.map((field) => ({
      code: field.code,
      label: field.label,
      sectionTitle: field.section?.title?.trim() ?? '',
      sectionOrder: field.section?.order ?? 0,
      order: field.order,
      settingsJson: field.settingsJson,
    }));
    if (!alertFields.some((field) => getScoreAlertSettings(field.settingsJson))) return 0;

    const items = await this.dataSource.getRepository(SubmissionItemEntity).find({
      where: { submissionId, fieldCode: In(alertFields.map((field) => field.code)) },
    });
    const valueByCode = new Map(
      items.map((item) => [item.fieldCode, item.valueNumber === null ? null : Number(item.valueNumber)]),
    );
    const alerts = evaluateScoreAlerts(alertFields, valueByCode);
    if (alerts.length === 0) return 0;

    const solicitation = await this.dataSource.getRepository(SolicitationEntity).findOne({
      where: { id: solicitationId },
      relations: { submission: true, assignee: true, createdByUser: true },
    });
    const frontendUrl = this.config.get<string>('FRONTEND_URL', '').replace(/\/$/, '');
    const context = {
      formName: submission.form?.name ?? 'Formulário',
      responderName: submission.responderName,
      submittedAt: submission.submittedAt ?? null,
      // Abre direto o detalhe desta resposta por cima dos Registros do processo (?solicitacao=).
      link: frontendUrl
        ? `${frontendUrl}/registros/${submission.formId}?solicitacao=${encodeURIComponent(solicitationId)}`
        : null,
    };

    const overview = buildScoreOverview(alertFields, valueByCode);
    let created = 0;
    for (const alert of alerts) {
      const unitLabel = await this.unitLabelFor(alert.labelFieldCode, submission);
      if (await this.send(alert, { ...context, unitLabel }, overview, { solicitation: solicitation ?? undefined, submission, submissionId })) {
        created += 1;
      }
    }
    return created;
  }

  /**
   * Resposta da pergunta que identifica a auditoria (ex.: a unidade), no texto que quem respondeu viu
   * (rótulo da opção, não o valor interno). Null quando não configurada ou em branco.
   */
  private async unitLabelFor(fieldCode: string | null, submission: SubmissionEntity): Promise<string | null> {
    if (!fieldCode) return null;
    const item = await this.dataSource
      .getRepository(SubmissionItemEntity)
      .findOne({ where: { submissionId: submission.id, fieldCode } });
    const raw = item?.valueText?.trim();
    if (!raw) return null;
    const field = await this.dataSource.getRepository(FormFieldEntity).findOne({
      where: { formVersionId: submission.formVersionId, code: fieldCode },
      relations: { options: true },
    });
    const label = trimmedOrNull(field?.options?.find((option) => option.internalValue === raw)?.displayLabel) ?? raw;
    return label.slice(0, 120);
  }

  private async send(
    alert: ScoreAlert,
    context: ScoreAlertContext,
    overview: ScoreOverview,
    origin: { solicitation?: SolicitationEntity; submission: SubmissionEntity; submissionId: string },
  ): Promise<boolean> {
    const { title, body } = buildScoreAlertMessage(alert, context);
    const ctx: FlowExecutionContext = {
      eventName: 'score_alert',
      solicitation: origin.solicitation,
      submission: origin.submission,
    };
    const recipients = await this.resolver.resolve(alert.recipients, ctx, alert.channel, {});
    const group = createHash('sha1').update(`${alert.channel}:${JSON.stringify(alert.recipients)}`).digest('hex');
    const isEmail = alert.channel === 'email';
    const { message, created } = await this.notifications.enqueue({
      channel: alert.channel,
      title,
      // E-mail: o resumo com os números abre o texto puro, que é de onde o Gmail tira a prévia da lista.
      body: isEmail ? `${scoreAlertPreheader(alert, overview, context)}\n\n${body}` : body,
      // E-mail: versão formatada (tabela, destaque, botão); o texto puro vai junto como alternativa.
      html: isEmail ? buildScoreAlertEmailHtml(alert, overview, { ...context, backgroundCid: await this.backgroundCidFor(alert) }) : null,
      priority: 'high',
      recipients,
      // varchar(100): "score-alert:" + uuid (36) + ":" + 16 do hash.
      idempotencyKey: `score-alert:${origin.submissionId}:${group.slice(0, 16)}`,
      origin: { solicitationId: origin.solicitation?.id ?? null },
      metadata: {
        kind: 'score_alert',
        submissionId: origin.submissionId,
        sectionsBelow: alert.sectionsBelow.length,
        resultsBelow: alert.resultsBelow.length,
      },
    });
    if (created) await this.notifications.dispatch(message.id);
    this.logger.log(
      { notificationId: message.id, submissionId: origin.submissionId, channel: alert.channel, created },
      'Score alert sent',
    );
    return created;
  }
}
