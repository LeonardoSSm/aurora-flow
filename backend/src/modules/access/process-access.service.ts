import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import type { PermissionScope } from '../../common/constants/permission-catalog';
import {
  FULL_PROCESS_GRANTS,
  isProcessPermission,
  PROCESS_PERMISSION_ALIASES,
  PROCESS_PERMISSION_CODES,
  processCodesFor,
  type ProcessPermissionScope,
} from '../../common/constants/process-permission-catalog';
import {
  AttachmentEntity,
  FormEntity,
  FormMemberEntity,
  FormMemberPermissionEntity,
  SolicitationEntity,
  SubmissionEntity,
} from '../../database/entities';
import { PermissionsService } from '../roles/permissions.service';
import { CardFilterService, type CardFilterTarget } from './card-filter.service';

/** Quem pede acesso: o mesmo recorte do token (JwtPayload) que as regras usam. */
export interface AccessActor {
  sub: string;
  role: string;
  areaId?: string | null;
}

/** Escopo de uma pessoa num processo para um código: tudo, só os próprios cards, ou nada. */
export type ProcessScope = 'all' | 'own' | 'none';

/** O que a regra do processo lê do formulário. */
export type FormAccessTarget = { id: string };

/**
 * O que a regra do card lê da solicitação. Com o card inteiro (id, fase, resposta), vale também o
 * filtro de cards da fase pela resposta.
 */
export type SolicitationAccessTarget = {
  formId: string | null;
  createdBy: string | null;
  assigneeId: string | null;
} & Partial<Pick<CardFilterTarget, 'id' | 'currentPhaseId' | 'submissionId' | 'metadata'>>;

const DENIED = 'Acesso negado.';
/** Vínculos mudam pouco; o cache curto poupa uma consulta por checagem sem prender mudança. */
const GRANTS_TTL_MS = 10_000;

/**
 * O que uma pessoa pode em cada processo: o vínculo dela com cada um, ou tudo (`processes.full_access`
 * no perfil). Carregado uma vez por pessoa e consultado sem banco.
 */
export class ProcessGrants {
  constructor(
    readonly userId: string,
    readonly fullAccess: boolean,
    private readonly byForm: ReadonlyMap<string, ReadonlyMap<string, ProcessPermissionScope>>,
  ) {}

  isMember(formId: string): boolean {
    return this.fullAccess || this.byForm.has(formId);
  }

  /** Escopo no processo para um código do vínculo ou um código antigo (apelido). */
  scope(formId: string, code: string): ProcessScope {
    if (this.fullAccess) return 'all';
    const permissions = this.byForm.get(formId);
    if (!permissions) return 'none';
    const codes = processCodesFor(code);
    if (codes.length === 0) return 'all'; // apelido que só pede o vínculo (forms.view)
    let best: ProcessScope = 'none';
    for (const candidate of codes) {
      const scope = permissions.get(candidate);
      if (scope === 'all') return 'all';
      if (scope === 'own') best = 'own';
    }
    return best;
  }

  /** Processos em que a pessoa tem o código: com escopo total e só nos próprios cards. */
  formIds(code: string): { all: string[]; own: string[] } {
    const all: string[] = [];
    const own: string[] = [];
    for (const formId of this.byForm.keys()) {
      const scope = this.scope(formId, code);
      if (scope === 'all') all.push(formId);
      else if (scope === 'own') own.push(formId);
    }
    return { all, own };
  }

  /** Tem o código em ALGUM processo (é o que a rota sem processo no caminho consegue conferir). */
  hasAnywhere(code: string): boolean {
    if (this.fullAccess) return true;
    for (const formId of this.byForm.keys()) {
      if (this.scope(formId, code) !== 'none') return true;
    }
    return false;
  }

  /** Mapa por processo, para a sessão do front. */
  toRecord(): Record<string, Record<string, ProcessPermissionScope>> {
    const record: Record<string, Record<string, ProcessPermissionScope>> = {};
    for (const [formId, permissions] of this.byForm) record[formId] = Object.fromEntries(permissions);
    return record;
  }
}

