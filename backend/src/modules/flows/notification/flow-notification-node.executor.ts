import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { MAX_DELAY_MINUTES } from '../../notifications/domain/notification.limits';
import { NotificationChannelRegistry } from '../../notifications/channels/notification-channel.registry';
import { maskAddress } from '../../notifications/domain/notification-errors';
import {
  extractTemplateVariables,
  hasMalformedTokens,
  renderTemplate,
} from '../../notifications/domain/notification-template';
import type { NotificationChannelId } from '../../notifications/domain/notification.types';
import {
  NotificationRateLimitError,
  NotificationValidationError,
  NotificationsService,
  type NotificationSummary,
} from '../../notifications/notifications.service';
import { SAMPLE_FLOW_VARIABLES, buildFlowTemplateVariables } from '../lib/flow-template-variables';
import { NodeFailureError } from '../lib/node-failure.error';
import type { ActionNotificationData, FlowExecutionContext } from '../types/flow.types';
import { getNotificationNodeErrors } from './notification-node.validation';
import { NotificationRecipientResolver } from './notification-recipient.resolver';

/**
 * Executa o nó `action_notification` dentro do motor de fluxos.
 *
 *   contexto → variáveis → render (texto puro) → destinatários → persistir (idempotente)
 *            → enviar (imediato) ou deixar para o worker → resultado do nó
 *
 * Contrato com o motor (igual ao dos demais nós): devolve o `output` em caso de sucesso, ou
 * **lança** em caso de falha — `NodeFailureError` quando há `output` útil para gravar junto
 * (id da notificação, contagens), nunca com dados pessoais.
 */
