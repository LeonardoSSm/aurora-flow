import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../../../database/entities';
import { resolvePath } from '../../../common/utils/dot-path';
import { renderTemplate, type TemplateVariables } from '../../notifications/domain/notification-template';
import type { NotificationChannelId } from '../../notifications/domain/notification.types';
import type { ResolvedRecipient } from '../../notifications/notifications.service';
import type { FlowExecutionContext, NotificationRecipientSpec } from '../types/flow.types';

/**
 * Transforma os `recipients` configurados no nó em destinatários concretos, a partir do contexto
 * da execução. Entrega o **endereço adequado ao canal** (e-mail para `email`, telefone para
 * `whatsapp`, usuário para `in_app`) — a validação do formato fica no adapter do canal.
 *
 * Tudo o que não puder ser resolvido vira um `ResolvedRecipient` com `unresolvedReason` (e não
 * some): o serviço o grava como destinatário `failed`, e a falha aparece no resultado do nó.
 * Os motivos nunca incluem e-mail/telefone.
 */
@Injectable()
export class NotificationRecipientResolver {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async resolve(
    specs: NotificationRecipientSpec[],
    ctx: FlowExecutionContext,
    channel: NotificationChannelId,
    variables: TemplateVariables,
  ): Promise<ResolvedRecipient[]> {
    const resolved: ResolvedRecipient[] = [];
    for (const spec of specs) {
      switch (spec.type) {
        case 'users':
          resolved.push(...(await this.fromUsers(spec.userIds, channel)));
          break;
        case 'requester':
          resolved.push(this.fromRequester(ctx, channel));
          break;
        case 'responsible':
          resolved.push(this.fromResponsible(ctx, channel));
          break;
        case 'custom':
          resolved.push(
            ...(await this.fromAddressList(
              this.splitList(renderTemplate(spec.value, variables).text),
              'custom',
              channel,
              'O valor informado ficou vazio.',
            )),
          );
          break;
        case 'field': {
          const value = ctx.fields?.[spec.fieldCode];
          resolved.push(
            ...(await this.fromAddressList(
              this.extractList(value),
              'field',
              channel,
              `O campo "${spec.fieldCode}" está vazio.`,
            )),
          );
          break;
        }
        case 'payload_path': {
          const value = resolvePath(ctx.metadata?.payload, spec.path);
          resolved.push(
            ...(await this.fromAddressList(
              this.extractList(value),
              'payload_path',
              channel,
              `Nenhum valor encontrado em "${spec.path}".`,
            )),
          );
          break;
        }
      }
    }
    return resolved;
  }

  private async fromUsers(userIds: string[], channel: NotificationChannelId): Promise<ResolvedRecipient[]> {
    const unique = [...new Set(userIds)];
    const found = await this.users.find({
      where: { id: In(unique) },
      select: ['id', 'fullName', 'email', 'isActive'],
    });
    const byId = new Map(found.map((user) => [user.id, user]));
    return unique.map((id) => {
      const user = byId.get(id);
      if (!user?.isActive) {
        return { source: 'user', userId: id, unresolvedReason: 'Usuário inexistente ou inativo.' };
      }
      return {
        source: 'user',
        userId: user.id,
        displayName: user.fullName,
        // Usuários não têm telefone cadastrado — o WhatsApp falhará com um motivo claro.
        address: channel === 'email' ? user.email : null,
      } satisfies ResolvedRecipient;
    });
  }

  private fromRequester(ctx: FlowExecutionContext, channel: NotificationChannelId): ResolvedRecipient {
    const solicitation = ctx.solicitation;
    const submission = solicitation?.submission ?? ctx.submission ?? null;
    const createdBy = solicitation?.createdByUser ?? null;

    const email = submission?.responderEmail ?? createdBy?.email ?? null;
    const phone = solicitation?.requesterPhone ?? null;
    const displayName = submission?.responderName ?? createdBy?.fullName ?? null;
    const userId = createdBy?.id ?? null;

    if (!email && !phone && !userId) {
      return { source: 'requester', unresolvedReason: 'Solicitante sem contato (e-mail, telefone ou usuário).' };
    }
    return {
      source: 'requester',
      userId,
      displayName,
      address: channel === 'email' ? email : channel === 'whatsapp' ? phone : null,
    };
  }

  private fromResponsible(ctx: FlowExecutionContext, channel: NotificationChannelId): ResolvedRecipient {
    const solicitation = ctx.solicitation;
    const assignee = solicitation?.assignee ?? null;
    if (!assignee) {
      return { source: 'responsible', unresolvedReason: 'A solicitação não tem responsável atribuído.' };
    }
    return {
      source: 'responsible',
      userId: assignee.id,
      displayName: assignee.fullName,
      address:
        channel === 'email' ? assignee.email : channel === 'whatsapp' ? solicitation?.responsiblePhone ?? null : null,
    };
  }

  /** Lista de endereços (e-mail/telefone) → destinatários; no `in_app` cada e-mail vira um usuário ativo. */
  private async fromAddressList(
    entries: string[],
    source: 'custom' | 'field' | 'payload_path',
    channel: NotificationChannelId,
    emptyReason: string,
  ): Promise<ResolvedRecipient[]> {
    if (entries.length === 0) return [{ source, unresolvedReason: emptyReason }];

    if (channel !== 'in_app') {
      return entries.map((address) => ({ source, address }));
    }

    const results: ResolvedRecipient[] = [];
    for (const entry of entries) {
      const user = await this.users.findOne({
        where: { email: entry.trim().toLowerCase(), isActive: true },
        select: ['id', 'fullName', 'isActive'],
      });
      results.push(
        user
          ? { source, userId: user.id, displayName: user.fullName }
          : { source, unresolvedReason: 'Nenhum usuário ativo com o e-mail informado.' },
      );
    }
    return results;
  }

  private splitList(text: string): string[] {
    return text
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  /** Aceita string (CSV), lista de strings ou lista de objetos com `email`/`phone`/`address`. */
  private extractList(value: unknown): string[] {
    const raw: unknown[] = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? this.splitList(value)
        : typeof value === 'number'
          ? [String(value)]
          : [];
    const out: string[] = [];
    for (const entry of raw) {
      if (typeof entry === 'string' || typeof entry === 'number') {
        const text = String(entry).trim();
        if (text) out.push(text);
      } else if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const candidate = obj.email ?? obj.phone ?? obj.address;
        if (typeof candidate === 'string' && candidate.trim()) out.push(candidate.trim());
      }
    }
    return out;
  }
}
