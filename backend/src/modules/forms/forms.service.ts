import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import {
  FormArchivedEvent,
  FormCreatedEvent,
  FormDuplicatedEvent,
  FormPublishedEvent,
  FormStatusChangedEvent,
  FormUpdatedEvent,
} from '../../common/events/form-events';
import {
  AreaEntity,
  FormEntity,
  FormVersionEntity,
  KanbanPhaseEntity,
  UserEntity,
} from '../../database/entities';
import { describeScoreRange, getScoreRanges } from '../../common/formula/score-ranges';
import { ErpConnectorEntity } from '../../database/entities/erp-connector.entity';
import { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import type { FormGoogleSheetsStatusResponse } from '../google-workspace/types/google-workspace.types';
import { parseErpLookupSettings } from '../integrations/erp/lookup/erp-lookup.settings';
import { copyKanbanPhases, createDefaultKanbanPhases } from '../kanban-phases/default-kanban-phases';
import { ErpTableFieldService } from '../integrations/erp/lookup/erp-table-field.service';
import { ProcessAccessService } from '../access/process-access.service';
import { PROCESS_ACCESS_PRESETS } from '../../common/constants/process-permission-catalog';
import type { PublicFormResponse } from './public-forms.service';
import { FormListItemDto } from './dto/form-list-item.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { QueryFormsDto } from './dto/query-forms.dto';
import { UpdateFormStatusDto } from './dto/update-form-status.dto';
import { UpdateFormAppearanceDto } from './dto/update-form-appearance.dto';
import type { FormAppearance } from '../../database/entities/form.entity';
import { canTransitionFormStatus, hasOrphanedSectionRules } from './form-definition.utils';
import {
  downloadFieldsWithoutFile,
  InvalidDownloadFileError,
  normalizeDownloadFields,
  parseDownloadFile,
} from './form-download';
import { downloadFileExists } from './form-download.service';
import { FormMapper } from './infrastructure/form.mapper';
import { FormVersionWriter } from './form-version.writer';
import { FormListQuery } from './form-list.query';
import { PublicFormsService } from './public-forms.service';
import { ItemListsService } from '../item-lists/item-lists.service';
import { ItemOrderFieldService } from '../item-lists/item-order-field.service';

@Injectable()
export class FormsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly googleWorkspaceService: GoogleWorkspaceService,
    private readonly versionWriter: FormVersionWriter,
    private readonly formListQuery: FormListQuery,
    private readonly publicFormsService: PublicFormsService,
    private readonly processAccess: ProcessAccessService,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly erpTableFields: ErpTableFieldService,
    private readonly itemLists: ItemListsService,
    private readonly itemOrderFields: ItemOrderFieldService,
  ) {}

  /** A regra é a do ProcessAccessService (atribuição vence; senão escopo do perfil). */
  private async assertAccess(
    form: FormEntity,
    actor: UserEntity,
    permissionCode: string,
  ): Promise<void> {
    const granted = await this.processAccess.canAccessForm(
      form,
      { sub: actor.id, role: actor.role, areaId: actor.areaId },
      permissionCode,
    );
    if (!granted) throw new ForbiddenException('Acesso negado.');
  }

  /**
   * "Pessoas atribuídas" do Criador viram vínculo com o processo: quem entra ganha o modelo Operador
   * (as caixinhas se ajustam depois, na tela de acesso); quem sai perde o vínculo. Quem já tinha
   * vínculo não é mexido, e o criador nunca sai por aqui.
   */
  private async syncAssigneeMembers(
    manager: EntityManager,
    formId: string,
    before: readonly string[],
    after: readonly UserEntity[],
    actorId: string,
    creatorId: string | null = actorId,
  ): Promise<void> {
    const afterIds = new Set(after.map((user) => user.id));
    const beforeIds = new Set(before);
    const operator = PROCESS_ACCESS_PRESETS.find((preset) => preset.key === 'operador');
    for (const userId of afterIds) {
      if (beforeIds.has(userId) || userId === creatorId) continue;
      await this.processAccess.addMemberIfMissing(manager, formId, userId, operator?.grants ?? {}, actorId);
    }
    for (const userId of beforeIds) {
      if (afterIds.has(userId) || userId === creatorId) continue;
      await this.processAccess.removeMember(manager, formId, userId);
    }
  }

  private async findActorOrFail(actorId: string): Promise<UserEntity> {
    const actor = await this.usersRepository.findOne({ where: { id: actorId } });
    if (!actor) throw new NotFoundException('Usuario autenticado nao encontrado.');
    return actor;
  }

  /**
   * Resolve os ids recebidos em usuarios ativos. Ids repetidos sao colapsados e
   * qualquer id invalido derruba a operacao inteira — atribuir acesso a metade
   * das pessoas pedidas seria pior do que recusar.
   */
  private async resolveAssignees(assignedUserIds?: string[] | null): Promise<UserEntity[]> {
    const uniqueIds = [...new Set(assignedUserIds ?? [])].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const users = await this.usersRepository.find({
      where: { id: In(uniqueIds), isActive: true },
    });
    if (users.length !== uniqueIds.length) {
      const found = new Set(users.map((user) => user.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Usuario atribuido nao encontrado: ${missing.join(', ')}.`);
    }
    return users;
  }

  private async findFormForActor(id: string, actor: UserEntity): Promise<FormEntity> {
    const form = await this.formsRepository.findOne({
      where: { id },
      relations: {
        createdByUser: true,
        versions: { sections: { fields: { options: true }, branches: true } },
      },
      order: {
        versions: {
          versionNumber: 'DESC',
          sections: {
            order: 'ASC',
            fields: { order: 'ASC', options: { order: 'ASC' } },
            branches: { order: 'ASC' },
          },
        },
      },
    });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    await this.assertAccess(form, actor, 'forms.view');
    return form;
  }

  private async findMutableFormForActor(
    manager: EntityManager,
    id: string,
    actor: UserEntity,
  ): Promise<FormEntity> {
    const form = await manager.findOne(FormEntity, {
      where: { id },
      relations: { versions: true },
    });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    await this.assertAccess(form, actor, 'forms.edit');
    return form;
  }

  async create(dto: CreateFormDto, actorId: string): Promise<FormEntity> {
    const assignees = await this.resolveAssignees(dto.assignedUserIds);
    const actorGoogleUserId = dto.googleSheets?.enabled
      ? await this.googleWorkspaceService.findConnectedGoogleUserId(actorId)
      : null;

    const form = await this.dataSource.transaction(async (manager) => {
      const f = await this.createInTransaction(manager, dto, actorId, {
        assignees,
        googleLinkedUserId: actorGoogleUserId,
      });
      await createDefaultKanbanPhases(manager, f.id);
      return f;
    });

    this.emitFormCreated(form, actorId, assignees);
    await this.googleWorkspaceService.autoCreateSpreadsheetIfNeeded(form.id, actorId);
    return this.findOne(form.id, actorId);
  }

  /**
   * Formulário + 1ª versão dentro de uma transação de quem chama — a criação de processo pela
   * LOPS IA grava formulário, fases e fluxos juntos. Não cria as fases padrão nem emite eventos:
   * quem chama faz isso depois do commit (emitFormCreated).
   */
  async createInTransaction(
    manager: EntityManager,
    dto: CreateFormDto,
    actorId: string,
    options: { assignees: UserEntity[]; googleLinkedUserId?: string | null },
  ): Promise<FormEntity> {
    normalizeDownloadFieldsOrFail(dto);
    const form = await manager.save(
      manager.create(FormEntity, {
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        area: dto.area ?? null,
        areaId: dto.areaId ?? null,
        createdBy: actorId,
        status: FormStatus.DRAFT,
        googleSheetsEnabled: dto.googleSheets?.enabled ?? false,
        googleSheetsAutoCreate: dto.googleSheets?.autoCreateOnSave ?? false,
        googleLinkedUserId: options.googleLinkedUserId ?? null,
      }),
    );
    await this.versionWriter.createVersionFromDto(manager, form.id, 1, dto);
    await this.itemLists.syncFormFields(manager, form.id);
    await this.syncAssigneeMembers(manager, form.id, [], options.assignees, actorId);
    // Quem cria vira membro completo do processo (por último: vale mesmo se também veio como atribuído).
    await this.processAccess.grantCreator(manager, form.id, actorId);
    return form;
  }

  emitFormCreated(form: FormEntity, actorId: string, assignees: UserEntity[]): void {
    this.eventEmitter.emit(
      'forms.created',
      new FormCreatedEvent(
        actorId,
        form.id,
        form.name,
        assignees.map((user) => user.id),
        form.googleSheetsEnabled,
      ),
    );
  }

  async update(id: string, dto: CreateFormDto, actorId: string): Promise<FormEntity> {
    normalizeDownloadFieldsOrFail(dto);
    const actor = await this.findActorOrFail(actorId);
    // `assignedUserIds` só vale na criação: num processo já salvo, quem tem acesso muda em
    // "Pessoas com acesso" (vínculos), não pelo Salvar do Criador.
    const actorGoogleUserId = dto.googleSheets?.enabled
      ? await this.googleWorkspaceService.findConnectedGoogleUserId(actorId)
      : null;

    await this.dataSource.transaction(async (manager) => {
      const form = await this.findMutableFormForActor(manager, id, actor);

      form.name = dto.name;
      form.description = dto.description ?? null;
      form.category = dto.category ?? null;
      form.area = dto.area ?? null;
      if (dto.areaId !== undefined) form.areaId = dto.areaId ?? null;
      form.status = FormStatus.DRAFT;
      form.googleSheetsEnabled = dto.googleSheets?.enabled ?? form.googleSheetsEnabled;
      form.googleSheetsAutoCreate =
        dto.googleSheets?.autoCreateOnSave ?? form.googleSheetsAutoCreate;
      if (form.googleSheetsEnabled && actorGoogleUserId)
        form.googleLinkedUserId = actorGoogleUserId;
      await manager.save(form);
      await this.versionWriter.applyVersionUpdate(manager, form, dto);
      // Campos ligados a uma lista de itens ficam com as opções da lista como ela está agora.
      await this.itemLists.syncFormFields(manager, form.id);
    });

    this.eventEmitter.emit('forms.updated', new FormUpdatedEvent(actorId, id, dto.name));
    await this.googleWorkspaceService.autoCreateSpreadsheetIfNeeded(id, actorId);
    return this.findOne(id, actorId);
  }

  async findAll(
    query: QueryFormsDto,
    actorId: string,
  ): Promise<PaginatedResponseDto<FormListItemDto>> {
    return this.formListQuery.execute(query, await this.findActorOrFail(actorId));
  }

  /**
   * Opções das listas suspensas "Categoria" e "Área" do Criador: as categorias que algum processo
   * já usa e as áreas ativas do cadastro (Administração › Áreas). São só rótulos — o processo
   * continua guardando o texto, e nada aqui mexe em quem enxerga o quê.
   */
  async findClassificationOptions(): Promise<{ categories: string[]; areas: string[] }> {
    const [categoryRows, areaRows] = await Promise.all([
      this.formsRepository
        .createQueryBuilder('form')
        .select('DISTINCT TRIM(form.category)', 'category')
        .where("form.category IS NOT NULL AND TRIM(form.category) <> ''")
        .getRawMany<{ category: string }>(),
      this.dataSource
        .getRepository(AreaEntity)
        .find({ where: { isActive: true }, select: { name: true } }),
    ]);
    return {
      categories: sortLabels(categoryRows.map((row) => row.category)),
      areas: sortLabels(areaRows.map((area) => area.name)),
    };
  }

  async findOne(id: string, actorId: string): Promise<FormEntity> {
    const actor = await this.findActorOrFail(actorId);
    return this.findFormForActor(id, actor);
  }

  async findPublicOne(id: string): Promise<PublicFormResponse> {
    return this.publicFormsService.findPublicOne(id);
  }

  async updateStatus(id: string, dto: UpdateFormStatusDto, actorId: string): Promise<FormEntity> {
    if (dto.status === FormStatus.PUBLISHED) {
      await this.assertErpTableSourcesReady(id);
    }

    await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(FormEntity)
        .createQueryBuilder('form')
        .setLock('pessimistic_write')
        .where('form.id = :id', { id })
        .getOne();
      if (!locked) throw new NotFoundException('Formulario nao encontrado.');

      const actor = await manager.findOne(UserEntity, { where: { id: actorId } });
      if (!actor) throw new NotFoundException('Usuario autenticado nao encontrado.');
      await this.assertAccess(locked, actor, 'forms.publish');

      if (dto.status !== FormStatus.PUBLISHED) {
        if (!canTransitionFormStatus(locked.status, dto.status)) {
          throw new BadRequestException(
            `Transição de status de '${locked.status}' para '${dto.status}' não é permitida.`,
          );
        }
        await manager.update(FormEntity, { id }, { status: dto.status });
        return;
      }

      const withVersions = await manager
        .getRepository(FormEntity)
        .createQueryBuilder('form')
        .where('form.id = :id', { id })
        .leftJoinAndSelect('form.versions', 'v')
        .leftJoinAndSelect('v.sections', 's')
        .leftJoinAndSelect('s.fields', 'f')
        .leftJoinAndSelect('f.options', 'o')
        .leftJoinAndSelect('s.branches', 'b')
        .getOne();

      if (!withVersions) throw new NotFoundException('Formulário não encontrado.');

      const latestVersion = [...withVersions.versions].sort(
        (a, b) => b.versionNumber - a.versionNumber,
      )[0];
      if (latestVersion && hasOrphanedSectionRules(latestVersion.sections)) {
        throw new BadRequestException(
          'Este formulário tem regras de fluxo órfãs (campo, opção ou seção removidos). Corrija ou remova antes de publicar.',
        );
      }
      if (latestVersion) {
        await this.assertErpLookupFieldsReady(manager, latestVersion);
        await this.erpTableFields.assertStructureReady(manager, latestVersion);
        await this.itemOrderFields.assertFieldsReady(manager, latestVersion);
        await this.assertScoreRangePhasesReady(manager, id, latestVersion);
        await assertDownloadFieldsReady(latestVersion);
      }

      const aggregate = FormMapper.toDomain(withVersions);
      try {
        aggregate.publishLatestVersion();
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : String(err));
      }

      await manager.update(FormEntity, { id }, { status: aggregate.status });
      for (const v of aggregate.versions) {
        await manager.update(
          FormVersionEntity,
          { id: v.id },
          { isPublished: v.isPublished, publishedAt: v.publishedAt },
        );
      }
    });

    if (dto.status === FormStatus.PUBLISHED) {
      this.eventEmitter.emit('forms.published', new FormPublishedEvent(actorId, id));
    } else {
      this.eventEmitter.emit(
        'forms.status_changed',
        new FormStatusChangedEvent(actorId, id, dto.status),
      );
    }
    return this.findOne(id, actorId);
  }

  /** Mesma conferência do `updateAppearance`: quem não edita este processo não envia arquivo dele. */
  async assertCanEdit(id: string, actorId: string): Promise<void> {
    const actor = await this.findActorOrFail(actorId);
    const form = await this.formsRepository.findOne({ where: { id } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    await this.assertAccess(form, actor, 'forms.edit');
  }

  /**
   * Rascunho pode ter campo "Lista do ERP" ainda sem conector/lista (está sendo montado);
   * publicado, não: quem preenchesse daria com o campo quebrado.
   */
  private async assertErpLookupFieldsReady(
    manager: EntityManager,
    version: FormVersionEntity,
  ): Promise<void> {
    const erpFields = version.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.fieldType === FormFieldType.ERP_LOOKUP);

    for (const field of erpFields) {
      const settings = parseErpLookupSettings(field.settingsJson);
      const connector = settings
        ? await manager.findOne(ErpConnectorEntity, {
            where: { id: settings.erpConnectorId },
            select: { id: true, isActive: true },
          })
        : null;
      if (!connector?.isActive) {
        throw new BadRequestException(
          `O campo "${field.label}" (Lista do ERP) precisa de um conector de ERP ativo e de uma lista escolhida antes de publicar.`,
        );
      }
    }
  }

  /**
   * Faixas de pontuação de um campo calculado dizem em que fase o card nasce: cada fase precisa
   * existir e ser deste processo, senão o envio cairia na 1ª fase sem ninguém perceber.
   */
  private async assertScoreRangePhasesReady(
    manager: EntityManager,
    formId: string,
    version: FormVersionEntity,
  ): Promise<void> {
    const ranged = version.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.fieldType === FormFieldType.CALCULATED)
      .map((field) => ({ field, ranges: getScoreRanges(field.settingsJson) }))
      .filter(({ ranges }) => ranges.length > 0);
    if (ranged.length === 0) return;

    const phases = await manager.find(KanbanPhaseEntity, { where: { formId }, select: { id: true } });
    const phaseIds = new Set(phases.map((phase) => phase.id));
    for (const { field, ranges } of ranged) {
      const broken = ranges.find((range) => !range.phaseId || !phaseIds.has(range.phaseId));
      if (broken) {
        throw new BadRequestException(
          `A faixa "${describeScoreRange(broken)}" do cálculo "${field.label}" precisa de uma fase deste processo antes de publicar.`,
        );
      }
    }
  }

  /**
   * "Tabela dinâmica do ERP": confere na API erp-lookup (tabela, colunas, parâmetros) ANTES da
   * transação da publicação — não segurar conexão do Postgres esperando o ERP. As regras que
   * não dependem do ERP rodam antes também (mensagem certa para conector inativo) e de novo
   * dentro da transação.
   */
  private async assertErpTableSourcesReady(formId: string): Promise<void> {
    const form = await this.formsRepository
      .createQueryBuilder('form')
      .where('form.id = :formId', { formId })
      .leftJoinAndSelect('form.versions', 'v')
      .leftJoinAndSelect('v.sections', 's')
      .leftJoinAndSelect('s.fields', 'f')
      .getOne();
    const latestVersion = [...(form?.versions ?? [])].sort(
      (a, b) => b.versionNumber - a.versionNumber,
    )[0];
    const hasTable = latestVersion?.sections.some((section) =>
      section.fields.some((field) => field.fieldType === FormFieldType.ERP_TABLE),
    );
    if (!latestVersion || !hasTable) return;

    await this.erpTableFields.assertStructureReady(this.dataSource.manager, latestVersion);
    await this.erpTableFields.assertSourcesReady(latestVersion);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    const actor = await this.findActorOrFail(actorId);
    const form = await this.formsRepository.findOne({ where: { id } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    await this.assertAccess(form, actor, 'forms.publish');

    const previousStatus = form.status;
    form.status = FormStatus.ARCHIVED;
    await this.formsRepository.save(form);
    this.eventEmitter.emit('forms.archived', new FormArchivedEvent(actorId, id, previousStatus));
  }

  /** Cor e ícone do card. Não mexe na versão: é só a aparência do processo. */
  async updateAppearance(
    id: string,
    dto: UpdateFormAppearanceDto,
    actorId: string,
  ): Promise<FormAppearance> {
    const actor = await this.findActorOrFail(actorId);
    const form = await this.formsRepository.findOne({ where: { id } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    await this.assertAccess(form, actor, 'forms.edit');

    const appearance: FormAppearance = {
      color: dto.color !== undefined ? dto.color : (form.appearance?.color ?? null),
      icon: dto.icon !== undefined ? dto.icon : (form.appearance?.icon ?? null),
    };
    await this.formsRepository.update(id, { appearance });
    return appearance;
  }

  async duplicate(id: string, actorId: string): Promise<FormEntity> {
    const original = await this.findOne(id, actorId);
    const latestVersion = [...original.versions].sort(
      (a, b) => b.versionNumber - a.versionNumber,
    )[0];
    if (!latestVersion)
      throw new NotFoundException('Formulario original nao tem versao para duplicar.');

    const actorGoogleUserId = await this.googleWorkspaceService.findConnectedGoogleUserId(actorId);
    const domainCopy = FormMapper.toDomain(original).duplicate(
      randomUUID(),
      actorId,
      actorGoogleUserId,
    );

    const newForm = await this.dataSource.transaction(async (manager) => {
      const f = await manager.save(
        manager.create(FormEntity, {
          id: domainCopy.id,
          name: domainCopy.name,
          description: domainCopy.description,
          category: domainCopy.category,
          area: domainCopy.area,
          createdBy: domainCopy.createdBy,
          status: domainCopy.status,
          googleSheetsEnabled: domainCopy.googleSheetsEnabled,
          googleSheetsAutoCreate: domainCopy.googleSheetsAutoCreate,
          googleLinkedUserId: domainCopy.googleLinkedUserId,
        }),
      );
      await this.versionWriter.copyVersionStructure(manager, latestVersion, f.id);
      await copyKanbanPhases(manager, original.id, f.id);
      // A cópia herda os vínculos do original (como herda as pessoas atribuídas); quem duplica é o dono.
      await this.processAccess.copyMembers(manager, original.id, f.id);
      await this.processAccess.grantCreator(manager, f.id, actorId);
      return f;
    });

    this.eventEmitter.emit('forms.duplicated', new FormDuplicatedEvent(actorId, newForm.id, id));
    await this.googleWorkspaceService.autoCreateSpreadsheetIfNeeded(newForm.id, actorId);
    return this.findOne(newForm.id, actorId);
  }

  async getGoogleSheetsStatus(
    id: string,
    actorId: string,
  ): Promise<FormGoogleSheetsStatusResponse> {
    await this.findOne(id, actorId);
    return this.googleWorkspaceService.getFormGoogleSheetsStatus(id);
  }

  async createGoogleSpreadsheet(
    id: string,
    actorId: string,
  ): Promise<FormGoogleSheetsStatusResponse> {
    await this.findOne(id, actorId);
    return this.googleWorkspaceService.createSpreadsheetForForm(id, actorId);
  }

  async reenqueueGoogleSheetsSync(
    id: string,
    actorId: string,
  ): Promise<{
    requeuedJobs: number;
    recoveredProcessingJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    await this.findOne(id, actorId);
    return this.googleWorkspaceService.reenqueueFormSyncJobs(id, actorId);
  }

  async reprocessGoogleSheetsSync(
    id: string,
    actorId: string,
  ): Promise<{
    createdJobs: number;
    skippedExistingJobs: number;
    skippedCompletedJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    await this.findOne(id, actorId);
    return this.googleWorkspaceService.reprocessFormSubmissions(id, actorId);
  }
}

/** Sem vazios nem repetidos (ignorando maiúsculas), em ordem alfabética pt-BR. */
function sortLabels(values: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    const label = raw?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('pt-BR');
    if (!byKey.has(key)) byKey.set(key, label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Campo "Arquivo para baixar" com caminho que não veio do servidor: 400 com a mensagem certa. */
function normalizeDownloadFieldsOrFail(dto: CreateFormDto): void {
  try {
    normalizeDownloadFields(dto.sections ?? []);
  } catch (error) {
    if (error instanceof InvalidDownloadFileError) throw new BadRequestException(error.message);
    throw error;
  }
}

/**
 * Rascunho pode ter "Arquivo para baixar" ainda sem arquivo (o envio pede o processo salvo);
 * publicado, não: o solicitante veria um botão que não baixa nada.
 */
async function assertDownloadFieldsReady(version: FormVersionEntity): Promise<void> {
  const fields = version.sections.flatMap((section) => section.fields);
  const [missing] = downloadFieldsWithoutFile(fields);
  if (missing) {
    throw new BadRequestException(
      `O campo "${missing.label}" (Arquivo para baixar) precisa de um arquivo antes de publicar.`,
    );
  }
  for (const field of fields) {
    if (field.fieldType !== FormFieldType.FILE_DOWNLOAD) continue;
    const file = parseDownloadFile(field.settingsJson?.downloadFile);
    if (file && !(await downloadFileExists(file.path))) {
      throw new BadRequestException(
        `O arquivo do campo "${field.label}" não foi encontrado no servidor. Envie de novo antes de publicar.`,
      );
    }
  }
}
