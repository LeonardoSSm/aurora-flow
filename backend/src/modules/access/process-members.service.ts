import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PROCESS_ACCESS_PRESETS,
  PROCESS_PERMISSION_CATALOG,
  type ProcessPermissionScope,
} from '../../common/constants/process-permission-catalog';
import { ProcessMemberChangedEvent } from '../../common/events/process-access-events';
import { FormEntity, FormMemberEntity, UserEntity } from '../../database/entities';
import { type AccessActor, ProcessAccessService } from './process-access.service';

type Grants = Record<string, ProcessPermissionScope>;

export interface ProcessMemberView {
  user: { id: string; fullName: string; email: string; role: string; isActive: boolean };
  grants: Grants;
  createdAt: Date;
}

export interface UserProcessView {
  formId: string;
  formName: string;
  status: string;
  /** Permissões da pessoa no processo; nulo = sem vínculo. */
  grants: Grants | null;
  /** Quem está consultando pode mudar o acesso a este processo. */
  canManage: boolean;
}

/**
 * Cadastro dos vínculos pessoa × processo: quem tem acesso a cada processo e o que pode fazer nele.
 * Decisão 5: mexe no acesso de um processo quem tem acesso total pelo perfil ou "gerenciar quem tem
 * acesso" naquele processo. Toda mudança vai para a auditoria.
 */
@Injectable()
export class ProcessMembersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly processAccess: ProcessAccessService,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(FormMemberEntity)
    private readonly membersRepository: Repository<FormMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  catalog(): { permissions: typeof PROCESS_PERMISSION_CATALOG; presets: typeof PROCESS_ACCESS_PRESETS } {
    return { permissions: PROCESS_PERMISSION_CATALOG, presets: PROCESS_ACCESS_PRESETS };
  }

  async listMembers(formId: string, actor: AccessActor): Promise<ProcessMemberView[]> {
    await this.assertCanManage(formId, actor);
    const members = await this.membersRepository.find({
      where: { formId },
      relations: { user: true, permissions: true },
      order: { createdAt: 'ASC' },
    });
    return members
      .map((member) => ({
        user: {
          id: member.user.id,
          fullName: member.user.fullName,
          email: member.user.email,
          role: member.user.role,
          isActive: member.user.isActive,
        },
        grants: toGrants(member),
        createdAt: member.createdAt,
      }))
      .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, 'pt-BR'));
  }

  /** Cria o vínculo ou troca todas as permissões dele pelas informadas. */
  async setMember(
    formId: string,
    userId: string,
    grants: Record<string, unknown>,
    actor: AccessActor,
  ): Promise<ProcessMemberView> {
    await this.assertCanManage(formId, actor);
    const validGrants = validateGrants(grants);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const previous = await this.currentGrants(formId, userId);
    const member = await this.dataSource.transaction((manager) =>
      this.processAccess.writeMember(manager, formId, userId, validGrants, actor.sub),
    );
    this.eventEmitter.emit(
      'process_members.changed',
      new ProcessMemberChangedEvent(actor.sub, formId, userId, previous ? 'update' : 'grant', validGrants, previous),
    );
    return {
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, isActive: user.isActive },
      grants: validGrants,
      createdAt: member.createdAt,
    };
  }

  async removeMember(formId: string, userId: string, actor: AccessActor): Promise<void> {
    await this.assertCanManage(formId, actor);
    const previous = await this.currentGrants(formId, userId);
    if (!previous) throw new NotFoundException('Esta pessoa não tem vínculo com o processo.');
    await this.dataSource.transaction((manager) => this.processAccess.removeMember(manager, formId, userId));
    this.eventEmitter.emit(
      'process_members.changed',
      new ProcessMemberChangedEvent(actor.sub, formId, userId, 'revoke', {}, previous),
    );
  }

  /**
   * Os processos vistos do lado da pessoa (passo "Processos" do cadastro de usuário): todos os que quem
   * consulta pode gerenciar, com o vínculo da pessoa em cada um.
   */
  async listProcessesOfUser(userId: string, actor: AccessActor): Promise<UserProcessView[]> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const actorGrants = await this.processAccess.grantsOf(actor);
    const forms = await this.formsRepository.find({
      select: { id: true, name: true, status: true },
      order: { name: 'ASC' },
    });
    const members = await this.membersRepository.find({
      where: { userId },
      relations: { permissions: true },
    });
    const byForm = new Map(members.map((member) => [member.formId, toGrants(member)]));

    return forms
      .map((form) => ({
        formId: form.id,
        formName: form.name,
        status: form.status,
        grants: byForm.get(form.id) ?? null,
        canManage: actorGrants.scope(form.id, 'process.access.manage') === 'all',
      }))
      .filter((view) => view.canManage || view.grants !== null);
  }

  private async assertCanManage(formId: string, actor: AccessActor): Promise<void> {
    const exists = await this.formsRepository.exists({ where: { id: formId } });
    if (!exists) throw new NotFoundException('Formulario nao encontrado.');
    if (!(await this.processAccess.canManageAccess(actor, formId))) {
      throw new ForbiddenException('Você não pode mudar quem tem acesso a este processo.');
    }
  }

  private async currentGrants(formId: string, userId: string): Promise<Grants | null> {
    const member = await this.membersRepository.findOne({
      where: { formId, userId },
      relations: { permissions: true },
    });
    return member ? toGrants(member) : null;
  }
}

function toGrants(member: FormMemberEntity): Grants {
  return Object.fromEntries((member.permissions ?? []).map((p) => [p.permissionCode, p.scope]));
}

/** Só códigos do catálogo; 'own' só onde o catálogo oferece (ver solicitações). */
function validateGrants(input: Record<string, unknown>): Grants {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Informe as permissões como { código: escopo }.');
  }
  const grants: Grants = {};
  for (const [code, scope] of Object.entries(input)) {
    const definition = PROCESS_PERMISSION_CATALOG.find((permission) => permission.code === code);
    if (!definition) throw new BadRequestException(`Permissão de processo desconhecida: "${code}".`);
    if (!definition.scopes.includes(scope as ProcessPermissionScope)) {
      throw new BadRequestException(
        `Escopo inválido para "${code}": use ${definition.scopes.map((s) => `"${s}"`).join(' ou ')}.`,
      );
    }
    grants[code] = scope as ProcessPermissionScope;
  }
  return grants;
}
