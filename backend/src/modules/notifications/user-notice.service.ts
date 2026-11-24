import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPriority } from './domain/notification.types';
import { ExpoPushService } from './expo-push.service';
import { NotificationsService } from './notifications.service';

/** Quantos usuários vão numa notificação do sino (o limite padrão por notificação é maior). */
const RECIPIENTS_PER_NOTICE = 50;

export interface UserNoticeInput {
  /** Quem recebe. Repetidos, vazios e `exceptUserIds` são descartados. */
  userIds: ReadonlyArray<string | null | undefined>;
  /** Normalmente quem fez a ação: não precisa ser avisado do que acabou de fazer. */
  exceptUserIds?: ReadonlyArray<string | null | undefined>;
  title: string;
  body: string;
  /** Título do push no celular (pode ter emoji); ausente = `title`. */
  pushTitle?: string;
  /** Caminho interno que o aviso do sino abre (ex.: `/aprovacoes?id=…`). */
  link?: string | null;
  /** Dados do push (o app usa `type`/`solicitationId`/`screen` para abrir a tela). */
  pushData?: Record<string, unknown>;
  /** Tipo do aviso (fica no `metadata.kind` da notificação). */
  kind: string;
  solicitationId?: string | null;
  priority?: NotificationPriority;
  /**
   * Mesma chave ⇒ o sino não repete o aviso (ex.: o mesmo SLA vencendo de novo na próxima
   * varredura). Ausente = cada chamada é um aviso novo.
   */
  dedupeKey?: string | null;
}

/**
 * Aviso do sistema a usuários internos: sino (caixa de entrada, canal `in_app`) **e** push do app.
 * Antes os eventos do sistema iam só por push — quem usa só a web não via nada.
 *
 * Nunca lança: aviso que falha vira log, a ação que o originou segue.
 */
@Injectable()
export class UserNoticeService {
  private readonly logger = new Logger(UserNoticeService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: ExpoPushService,
  ) {}

  async notify(input: UserNoticeInput): Promise<void> {
    const except = new Set(input.exceptUserIds?.filter(Boolean) ?? []);
    const userIds = [
      ...new Set(input.userIds.filter((id): id is string => Boolean(id) && !except.has(id))),
    ];
    if (userIds.length === 0 || !input.body.trim()) return;

    await Promise.all([this.toInbox(userIds, input), this.toPush(userIds, input)]);
  }

  private async toInbox(userIds: string[], input: UserNoticeInput): Promise<void> {
    for (let start = 0; start < userIds.length; start += RECIPIENTS_PER_NOTICE) {
      const chunk = userIds.slice(start, start + RECIPIENTS_PER_NOTICE);
      try {
        const enqueued = await this.notifications.enqueue({
          channel: 'in_app',
          title: input.title,
          body: input.body,
          priority: input.priority ?? 'normal',
          recipients: chunk.map((userId) => ({ source: 'user' as const, userId })),
          // A coluna tem 100 caracteres: hash da chave + fatia de destinatários.
          idempotencyKey: input.dedupeKey
            ? `notice:${createHash('sha256').update(`${input.dedupeKey}|${start}`).digest('hex')}`
            : null,
          origin: { solicitationId: input.solicitationId ?? null },
          metadata: { kind: input.kind, ...(input.link ? { link: input.link } : {}) },
        });
        if (enqueued.created) await this.notifications.dispatch(enqueued.message.id);
      } catch (error) {
        this.logger.warn(
          `Aviso "${input.kind}" não chegou ao sino: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async toPush(userIds: string[], input: UserNoticeInput): Promise<void> {
    try {
      await this.push.sendToUsers(userIds, {
        title: input.pushTitle ?? input.title,
        body: input.body,
        data: {
          type: input.kind,
          ...(input.solicitationId ? { solicitationId: input.solicitationId } : {}),
          ...input.pushData,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Push "${input.kind}" falhou: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Caminho do app que abre a solicitação. */
export function solicitationLink(solicitationId: string): string {
  return `/solicitacoes?solicitationId=${encodeURIComponent(solicitationId)}`;
}

/** Caminho do app que abre a aprovação. */
export function approvalLink(approvalId: string): string {
  return `/aprovacoes?id=${encodeURIComponent(approvalId)}`;
}