/**
 * Ponto único da pergunta "esta pessoa pode X neste processo?".
 *
 * A resposta vem do vínculo pessoa × processo (form_members / form_member_permissions). Sem vínculo,
 * o processo não existe para a pessoa — salvo acesso total pelo perfil, o próprio pedido (card que ela
 * abriu ou do qual é responsável) e aprovação roteada a ela. O perfil só decide o que é da plataforma.
 */
@Injectable()
export class ProcessAccessService {
  private readonly cache = new Map<string, { grants: ProcessGrants; expiresAt: number }>();

  constructor(
    private readonly permissions: PermissionsService,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepository: Repository<SubmissionEntity>,
    @InjectRepository(FormMemberEntity)
    private readonly membersRepository: Repository<FormMemberEntity>,
    private readonly cardFilter: CardFilterService,
  ) {}

  // ─── O que a pessoa pode ──────────────────────────────────────────────────

  async grantsOf(actor: AccessActor): Promise<ProcessGrants> {
    // O perfil entra na chave: o acesso total vem dele, e trocar de perfil não pode herdar o cache.
    const key = `${actor.sub}:${actor.role}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.grants;
    const [fullAccess, rows] = await Promise.all([
      this.permissions.hasAny(actor.role, 'processes.full_access'),
      this.membersRepository
        .createQueryBuilder('member')
        .leftJoin(FormMemberPermissionEntity, 'permission', 'permission.member_id = member.id')
        .select('member.form_id', 'formId')
        .addSelect('permission.permission_code', 'code')
        .addSelect('permission.scope', 'scope')
        .where('member.user_id = :userId', { userId: actor.sub })
        .getRawMany<{ formId: string; code: string | null; scope: ProcessPermissionScope | null }>(),
    ]);
    const byForm = new Map<string, Map<string, ProcessPermissionScope>>();
    for (const row of rows) {
      const permissions = byForm.get(row.formId) ?? new Map<string, ProcessPermissionScope>();
      if (row.code && row.scope) permissions.set(row.code, row.scope);
      byForm.set(row.formId, permissions);
    }
    const grants = new ProcessGrants(actor.sub, fullAccess, byForm);
    this.cache.set(key, { grants, expiresAt: Date.now() + GRANTS_TTL_MS });
    return grants;
  }

  /** Esquece o que foi carregado (de uma pessoa, ou de todas). */
  invalidate(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) this.cache.delete(key);
    }
  }

  async scopeIn(actor: AccessActor, formId: string, code: string): Promise<ProcessScope> {
    return (await this.grantsOf(actor)).scope(formId, code);
  }

  async hasInProcess(actor: AccessActor, formId: string, code: string): Promise<boolean> {
    return (await this.scopeIn(actor, formId, code)) !== 'none';
  }

  /** Para a rota que não tem processo no caminho: tem o código em algum processo? */
  async hasAnywhere(actor: AccessActor, code: string): Promise<boolean> {
    return (await this.grantsOf(actor)).hasAnywhere(code);
  }

  /**
   * Permissões da sessão: as de sistema vêm do perfil; as de processo, do maior escopo entre os
   * vínculos (é o que decide menus e botões que não sabem de qual processo se trata). Os códigos
   * antigos entram também, para as telas que ainda os perguntam.
   */
  async sessionPermissions(actor: AccessActor): Promise<{
    permissions: Record<string, PermissionScope>;
    processPermissions: Record<string, Record<string, ProcessPermissionScope>>;
    processesFullAccess: boolean;
  }> {
    const [rolePermissions, grants] = await Promise.all([
      this.permissions.getAllForRole(actor.role),
      this.grantsOf(actor),
    ]);
    const permissions: Record<string, PermissionScope> = {};
    for (const [code, scope] of Object.entries(rolePermissions)) {
      if (!isProcessPermission(code)) permissions[code] = scope;
    }
    for (const code of [...PROCESS_PERMISSION_CODES, ...Object.keys(PROCESS_PERMISSION_ALIASES)]) {
      let best: ProcessScope = 'none';
      if (grants.fullAccess) best = 'all';
      else {
        for (const formId of Object.keys(grants.toRecord())) {
          const scope = grants.scope(formId, code);
          if (scope === 'all') {
            best = 'all';
            break;
          }
          if (scope === 'own') best = 'own';
        }
      }
      if (best !== 'none') permissions[code] = best;
    }
    return {
      permissions,
      processPermissions: grants.fullAccess ? {} : grants.toRecord(),
      processesFullAccess: grants.fullAccess,
    };
  }

  // ─── Processo (formulário) ────────────────────────────────────────────────

  async canAccessForm(form: FormAccessTarget, actor: AccessActor, permissionCode: string): Promise<boolean> {
    return this.hasInProcess(actor, form.id, permissionCode);
  }

  /** Carrega o formulário e exige um dos códigos (basta um). 404 se não existe, 403 se não dá. */
  async assertFormAccess(
    formId: string,
    actor: AccessActor,
    permissionCodes: string | readonly string[],
  ): Promise<FormEntity> {
    const form = await this.loadForm(formId);
    const grants = await this.grantsOf(actor);
    for (const code of toList(permissionCodes)) {
      if (grants.scope(form.id, code) !== 'none') return form;
    }
    throw new ForbiddenException(DENIED);
  }

  /**
   * Leitura da configuração do processo (fases, ajustes do Kanban, perguntas padrão): quem tem vínculo,
   * ou quem tem um card dele ao alcance (o solicitante vê a linha do tempo do próprio pedido).
   */
  async assertProcessVisible(formId: string, actor: AccessActor): Promise<FormEntity> {
    const form = await this.loadForm(formId);
    const grants = await this.grantsOf(actor);
    if (grants.isMember(formId)) return form;
    if (await this.hasOwnCardInForm(formId, actor)) return form;
    throw new ForbiddenException(DENIED);
  }

  /** `assertProcessVisible` para cada formulário (sem repetir). Lista vazia passa. */
  async assertProcessesVisible(formIds: Iterable<string>, actor: AccessActor): Promise<void> {
    for (const formId of new Set(formIds)) {
      await this.assertProcessVisible(formId, actor);
    }
  }

  /** Formulário de uma resposta: exige o código no processo dela. */
  async assertSubmissionAccess(
    submissionId: string,
    actor: AccessActor,
    permissionCode: string,
  ): Promise<SubmissionEntity> {
    const submission = await this.submissionsRepository.findOne({
      where: { id: submissionId },
      select: { id: true, formId: true },
    });
    if (!submission) throw new NotFoundException('Resposta não encontrada.');
    await this.assertFormAccess(submission.formId, actor, permissionCode);
    return submission;
  }

  /**
   * Abrir UMA resposta: quem vê as respostas do processo ou quem lê o card que nasceu dela (vê a
   * solicitação, ou foi chamado a aprovar algo nela) — o modal da fase e a tela de aprovação do tablet
   * buscam a resposta por aqui.
   */
  async assertSubmissionReadable(
    submission: { id: string; formId: string },
    actor: AccessActor,
  ): Promise<void> {
    await this.loadForm(submission.formId);
    const grants = await this.grantsOf(actor);
    const cards = await this.solicitationsRepository.find({ where: { submissionId: submission.id } });
    if (grants.scope(submission.formId, 'responses.view') !== 'none') {
      // Quem vê as respostas do processo não abre a de um card que o filtro da fase esconde dele.
      let hidden = false;
      for (const card of cards) {
        if (await this.cardFilter.hides(card, actor, grants)) hidden = true;
      }
      if (!hidden) return;
    }

    for (const card of cards) {
      if (await this.canAccessSolicitation(card, actor, 'solicitations.view')) return;
      if (await this.isApproverOf(card.id, actor)) return;
    }
    throw new ForbiddenException(DENIED);
  }

  /** Lista de formulários: só os processos em que a pessoa tem o código (ou todos, com acesso total). */
  applyFormScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    grants: ProcessGrants,
    formIdExpression = 'form.id',
    code = 'forms.view',
  ): void {
    if (grants.fullAccess) return;
    const { all, own } = grants.formIds(code);
    const ids = [...all, ...own];
    if (ids.length === 0) {
      qb.andWhere('1 = 0');
      return;
    }
    const param = `scopeFormIds${Math.random().toString(36).slice(2, 8)}`;
    qb.andWhere(`${formIdExpression} IN (:...${param})`, { [param]: ids });
  }

  // ─── Solicitação (card) ───────────────────────────────────────────────────

  /**
   * Regra do card: com acesso total, tudo. Num processo, o escopo do vínculo: 'all' = todos os cards,
   * 'own' = os que a pessoa abriu ou dos quais é responsável. Ver o próprio pedido não depende de
   * vínculo. Card sem processo: só o próprio. Agir (qualquer código além de ver) pede também ver.
   * Por cima disso, o filtro de cards da fase pela resposta esconde o card de quem ele não é.
   */
  async canAccessSolicitation(
    solicitation: SolicitationAccessTarget,
    actor: AccessActor,
    permissionCode: string,
  ): Promise<boolean> {
    const grants = await this.grantsOf(actor);
    if (!cardAllowed(grants, solicitation, actor.sub, permissionCode)) return false;
    if (!solicitation.id) return true;
    return !(await this.cardFilter.hides(solicitation as CardFilterTarget, actor, grants));
  }

  /** Cards escondidos da pessoa pelo filtro das fases (para as listas). Ver `CardFilterService`. */
  async hiddenCards(actor: AccessActor, formId?: string): Promise<Array<{ id: string; submissionId: string | null }>> {
    return this.cardFilter.hiddenCards(actor, await this.grantsOf(actor), formId);
  }

  /** Versão que lança 403 — para quem já carregou o card. */
  async assertCanAccessSolicitation(
    solicitation: SolicitationAccessTarget,
    actor: AccessActor,
    permissionCode: string,
  ): Promise<void> {
    if (!(await this.canAccessSolicitation(solicitation, actor, permissionCode))) {
      throw new ForbiddenException(DENIED);
    }
  }

  /** Se a pessoa enxerga o card. Card inexistente = não. */
  canSeeSolicitation(solicitationId: string, actor: AccessActor): Promise<boolean> {
    return this.canOnSolicitation(solicitationId, actor, 'solicitations.view');
  }

  /** Se a pessoa tem o código no card (carregando-o). Card inexistente = não. */
  async canOnSolicitation(solicitationId: string, actor: AccessActor, permissionCode: string): Promise<boolean> {
    const solicitation = await this.solicitationsRepository.findOne({ where: { id: solicitationId } });
    if (!solicitation) return false;
    return this.canAccessSolicitation(solicitation, actor, permissionCode);
  }

  /** Carrega o card e exige o código. 404 se não existe, 403 se não dá. */
  async assertSolicitationAccess(
    solicitationId: string,
    actor: AccessActor,
    permissionCode: string,
  ): Promise<SolicitationEntity> {
    const solicitation = await this.loadSolicitation(solicitationId);
    await this.assertCanAccessSolicitation(solicitation, actor, permissionCode);
    return solicitation;
  }

  /**
   * Se a pessoa foi chamada a aprovar algo no card (por nome ou pelo perfil). Vale mesmo sem vínculo
   * com o processo: é o que abre a aprovação, o card para leitura e os anexos dele.
   */
  isApproverOfSolicitation(solicitationId: string, actor: AccessActor): Promise<boolean> {
    return this.isApproverOf(solicitationId, actor);
  }

  /** Leitura do card por quem vê a solicitação ou por quem foi chamado a aprovar algo nela. */
  async assertSolicitationReadable(solicitationId: string, actor: AccessActor): Promise<SolicitationEntity> {
    const solicitation = await this.loadSolicitation(solicitationId);
    if (await this.canAccessSolicitation(solicitation, actor, 'solicitations.view')) return solicitation;
    if (await this.isApproverOf(solicitationId, actor)) return solicitation;
    throw new ForbiddenException(DENIED);
  }

  /** Mesma regra de `canAccessSolicitation('solicitations.view')`, em lista. */
  async applySolicitationScope(
    qb: SelectQueryBuilder<SolicitationEntity>,
    actor: AccessActor,
    alias = 'solicitation',
  ): Promise<void> {
    this.applySolicitationScopeWith(qb as unknown as SelectQueryBuilder<ObjectLiteral>, await this.grantsOf(actor), alias);
  }

  /** Versão sem banco, para quem já tem as permissões da pessoa e monta várias consultas. */
  applySolicitationScopeWith<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    grants: ProcessGrants,
    alias = 'solicitation',
  ): void {
    if (grants.fullAccess) return;
    const formIds = grants.formIds('solicitations.view').all;
    const conditions = [`${alias}.created_by = :scopeActorId`, `${alias}.assignee_id = :scopeActorId`];
    const params: Record<string, unknown> = { scopeActorId: grants.userId };
    if (formIds.length > 0) {
      conditions.push(`${alias}.form_id IN (:...scopeAllFormIds)`);
      params.scopeAllFormIds = formIds;
    }
    qb.andWhere(`(${conditions.join(' OR ')})`, params);
  }

  // ─── Anexo ────────────────────────────────────────────────────────────────

  /**
   * Quem pode ler um anexo: o do card segue a leitura do card; o que só tem resposta segue as respostas
   * do processo. Anexo solto, sem nenhum dos dois, só de quem enviou.
   */
  async assertAttachmentReadable(
    attachment: Pick<AttachmentEntity, 'solicitationId' | 'submissionId' | 'uploadedByUserId'>,
    actor: AccessActor,
  ): Promise<void> {
    if (attachment.solicitationId) {
      await this.assertSolicitationReadable(attachment.solicitationId, actor);
      return;
    }
    if (attachment.submissionId) {
      await this.assertSubmissionAccess(attachment.submissionId, actor, 'responses.view');
      return;
    }
    if (attachment.uploadedByUserId !== actor.sub) throw new ForbiddenException(DENIED);
  }

  // ─── Vínculos ─────────────────────────────────────────────────────────────

  /**
   * Quem cria o processo vira membro completo dele. Dentro da transação de quem cria (formulário,
   * fases e fluxos da LOPS IA nascem juntos).
   */
  async grantCreator(manager: EntityManager, formId: string, userId: string): Promise<void> {
    await this.writeMember(manager, formId, userId, FULL_PROCESS_GRANTS, userId);
  }

  /**
   * Cria o vínculo ou troca TODAS as permissões dele pelas informadas. Sem banco próprio: quem chama
   * decide a transação. Códigos fora do catálogo são recusados por quem valida a entrada.
   */
  async writeMember(
    manager: EntityManager,
    formId: string,
    userId: string,
    grants: Readonly<Record<string, ProcessPermissionScope>>,
    createdBy: string | null,
  ): Promise<FormMemberEntity> {
    const members = manager.getRepository(FormMemberEntity);
    const member =
      (await members.findOne({ where: { formId, userId } })) ??
      (await members.save(members.create({ formId, userId, createdBy })));
    const permissions = manager.getRepository(FormMemberPermissionEntity);
    await permissions.delete({ memberId: member.id });
    const rows = Object.entries(grants)
      .filter(([code]) => PROCESS_PERMISSION_CODES.has(code))
      .map(([permissionCode, scope]) =>
        permissions.create({
          memberId: member.id,
          permissionCode,
          scope: permissionCode === 'solicitations.view' && scope === 'own' ? 'own' : 'all',
        }),
      );
    if (rows.length > 0) await permissions.save(rows);
    this.invalidate(userId);
    return member;
  }

  /** Cria o vínculo só se a pessoa ainda não tiver um (não mexe no que já foi marcado). */
  async addMemberIfMissing(
    manager: EntityManager,
    formId: string,
    userId: string,
    grants: Readonly<Record<string, ProcessPermissionScope>>,
    createdBy: string | null,
  ): Promise<boolean> {
    const exists = await manager.getRepository(FormMemberEntity).exists({ where: { formId, userId } });
    if (exists) return false;
    await this.writeMember(manager, formId, userId, grants, createdBy);
    return true;
  }

  /** Copia os vínculos (e as permissões) de um processo para outro — a duplicação de processo. */
  async copyMembers(manager: EntityManager, fromFormId: string, toFormId: string): Promise<void> {
    const members = await manager.getRepository(FormMemberEntity).find({
      where: { formId: fromFormId },
      relations: { permissions: true },
    });
    for (const member of members) {
      const grants = Object.fromEntries(member.permissions.map((p) => [p.permissionCode, p.scope]));
      await this.writeMember(manager, toFormId, member.userId, grants, member.createdBy);
    }
  }

  async removeMember(manager: EntityManager, formId: string, userId: string): Promise<boolean> {
    const result = await manager.getRepository(FormMemberEntity).delete({ formId, userId });
    this.invalidate(userId);
    return (result.affected ?? 0) > 0;
  }

  /** Decisão 5: anexa pessoas quem tem acesso total ou "gerenciar acesso" naquele processo. */
  async canManageAccess(actor: AccessActor, formId: string): Promise<boolean> {
    return (await this.scopeIn(actor, formId, 'process.access.manage')) === 'all';
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private async loadForm(formId: string): Promise<FormEntity> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    return form;
  }

  private async loadSolicitation(solicitationId: string): Promise<SolicitationEntity> {
    const solicitation = await this.solicitationsRepository.findOne({ where: { id: solicitationId } });
    if (!solicitation) throw new NotFoundException('Solicitacao nao encontrada.');
    return solicitation;
  }

  /** Card do processo que a pessoa abriu ou do qual é responsável. */
  private hasOwnCardInForm(formId: string, actor: AccessActor): Promise<boolean> {
    return this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .where('solicitation.form_id = :formId', { formId })
      .andWhere('(solicitation.created_by = :actorId OR solicitation.assignee_id = :actorId)', {
        actorId: actor.sub,
      })
      .getExists();
  }

  private isApproverOf(solicitationId: string, actor: AccessActor): Promise<boolean> {
    return this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .innerJoin('approvals', 'approval', 'approval.solicitation_id = solicitation.id')
      .innerJoin('approval_steps', 'step', 'step.approval_id = approval.id')
      .where('solicitation.id = :solicitationId', { solicitationId })
      .andWhere('(step.assigned_user_id = :actorId OR step.assigned_role_code = :actorRole)', {
        actorId: actor.sub,
        actorRole: actor.role,
      })
      .getExists();
  }
}

/** A regra do card, sem banco (ver `canAccessSolicitation`). */
export function cardAllowed(
  grants: ProcessGrants,
  card: SolicitationAccessTarget,
  actorId: string,
  permissionCode: string,
): boolean {
  if (grants.fullAccess) return true;
  const mine = card.createdBy === actorId || card.assigneeId === actorId;
  if (!card.formId) return mine;

  const view = grants.scope(card.formId, 'solicitations.view');
  const canView = view === 'all' || mine;
  if (permissionCode === 'solicitations.view') return canView;
  if (!canView) return false;
  return grants.scope(card.formId, permissionCode) !== 'none';
}

function toList(codes: string | readonly string[]): readonly string[] {
  return typeof codes === 'string' ? [codes] : codes;
}