@Injectable()
export class FlowNotificationNodeExecutor {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly registry: NotificationChannelRegistry,
    private readonly resolver: NotificationRecipientResolver,
    private readonly config: ConfigService,
  ) {}

  async execute(
    data: ActionNotificationData,
    ctx: FlowExecutionContext,
    nodeId: string,
  ): Promise<Record<string, unknown>> {
    const errors = getNotificationNodeErrors(data as unknown as Record<string, unknown>);
    if (errors.length > 0) {
      throw new Error(`action_notification: ${errors[0]}`);
    }

    const channel = this.registry.get(data.channel);
    const variables = buildFlowTemplateVariables(ctx, {
      frontendUrl: this.config.get<string>('FRONTEND_URL', ''),
    });
    const title = data.title?.trim()
      ? renderTemplate(data.title, variables, { maxLength: channel.limits.titleMax })
      : null;
    const body = renderTemplate(data.content, variables, { maxLength: channel.limits.bodyMax });
    if (!body.text) {
      throw new Error('action_notification: o conteúdo ficou vazio depois de aplicar as variáveis.');
    }
    const missingVariables = [...new Set([...(title?.missingVariables ?? []), ...body.missingVariables])];

    const resolved = await this.resolver.resolve(data.recipients, ctx, data.channel, variables);
    // "Ignorar destinatários sem contato": quem não se resolve sai da lista em vez de falhar o envio.
    const ignored = data.skipUnresolvedRecipients ? resolved.filter((r) => r.unresolvedReason) : [];
    const recipients = data.skipUnresolvedRecipients
      ? resolved.filter((r) => !r.unresolvedReason)
      : resolved;

    if (recipients.length === 0 && ignored.length > 0) {
      const reasons = [...new Set(ignored.map((r) => r.unresolvedReason as string))];
      return {
        ...(ctx.metadata?.testRun === true ? { dryRun: true } : {}),
        skipped: true,
        summary: `${ctx.metadata?.testRun === true ? 'Pularia' : 'Pulou'} o aviso: nenhum destinatário com contato — ${reasons.join(' ')}`,
        channel: data.channel,
        ignoredRecipients: ignored.length,
      };
    }

    // Teste manual do fluxo: valida, resolve e renderiza — mas NÃO envia nem persiste.
    if (ctx.metadata?.testRun === true) {
      const resolvedCount = recipients.filter((r) => !r.unresolvedReason).length;
      return {
        dryRun: true,
        summary: `Enviaria 1 notificação (${data.channel}) para ${resolvedCount} destinatário(s)${
          resolvedCount < recipients.length ? ` — ${recipients.length - resolvedCount} não resolvido(s)` : ''
        }${ignored.length > 0 ? ` — ${ignored.length} sem contato ignorado(s)` : ''}.`,
        channel: data.channel,
        recipients: recipients.map((r) => ({
          source: r.source,
          resolved: !r.unresolvedReason,
          ...(r.address ? { address: maskAddress(r.address) } : {}),
          ...(r.unresolvedReason ? { reason: r.unresolvedReason } : {}),
        })),
        title: title?.text ?? null,
        preview: body.text,
        truncated: body.truncated || Boolean(title?.truncated),
        missingVariables,
      };
    }

    const delayMinutes = this.normalizeDelay(data.delayMinutes);
    const background = data.deliveryMode === 'background' || delayMinutes > 0;

    let enqueued;
    try {
      enqueued = await this.notifications.enqueue({
        channel: data.channel,
        title: title?.text ?? null,
        body: body.text,
        priority: data.priority ?? 'normal',
        recipients,
        scheduledFor: delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60_000) : null,
        retryPolicy: data.retryPolicy ?? null,
        idempotencyKey: this.buildIdempotencyKey(data, ctx, nodeId, variables),
        origin: {
          flowId: ctx.flowId ?? null,
          flowExecutionId: ctx.flowExecutionId ?? null,
          nodeId,
          solicitationId: ctx.solicitation?.id ?? null,
        },
        metadata: {
          deliveryMode: background ? 'background' : 'immediate',
          delayMinutes,
          missingVariables,
          truncated: body.truncated || Boolean(title?.truncated),
        },
      });
    } catch (error) {
      if (error instanceof NotificationValidationError || error instanceof NotificationRateLimitError) {
        throw new Error(`action_notification: ${error.message}`);
      }
      throw error;
    }

    const summary = background
      ? await this.notifications.summarize(enqueued.message.id)
      : await this.notifications.dispatch(enqueued.message.id);

    const output = {
      ...this.buildOutput(summary, enqueued.created, missingVariables),
      ...(ignored.length > 0 ? { ignoredRecipients: ignored.length } : {}),
    };
    if (summary.counts.failed > 0) {
      throw new NodeFailureError(this.failureMessage(summary), output);
    }
    return output;
  }

  /**
   * Prévia para o editor: renderiza título e conteúdo com valores de exemplo (e os campos do
   * formulário do fluxo como `«codigo»`) e aponta variáveis desconhecidas e mal formadas —
   * a mesma renderização que roda no envio, então o que se vê é o que sai.
   */
  preview(input: {
    channel: NotificationChannelId;
    title?: string;
    content: string;
    fieldCodes?: string[];
  }): {
    title: string | null;
    body: string;
    usedVariables: string[];
    missingVariables: string[];
    malformed: boolean;
    truncated: boolean;
    limits: { titleMax: number; bodyMax: number };
  } {
    const channel = this.registry.get(input.channel);
    const variables: Record<string, string> = { ...SAMPLE_FLOW_VARIABLES };
    for (const code of input.fieldCodes ?? []) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(code) && !Object.prototype.hasOwnProperty.call(variables, code)) {
        variables[code] = `«${code}»`;
      }
    }
    // O payload do webhook só existe em runtime: qualquer `payload.x` é aceito na prévia.
    const names = [
      ...extractTemplateVariables(input.title ?? ''),
      ...extractTemplateVariables(input.content),
    ];
    for (const name of names) {
      if (name.startsWith('payload.') && !Object.prototype.hasOwnProperty.call(variables, name)) {
        variables[name] = `«${name}»`;
      }
    }

    const title = input.title?.trim()
      ? renderTemplate(input.title, variables, { maxLength: channel.limits.titleMax })
      : null;
    const body = renderTemplate(input.content, variables, { maxLength: channel.limits.bodyMax });
    return {
      title: title?.text ?? null,
      body: body.text,
      usedVariables: [...new Set([...(title?.usedVariables ?? []), ...body.usedVariables])],
      missingVariables: [...new Set([...(title?.missingVariables ?? []), ...body.missingVariables])],
      malformed: hasMalformedTokens(input.content) || hasMalformedTokens(input.title ?? ''),
      truncated: body.truncated || Boolean(title?.truncated),
      limits: channel.limits,
    };
  }

  /** Chave estável: a do template (se houver) ou execução + nó; `null` só sem execução (não ocorre fora de teste). */
  buildIdempotencyKey(
    data: ActionNotificationData,
    ctx: FlowExecutionContext,
    nodeId: string,
    variables: Record<string, string>,
  ): string | null {
    let raw: string | null = null;
    const template = data.idempotencyKeyTemplate?.trim();
    if (template) {
      const rendered = renderTemplate(template, variables).text;
      if (rendered) raw = `flow:${ctx.flowId ?? ''}:${nodeId}:${rendered}`;
    }
    if (!raw && ctx.flowExecutionId) raw = `exec:${ctx.flowExecutionId}:${nodeId}`;
    return raw ? `v1:${createHash('sha256').update(raw).digest('hex')}` : null;
  }

  private normalizeDelay(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(Math.trunc(parsed), MAX_DELAY_MINUTES);
  }

  private buildOutput(
    summary: NotificationSummary,
    created: boolean,
    missingVariables: string[],
  ): Record<string, unknown> {
    const { counts } = summary;
    return {
      notificationId: summary.notificationId,
      channel: summary.channel,
      status: summary.status,
      deduplicated: !created,
      recipients: {
        total: counts.total,
        sent: counts.sent,
        delivered: counts.delivered,
        failed: counts.failed,
        pending: counts.pending,
        scheduled: counts.scheduled,
        cancelled: counts.cancelled,
        retryScheduled: summary.retryScheduled,
      },
      ...(summary.errors.length > 0 ? { errors: summary.errors } : {}),
      ...(missingVariables.length > 0 ? { missingVariables } : {}),
    };
  }

  private failureMessage(summary: NotificationSummary): string {
    const { counts } = summary;
    const reasons = summary.errors.map((e) => `${e.category}: ${e.count}`).join(', ');
    return `Notificação ${summary.channel}: ${counts.failed} de ${counts.total} destinatário(s) falharam${
      reasons ? ` (${reasons})` : ''
    }.`;
  }
}
