import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { DataSource, In, Repository } from 'typeorm';
import {
  AreaEntity,
  AuditEventEntity,
  FlowEntity,
  FormEntity,
  FormVersionEntity,
  ItemListEntity,
  RoleEntity,
  UserEntity,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { FlowsService } from '../flows/flows.service';
import { CreateFormDto } from '../forms/dto/create-form.dto';
import { FormsService } from '../forms/forms.service';
import { SaveKanbanPhasesDto } from '../kanban-phases/dto/save-kanban-phases.dto';
import { KanbanPhasesService } from '../kanban-phases/kanban-phases.service';
import { normalizeKanbanSettings } from '../kanban-phases/kanban-settings';
import { PermissionsService } from '../roles/permissions.service';
import { blueprintFlowToDto, blueprintToFormDto, blueprintToPhasesDto } from './blueprint/blueprint-to-dtos';
import { processToBlueprint } from './blueprint/process-to-blueprint';
import type { BlueprintCheck, BlueprintIssue, ProcessBlueprint } from './blueprint/process-blueprint.types';
import { normalizeBlueprint } from './blueprint/normalize-blueprint';
import { collectBlueprintEmails, validateBlueprint, type BlueprintContext } from './blueprint/validate-blueprint';

export type ProcessCreationResult = {
  processId: string;
  name: string;
  status: 'draft';
  builderUrl: string;
  created: { sections: number; fields: number; phases: number; phaseFields: number; flows: number };
  flows: Array<{ id: string; name: string }>;
  warnings: BlueprintIssue[];
  pending: string[];
  replayed?: boolean;
  adjusted?: BlueprintIssue[];
};

const CREATED_ACTION = 'lops_ai.process_created';

/**
 * Criar processo pela LOPS IA: confere o processo inteiro (validateBlueprint + as mesmas regras
 * dos DTOs e do motor de fluxos) e grava formulário, fases, configuração do Kanban e fluxos numa
 * transação só — ou tudo, ou nada. Sempre como rascunho e sempre com as permissões da pessoa.
 */
@Injectable()
export class ProcessBuilderService {
  private readonly logger = new Logger(ProcessBuilderService.name);
  /** Duas chamadas com a mesma chave ao mesmo tempo: a segunda espera a primeira. */
  private readonly inFlight = new Map<string, Promise<ProcessCreationResult>>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly formsService: FormsService,
    private readonly kanbanPhasesService: KanbanPhasesService,
    private readonly flowsService: FlowsService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(AreaEntity) private readonly areasRepository: Repository<AreaEntity>,
    @InjectRepository(ItemListEntity) private readonly itemListsRepository: Repository<ItemListEntity>,
    @InjectRepository(FlowEntity) private readonly flowsRepository: Repository<FlowEntity>,
    @InjectRepository(FormVersionEntity) private readonly versionsRepository: Repository<FormVersionEntity>,
    @InjectRepository(AuditEventEntity) private readonly auditRepository: Repository<AuditEventEntity>,
  ) {}

  async check(raw: unknown, actor: JwtPayload): Promise<BlueprintCheck> {
    const { blueprint: input, adjusted } = normalizeBlueprint(raw);
    const ctx = await this.loadContext(input);
    const result = validateBlueprint(input, ctx);
    result.errors.push(...(await this.permissionIssues(input, actor)));

    // Só com o processo coerente vale converter e passar pelas regras dos DTOs e dos fluxos.
    if (result.errors.length === 0) {
      const bp = input as ProcessBlueprint;
      result.errors.push(...(await this.dtoIssues(bp, actor, ctx)));
    }
    result.valid = result.errors.length === 0;
    if (adjusted.length) result.adjusted = adjusted;
    return result;
  }

  async create(
    raw: unknown,
    actor: JwtPayload,
    options: { idempotencyKey: string; dryRun: boolean },
  ): Promise<ProcessCreationResult | (BlueprintCheck & { dryRun: true })> {
    if (!options.dryRun) {
      const replay = await this.findReplay(actor.sub, options.idempotencyKey);
      if (replay) return { ...replay, replayed: true };
    }

    const input = normalizeBlueprint(raw).blueprint;
    const check = await this.check(raw, actor);
    if (!check.valid) {
      throw new UnprocessableEntityException({
        message: 'O processo tem problemas. Corrija e envie de novo — nada foi gravado.',
        ...check,
      });
    }
    if (options.dryRun) return { ...check, dryRun: true };

    const lockKey = `${actor.sub}:${options.idempotencyKey}`;
    const running = this.inFlight.get(lockKey);
    if (running) return { ...(await running), replayed: true };
    const job = this.persist(input as ProcessBlueprint, actor, options.idempotencyKey, check.warnings);
    this.inFlight.set(lockKey, job);
    try {
      const result = await job;
      return check.adjusted ? { ...result, adjusted: check.adjusted } : result;
    } finally {
      this.inFlight.delete(lockKey);
    }
  }

  async exportProcess(formId: string, actor: JwtPayload): Promise<ProcessBlueprint> {
    // findOne aplica o mesmo acesso da tela (área, responsável, perfil).
    const form = await this.formsService.findOne(formId, actor.sub);
    const version = await this.versionsRepository.findOneOrFail({
      where: { formId },
      order: { versionNumber: 'DESC' },
      relations: { sections: { fields: { options: true }, branches: true } },
    });
    const phases = await this.kanbanPhasesService.findByForm(formId);
    const flows = await this.flowsRepository.find({ where: { formId }, order: { createdAt: 'ASC' } });

    const userIds = new Set<string>();
    const collect = (ids: unknown): void => {
      if (Array.isArray(ids)) ids.forEach((id) => typeof id === 'string' && userIds.add(id));
    };
    for (const phase of phases) {
      collect(phase.actors?.userIds);
      collect(phase.approvers?.userIds);
      collect(phase.visibleTo?.userIds);
    }
    for (const flow of flows) {
      for (const node of flow.nodes ?? []) {
        const data = (node.data ?? {}) as Record<string, unknown>;
        collect(data.assignedUserIds);
        if (typeof data.userId === 'string') userIds.add(data.userId);
        for (const recipient of Array.isArray(data.recipients) ? data.recipients : []) {
          collect((recipient as { userIds?: unknown }).userIds);
        }
      }
    }
    const users = userIds.size ? await this.usersRepository.find({ where: { id: In([...userIds]) } }) : [];
    return processToBlueprint({
      form,
      version,
      phases,
      flows,
      emailByUserId: new Map(users.map((user) => [user.id, user.email])),
    });
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async persist(
    bp: ProcessBlueprint,
    actor: JwtPayload,
    idempotencyKey: string,
    warnings: BlueprintIssue[],
  ): Promise<ProcessCreationResult> {
    const ctx = await this.loadContext(bp);
    const actorUser = await this.usersRepository.findOneByOrFail({ id: actor.sub });
    const formDto = blueprintToFormDto(bp, actor.sub);
    const phasesDto = blueprintToPhasesDto(bp, ctx.userIdByEmail);
    const userIdsByRole = await this.userIdsByRole(bp);
    const flowWarnings: BlueprintIssue[] = [];

    const { form, phases, flows } = await this.dataSource.transaction(async (manager) => {
      const created = await this.formsService.createInTransaction(manager, formDto, actor.sub, {
        assignees: [actorUser],
      });
      const savedPhases = await this.kanbanPhasesService.saveInTransaction(manager, created.id, phasesDto);
      if (bp.kanban?.cardValueField) {
        await manager.update(FormEntity, created.id, {
          kanbanSettings: normalizeKanbanSettings({ cardValueField: bp.kanban.cardValueField }),
        });
      }

      const phaseIdByKey = new Map(savedPhases.map((phase) => [phase.key, phase.id]));
      const phaseLabelByKey = new Map(savedPhases.map((phase) => [phase.key, phase.label]));
      const reserved = new Set<string>();
      const savedFlows: FlowEntity[] = [];
      for (const flow of bp.flows ?? []) {
        const { dto, warnings: converted } = blueprintFlowToDto(flow, {
          formId: created.id,
          phaseIdByKey,
          phaseLabelByKey,
          userIdByEmail: ctx.userIdByEmail,
          userIdsByRole,
        });
        flowWarnings.push(...converted);
        const entity = await this.flowsService.prepareNewFlow(dto, actor.sub, reserved);
        savedFlows.push(await manager.save(FlowEntity, entity));
      }
      return { form: created, phases: savedPhases, flows: savedFlows };
    });

    this.formsService.emitFormCreated(form, actor.sub, [actorUser]);

    const formFields = formDto.sections.reduce((total, section) => total + section.fields.length, 0);
    const phaseFields = phases.reduce(
      (total, phase) => total + (phase.fields ?? []).filter((field) => field.fieldType !== 'title').length,
      0,
    );
    const frontend = (this.configService.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
    const result: ProcessCreationResult = {
      processId: form.id,
      name: form.name,
      status: 'draft',
      builderUrl: `${frontend}/builder?formId=${form.id}`,
      created: {
        sections: formDto.sections.length,
        fields: formFields,
        phases: phases.length,
        phaseFields,
        flows: flows.length,
      },
      flows: flows.map((flow) => ({ id: flow.id, name: flow.name })),
      warnings: [...warnings, ...flowWarnings],
      pending: bp.pending ?? [],
    };

    await this.auditService.log({
      actorId: actor.sub,
      module: 'ai',
      entity: 'form',
      entityId: form.id,
      action: CREATED_ACTION,
      payload: {
        via: 'lops_ai',
        idempotencyKey,
        result,
        sourceDocuments: bp.sourceDocuments ?? [],
      },
    });
    this.logger.log({ formId: form.id, actorId: actor.sub, flows: flows.length }, 'Processo criado pela LOPS IA');
    return result;
  }

  private async findReplay(actorId: string, idempotencyKey: string): Promise<ProcessCreationResult | null> {
    const event = await this.auditRepository
      .createQueryBuilder('event')
      .where('event.action = :action', { action: CREATED_ACTION })
      .andWhere('event.actorId = :actorId', { actorId })
      .andWhere("event.payload ->> 'idempotencyKey' = :key", { key: idempotencyKey })
      .orderBy('event.createdAt', 'DESC')
      .getOne();
    const result = (event?.payload as { result?: ProcessCreationResult } | null)?.result;
    return result ?? null;
  }

  private async loadContext(input: unknown): Promise<BlueprintContext> {
    const emails = collectBlueprintEmails(input);
    const [roles, areas, itemLists, users] = await Promise.all([
      this.rolesRepository.find({ select: { code: true } }),
      this.areasRepository.find({ where: { isActive: true }, select: { id: true } }),
      this.itemListsRepository.find({ where: { isActive: true }, select: { id: true } }),
      emails.length
        ? this.usersRepository
            .createQueryBuilder('user')
            .where('user.isActive = true')
            .andWhere('(LOWER(user.email) IN (:...emails) OR LOWER(user.googleAccountEmail) IN (:...emails))', { emails })
            .getMany()
        : Promise.resolve([] as UserEntity[]),
    ]);
    const userIdByEmail = new Map<string, string>();
    for (const user of users) {
      userIdByEmail.set(user.email.toLowerCase(), user.id);
      if (user.googleAccountEmail) userIdByEmail.set(user.googleAccountEmail.toLowerCase(), user.id);
    }
    return {
      roleCodes: new Set(roles.map((role) => role.code)),
      areaIds: new Set(areas.map((area) => area.id)),
      itemListIds: new Set(itemLists.map((list) => list.id)),
      userIdByEmail,
    };
  }

  private async userIdsByRole(bp: ProcessBlueprint): Promise<Map<string, string[]>> {
    const roles = new Set<string>();
    for (const flow of bp.flows ?? []) {
      for (const node of flow.nodes) {
        for (const entry of Array.isArray(node.data?.to) ? node.data.to : []) {
          const role = (entry as { role?: unknown } | null)?.role;
          if (typeof role === 'string') roles.add(role);
        }
      }
    }
    if (roles.size === 0) return new Map();
    const users = await this.usersRepository.find({ where: { role: In([...roles]), isActive: true }, select: { id: true, role: true } });
    const map = new Map<string, string[]>();
    for (const user of users) map.set(user.role, [...(map.get(user.role) ?? []), user.id]);
    return map;
  }

  /**
   * A IA nunca pode mais do que a pessoa. Criar processo é permissão do perfil; fases e fluxos do
   * processo novo vêm junto, porque quem cria vira dono completo dele.
   */
  private async permissionIssues(_input: unknown, actor: JwtPayload): Promise<BlueprintIssue[]> {
    const needed = ['forms.create'];
    const issues: BlueprintIssue[] = [];
    for (const code of needed) {
      if (!(await this.permissionsService.hasAny(actor.role, code))) {
        issues.push({ path: '', message: `Seu perfil não tem a permissão ${code}, necessária para criar este processo.` });
      }
    }
    return issues;
  }

  private async dtoIssues(bp: ProcessBlueprint, actor: JwtPayload, ctx: BlueprintContext): Promise<BlueprintIssue[]> {
    const issues: BlueprintIssue[] = [];
    const formErrors = await validate(plainToInstance(CreateFormDto, blueprintToFormDto(bp, actor.sub)), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    issues.push(...flattenValidation(formErrors, 'form'));
    const phaseErrors = await validate(plainToInstance(SaveKanbanPhasesDto, blueprintToPhasesDto(bp, ctx.userIdByEmail)), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    issues.push(...flattenValidation(phaseErrors, 'phases'));

    // Aviso "para o perfil" vira a lista de pessoas do perfil: perfil sem ninguém ativo não avisa ninguém.
    const userIdsByRole = await this.userIdsByRole(bp);
    const flowsWithEmptyRole = new Set<number>();
    (bp.flows ?? []).forEach((flow, fi) => {
      flow.nodes.forEach((node, ni) => {
        if (node.type !== 'action_notification') return;
        (Array.isArray(node.data?.to) ? node.data.to : []).forEach((entry, ti) => {
          const role = (entry as { role?: unknown } | null)?.role;
          if (typeof role !== 'string' || userIdsByRole.get(role)?.length) return;
          flowsWithEmptyRole.add(fi);
          issues.push({
            path: `flows[${fi}].nodes[${ni}].data.to[${ti}]`,
            message: `O perfil "${role}" não tem nenhuma pessoa ativa: ninguém receberia este aviso. Use outro perfil, pessoas por e-mail ({ "users": [...] }), "responsible" ou "requester", ou registre em pending.`,
          });
        });
      });
    });

    // Fluxos passam pelas mesmas regras do editor, com ids provisórios para as fases.
    const phaseIdByKey = new Map(bp.phases.map((phase) => [phase.key, `fase:${phase.key}`]));
    (bp.flows ?? []).forEach((flow, index) => {
      const { dto } = blueprintFlowToDto(flow, {
        formId: 'novo-processo',
        phaseIdByKey,
        phaseLabelByKey: new Map(bp.phases.map((phase) => [phase.key, phase.label])),
        userIdByEmail: ctx.userIdByEmail,
        userIdsByRole,
      });
      try {
        this.flowsService.assertValidFlowStructure(dto.nodes ?? [], dto.edges ?? []);
      } catch (error) {
        // O aviso sem destinatário já foi explicado acima, pelo perfil.
        if (!flowsWithEmptyRole.has(index)) issues.push({ path: `flows[${index}]`, message: (error as Error).message });
      }
    });
    return issues;
  }
}

function flattenValidation(errors: ValidationError[], base: string): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  const walk = (list: ValidationError[], path: string): void => {
    for (const error of list) {
      const here = /^\d+$/.test(error.property) ? `${path}[${error.property}]` : `${path}.${error.property}`;
      for (const message of Object.values(error.constraints ?? {})) issues.push({ path: here, message });
      if (error.children?.length) walk(error.children, here);
    }
  };
  walk(errors, base);
  return issues;
}
