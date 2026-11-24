import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { LopsAiSessionEntity, UserEntity } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PermissionsService } from '../roles/permissions.service';
import { ProcessAccessService } from '../access/process-access.service';
import { isProcessPermission } from '../../common/constants/process-permission-catalog';
import { readLopsAiInboundConfig, type LopsAiInboundConfig } from './lops-ai-inbound.config';
import { canonicalSessionToken, hashSessionToken, newSessionToken } from './lops-ai-session-token';

/** Permissões que a criação de processo pela IA usa — devolvidas na sessão para a IA saber o que pode. */
export const AI_BUILDER_PERMISSIONS = [
  'ai.copilot.use',
  'forms.create',
  'forms.edit',
  'kanban_phases.manage',
  'flows.manage',
] as const;

/** Uso seguido não grava a cada chamada: a validade só anda se o último uso tem mais que isto. */
const TOUCH_INTERVAL_MS = 60_000;

export type LopsAiSessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleName: string | null;
  areaId: string | null;
  areaName: string | null;
  permissions: Record<string, boolean>;
};

/**
 * Sessão da LOPS IA: a pessoa entra na LOPS IA com a conta do Workspace; a LOPS IA (com a chave
 * compartilhada) pede uma sessão pelo e-mail; o Tijuca confere domínio, usuário ativo e permissão e
 * devolve um token curto (tf-XXXX-XXXX-XXXX-XXXX), ligado àquela pessoa. Com ele, a IA age como a
 * pessoa — mesmas permissões e escopo. O token não vale como login do app; só o hash fica no banco,
 * e a validade anda a cada uso, então a sessão dura a conversa inteira.
 */
@Injectable()
export class LopsAiSessionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(LopsAiSessionEntity)
    private readonly sessionsRepository: Repository<LopsAiSessionEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  config(): LopsAiInboundConfig {
    const config = readLopsAiInboundConfig(this.configService);
    if (!config) {
      throw new ServiceUnavailableException(
        'A integração com a LOPS IA não está configurada (LOPS_AI_INBOUND_API_KEY).',
      );
    }
    return config;
  }

  async createSession(
    rawEmail: string,
  ): Promise<{ token: string; expiresAt: string; user: LopsAiSessionUser }> {
    const config = this.config();
    const email = rawEmail.trim().toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (config.workspaceDomain && domain !== config.workspaceDomain) {
      throw new ForbiddenException(`Só contas do domínio ${config.workspaceDomain} usam a LOPS IA.`);
    }

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.area', 'area')
      .leftJoinAndSelect('user.roleDefinition', 'role')
      .where('user.isActive = true')
      .andWhere('(LOWER(user.email) = :email OR LOWER(user.googleAccountEmail) = :email)', { email })
      .getOne();
    if (!user) {
      throw new ForbiddenException('Este e-mail não tem usuário ativo no Tijuca Flow.');
    }
    if (!(await this.permissionsService.hasAny(user.role, 'ai.copilot.use'))) {
      throw new ForbiddenException(
        'Seu perfil no Tijuca Flow não pode criar processos pela LOPS IA (permissão ai.copilot.use).',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.sessionTtlMinutes * 60_000);
    const token = newSessionToken();
    // Sessões vencidas da pessoa não servem mais: limpa ao abrir outra.
    await this.sessionsRepository.delete({ userId: user.id, expiresAt: LessThan(now) });
    await this.sessionsRepository.save(
      this.sessionsRepository.create({
        tokenHash: hashSessionToken(canonicalSessionToken(token) as string),
        userId: user.id,
        tokenVersion: user.tokenVersion,
        expiresAt,
        lastUsedAt: now,
      }),
    );

    await this.auditService.log({
      actorId: user.id,
      module: 'ai',
      entity: 'lops_ai_session',
      entityId: user.id,
      action: 'lops_ai.session_created',
      payload: { email, via: 'lops_ai', expiresInMinutes: config.sessionTtlMinutes },
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: await this.describeUser(user),
    };
  }

  /** Confere o token de sessão e devolve o usuário no mesmo formato do login normal (JwtPayload). */
  async verify(token: string): Promise<JwtPayload> {
    const config = this.config();
    const canonical = canonicalSessionToken(token);
    if (!canonical) {
      throw new UnauthorizedException(
        'Token da LOPS IA em formato errado: use exatamente o token devolvido por "Abrir sessão" (tf-XXXX-XXXX-XXXX-XXXX).',
      );
    }
    const session = await this.sessionsRepository.findOne({ where: { tokenHash: hashSessionToken(canonical) } });
    const now = new Date();
    if (!session || session.expiresAt <= now) {
      throw new UnauthorizedException('Sessão da LOPS IA inválida ou expirada. Peça uma nova sessão.');
    }
    const user = await this.usersRepository.findOne({ where: { id: session.userId, isActive: true } });
    // Trocar a senha ou desativar o usuário derruba a sessão da IA, como derruba o login.
    if (user?.tokenVersion !== session.tokenVersion || !user) {
      throw new UnauthorizedException('Sessão da LOPS IA encerrada: o usuário mudou ou foi desativado.');
    }
    // A validade anda com o uso: enquanto a conversa continua, a sessão não cai.
    if (!session.lastUsedAt || now.getTime() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.sessionsRepository.update(session.id, {
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + config.sessionTtlMinutes * 60_000),
      });
    }
    return {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tokenVersion: user.tokenVersion,
      areaId: user.areaId ?? null,
    };
  }

  async describeUserById(userId: string): Promise<LopsAiSessionUser> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
      relations: { area: true, roleDefinition: true },
    });
    return this.describeUser(user);
  }

  private async describeUser(user: UserEntity): Promise<LopsAiSessionUser> {
    // De processo (fases, fluxos, editar): quem cria o processo vira dono completo dele, então basta
    // poder criar — ou já ter a permissão em algum processo.
    const permissions: Record<string, boolean> = {};
    const canCreate = await this.permissionsService.hasAny(user.role, 'forms.create');
    for (const code of AI_BUILDER_PERMISSIONS) {
      permissions[code] = isProcessPermission(code)
        ? canCreate || (await this.processAccess.hasAnywhere({ sub: user.id, role: user.role }, code))
        : await this.permissionsService.hasAny(user.role, code);
    }
    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      roleName: user.roleDefinition?.name ?? null,
      areaId: user.areaId ?? null,
      areaName: user.area?.name ?? null,
      permissions,
    };
  }
}
