import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserInviteSentEvent } from '../../../common/events/user-events';
import { UserEntity } from '../../../database/entities';
import { FlowMailerService } from '../../flows/mailer/flow-mailer.service';
import { allowMockProviders } from '../../notifications/channels/channel-config';
import { classifyError, sanitizeErrorMessage } from '../../notifications/domain/notification-errors';
import { isRetryableCategory } from '../../notifications/domain/notification-retry';
import { SettingsService } from '../../settings/settings.service';
import { buildUserInviteEmail } from './user-invite-email';
import { generateInviteToken, hashInviteToken, isPlausibleInviteToken } from './user-invite-token';

export const USER_INVITE_DEFAULT_TTL_HOURS = 168; // 7 dias
const USER_INVITE_MAX_TTL_HOURS = 24 * 30;

export interface UserInviteResult {
  /** `true` se o SMTP aceitou o e-mail (ou, em desenvolvimento sem SMTP, o link foi só para o log). */
  sent: boolean;
  /** Motivo sanitizado quando `sent` é falso. */
  error?: string;
  expiresAt?: Date;
}

export interface UserInviteView {
  fullName: string;
  email: string;
  expiresAt: Date;
}

/** Mesma mensagem para token inexistente, expirado, já usado ou de usuário inativo. */
const INVALID_INVITE_MESSAGE =
  'Este convite não é válido ou já expirou. Peça um novo convite a quem administra o sistema.';

/**
 * Convite por e-mail para um usuário criar a própria senha.
 *
 * Como o link de aprovação externa, o convite NÃO passa pela caixa de saída de notificações: lá o
 * corpo fica gravado em texto e visível a quem gerencia fluxos, e este corpo traz um token capaz de
 * definir a senha da conta. O token só existe na memória e no e-mail; o banco guarda o hash.
 */
@Injectable()
export class UserInviteService {
  private readonly logger = new Logger(UserInviteService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: FlowMailerService,
    private readonly settings: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  ttlHours(): number {
    const value = Number(this.config.get<string>('USER_INVITE_TTL_HOURS'));
    return Number.isFinite(value) && value > 0
      ? Math.min(Math.trunc(value), USER_INVITE_MAX_TTL_HOURS)
      : USER_INVITE_DEFAULT_TTL_HOURS;
  }

  /**
   * Gera um token novo (o anterior deixa de valer), grava só o hash e envia o e-mail. Falha de envio
   * não desfaz nada: o usuário continua criado e o convite pode ser reenviado pela lista.
   */
  async issueAndSend(
    userId: string,
    invitedBy?: { id: string; fullName?: string | null } | null,
  ): Promise<UserInviteResult> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    if (!user.isActive) {
      throw new BadRequestException('Usuário inativo não pode receber convite. Reative o cadastro antes.');
    }

    const canSend = this.mailer.isConfigured() || allowMockProviders(this.config);
    if (!canSend) {
      // Sem SMTP em produção: não gera token nenhum (um link que ninguém recebe só seria um risco).
      return { sent: false, error: 'O envio de e-mail (SMTP) não está configurado no servidor.' };
    }

    const { token, hash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3_600_000);
    await this.usersRepository.update(user.id, {
      inviteTokenHash: hash,
      inviteExpiresAt: expiresAt,
      inviteSentAt: null,
    });

    const link = `${this.frontendUrl()}/convite/${token}`;

    if (!this.mailer.isConfigured()) {
      // Desenvolvimento sem SMTP: o link só aparece no log do servidor (nunca em produção).
      this.logger.warn(`SMTP não configurado — link de convite (somente desenvolvimento): ${link}`);
      return this.markSent(user, expiresAt, invitedBy?.id ?? null);
    }

    const email = buildUserInviteEmail({
      orgName: await this.orgName(),
      fullName: user.fullName,
      email: user.email,
      invitedByName: invitedBy?.fullName ?? null,
      link,
      loginUrl: `${this.frontendUrl()}/login`,
      expiresAt,
    });

    let lastError = 'falha desconhecida';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const delivery = await this.mailer.sendDetailed({ to: [user.email], ...email });
        // O servidor pode aceitar a conexão e mesmo assim recusar o destinatário: isso NÃO é "enviado".
        if (delivery.accepted.length === 0 && delivery.rejected.length > 0) {
          this.logger.warn({ userId: user.id }, 'Endereço do convite recusado pelo SMTP');
          return { sent: false, error: 'O servidor de e-mail recusou o endereço do usuário.' };
        }
        this.logger.log({ userId: user.id, attempt }, 'Convite de usuário enviado');
        return this.markSent(user, expiresAt, invitedBy?.id ?? null);
      } catch (error) {
        const classified = classifyError(error);
        lastError = sanitizeErrorMessage(classified.message);
        this.logger.warn(
          { userId: user.id, attempt, category: classified.category },
          'Falha ao enviar o convite de usuário',
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

  /** Dados mínimos para a página pública do convite (nome e e-mail de quem foi convidado). */
  async getForToken(token: string): Promise<UserInviteView> {
    const user = await this.findValidByToken(token);
    return { fullName: user.fullName, email: user.email, expiresAt: user.inviteExpiresAt as Date };
  }

  /**
   * Gasta o convite numa única operação (`UPDATE ... WHERE hash = ... RETURNING`): dois envios ao
   * mesmo tempo não usam o mesmo link. Devolve o id do usuário dono do convite.
   */
  async consume(token: string): Promise<string> {
    if (!isPlausibleInviteToken(token)) {
      throw new NotFoundException(INVALID_INVITE_MESSAGE);
    }
    const result = await this.usersRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({ inviteTokenHash: null, inviteExpiresAt: null })
      .where('invite_token_hash = :hash', { hash: hashInviteToken(token) })
      .andWhere('invite_expires_at > now()')
      .andWhere('is_active = true')
      .returning(['id'])
      .execute();
    const row = (result.raw as Array<{ id: string }>)[0];
    if (!row) {
      throw new NotFoundException(INVALID_INVITE_MESSAGE);
    }
    return row.id;
  }

  private async findValidByToken(token: string): Promise<UserEntity> {
    if (!isPlausibleInviteToken(token)) {
      throw new NotFoundException(INVALID_INVITE_MESSAGE);
    }
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .where('user.invite_token_hash = :hash', { hash: hashInviteToken(token) })
      .getOne();
    if (!user?.isActive || !user.inviteExpiresAt || user.inviteExpiresAt.getTime() <= Date.now()) {
      throw new NotFoundException(INVALID_INVITE_MESSAGE);
    }
    return user;
  }

  private async markSent(user: UserEntity, expiresAt: Date, actorId: string | null): Promise<UserInviteResult> {
    await this.usersRepository.update(user.id, { inviteSentAt: new Date() });
    this.eventEmitter.emit('users.invite_sent', new UserInviteSentEvent(actorId, user.id, user.email, expiresAt));
    return { sent: true, expiresAt };
  }

  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private frontendUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  private async orgName(): Promise<string> {
    return this.settings.getValue<string>('org.name', 'Aurora Flow').catch(() => 'Aurora Flow');
  }
}
