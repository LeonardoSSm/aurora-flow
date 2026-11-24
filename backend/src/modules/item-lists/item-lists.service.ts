import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  FormFieldEntity,
  FormFieldOptionEntity,
  ItemListEntity,
  ItemListItemEntity,
  KanbanPhaseFieldEntity,
} from '../../database/entities';
import type { KanbanPhaseFieldOption } from '../../database/entities/kanban-phase-field.entity';
import { SaveItemListDto } from './dto/save-item-list.dto';
import {
  normalizeColumns,
  sanitizeValues,
  type ItemListColumn,
  type ItemListValues,
} from './item-list-columns';
import {
  LIST_FIELD_TYPES,
  readItemListId,
  syncLinkedOptions,
  withHiddenOptions,
  type LinkedListItem,
} from './linked-options';

export type ItemListUsage = { forms: number; phaseFields: number };

export type ItemListSummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount: number;
  usage: ItemListUsage;
  updatedAt: Date;
};

export type ItemListDetail = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  columns: ItemListColumn[];
  items: Array<{
    id: string;
    code: string | null;
    name: string;
    isActive: boolean;
    order: number;
    values: ItemListValues;
  }>;
  usage: ItemListUsage;
};

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Listas de itens reutilizáveis. Salvar substitui os itens de uma vez (como as fases do Kanban) e
 * logo em seguida atualiza as opções de todo campo ligado à lista — ver `linked-options.ts`.
 */
@Injectable()
export class ItemListsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ItemListEntity)
    private readonly lists: Repository<ItemListEntity>,
    @InjectRepository(ItemListItemEntity)
    private readonly items: Repository<ItemListItemEntity>,
  ) {}

  async list(includeArchived = false): Promise<ItemListSummary[]> {
    const lists = await this.lists.find({
      where: includeArchived ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
    if (lists.length === 0) return [];
    const ids = lists.map((list) => list.id);
    const counts: Array<{ list_id: string; count: string }> = await this.items
      .createQueryBuilder('item')
      .select('item.list_id', 'list_id')
      .addSelect('COUNT(*)', 'count')
      .where('item.list_id IN (:...ids)', { ids })
      .andWhere('item.is_active = true')
      .groupBy('item.list_id')
      .getRawMany();
    const countById = new Map(counts.map((row) => [row.list_id, Number(row.count)]));
    const usage = await this.usageOf(this.dataSource.manager, ids);
    return lists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      isActive: list.isActive,
      itemCount: countById.get(list.id) ?? 0,
      usage: usage.get(list.id) ?? { forms: 0, phaseFields: 0 },
      updatedAt: list.updatedAt,
    }));
  }

  async findOne(id: string): Promise<ItemListDetail> {
    const list = await this.lists.findOne({
      where: { id },
      relations: { items: true },
      order: { items: { order: 'ASC' } },
    });
    if (!list) throw new NotFoundException('Lista de itens não encontrada.');
    const usage = await this.usageOf(this.dataSource.manager, [id]);
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      isActive: list.isActive,
      columns: list.columnsJson ?? [],
      items: (list.items ?? []).map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        isActive: item.isActive,
        order: item.order,
        values: item.valuesJson ?? {},
      })),
      usage: usage.get(id) ?? { forms: 0, phaseFields: 0 },
    };
  }

  async create(dto: SaveItemListDto, actorId: string | null): Promise<ItemListDetail> {
    const id = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ItemListEntity);
      const columns = normalizeColumns(dto.columns ?? []);
      const saved = await repo.save(
        repo.create({ ...this.header(dto), columnsJson: columns, createdBy: actorId }),
      );
      await this.replaceItems(
        manager.getRepository(ItemListItemEntity),
        saved.id,
        dto,
        [],
        columns,
      );
      return saved.id;
    });
    return this.findOne(id);
  }

  async update(id: string, dto: SaveItemListDto): Promise<ItemListDetail> {
    await this.dataSource.transaction(async (manager) => {
      const list = await manager.getRepository(ItemListEntity).findOne({ where: { id } });
      if (!list) throw new NotFoundException('Lista de itens não encontrada.');
      const columns = dto.columns ? normalizeColumns(dto.columns) : (list.columnsJson ?? []);
      await manager
        .getRepository(ItemListEntity)
        .save({ ...list, ...this.header(dto), columnsJson: columns });
      const existing = await manager
        .getRepository(ItemListItemEntity)
        .find({ where: { listId: id } });
      await this.replaceItems(
        manager.getRepository(ItemListItemEntity),
        id,
        dto,
        existing,
        columns,
      );
      await this.propagate(manager, id);
    });
    return this.findOne(id);
  }

  /** Arquivar não mexe nos campos: quem já usa continua com as mesmas opções. */
  async setActive(id: string, isActive: boolean): Promise<ItemListDetail> {
    const list = await this.lists.findOne({ where: { id } });
    if (!list) throw new NotFoundException('Lista de itens não encontrada.');
    await this.lists.update(id, { isActive });
    return this.findOne(id);
  }

  /** Atualiza as opções de todo campo (formulários, todas as versões, e fases) ligado à lista. */
  async propagate(manager: EntityManager, listId: string): Promise<void> {
    const formFields = await manager
      .getRepository(FormFieldEntity)
      .createQueryBuilder('field')
      .leftJoinAndSelect('field.options', 'option')
      .where(`field.settings_json ->> 'itemListId' = :listId`, { listId })
      .andWhere('field.field_type IN (:...types)', { types: LIST_FIELD_TYPES })
      .getMany();
    const phaseFields = await manager
      .getRepository(KanbanPhaseFieldEntity)
      .createQueryBuilder('field')
      .where(`field.settings_json ->> 'itemListId' = :listId`, { listId })
      .andWhere('field.field_type IN (:...types)', { types: LIST_FIELD_TYPES })
      .getMany();
    if (formFields.length === 0 && phaseFields.length === 0) return;
    const items = await this.itemsByList(manager, [listId]);
    await this.syncFormFieldEntities(manager, formFields, items);
    for (const field of phaseFields) {
      const next = this.syncPhaseOptions(field.settingsJson, field.optionsJson, items);
      if (
        next &&
        (!sameJson(next.settings, field.settingsJson) || !sameJson(next.options, field.optionsJson))
      ) {
        await manager.getRepository(KanbanPhaseFieldEntity).save({
          id: field.id,
          settingsJson: next.settings,
          optionsJson: next.options,
        });
      }
    }
  }

  /**
   * Depois de salvar um formulário: os campos ligados de todas as versões dele ficam com as opções
   * da lista como ela está agora (o que o construtor mandou pode estar defasado).
   */
  async syncFormFields(manager: EntityManager, formId: string): Promise<void> {
    const fields = await manager
      .getRepository(FormFieldEntity)
      .createQueryBuilder('field')
      .innerJoin('field.formVersion', 'version')
      .leftJoinAndSelect('field.options', 'option')
      .where('version.form_id = :formId', { formId })
      .andWhere(`field.settings_json ->> 'itemListId' IS NOT NULL`)
      .andWhere('field.field_type IN (:...types)', { types: LIST_FIELD_TYPES })
      .getMany();
    if (fields.length === 0) return;
    const listIds = fields
      .map((field) => readItemListId(field.settingsJson))
      .filter((id): id is string => !!id);
    const items = await this.itemsByList(manager, listIds);
    await this.syncFormFieldEntities(manager, fields, items);
  }

  /**
   * Campo de fase sendo salvo: devolve as opções/configurações já com a lista aplicada. Sem lista
   * (ou lista inexistente), devolve `null` e o campo segue com o que veio.
   */
  async syncPhaseFieldInput(
    manager: EntityManager,
    fieldType: string,
    settings: Record<string, unknown> | null,
    options: KanbanPhaseFieldOption[] | null,
  ): Promise<{ settings: Record<string, unknown>; options: KanbanPhaseFieldOption[] } | null> {
    if (!LIST_FIELD_TYPES.includes(fieldType)) return null;
    const listId = readItemListId(settings);
    if (!listId) return null;
    const items = await this.itemsByList(manager, [listId]);
    if (!items.has(listId))
      throw new BadRequestException('A lista de itens escolhida não existe mais.');
    return this.syncPhaseOptions(settings, options, items);
  }

  private syncPhaseOptions(
    settings: Record<string, unknown> | null,
    options: KanbanPhaseFieldOption[] | null,
    items: Map<string, LinkedListItem[]>,
  ): { settings: Record<string, unknown>; options: KanbanPhaseFieldOption[] } | null {
    const listItems = items.get(readItemListId(settings) ?? '');
    if (!listItems) return null;
    const synced = syncLinkedOptions(options ?? [], listItems);
    return { settings: withHiddenOptions(settings, synced.hidden), options: synced.options };
  }

  private async syncFormFieldEntities(
    manager: EntityManager,
    fields: FormFieldEntity[],
    items: Map<string, LinkedListItem[]>,
  ): Promise<void> {
    const optionRepo = manager.getRepository(FormFieldOptionEntity);
    for (const field of fields) {
      const listItems = items.get(readItemListId(field.settingsJson) ?? '');
      if (!listItems) continue;
      const current = [...(field.options ?? [])].sort((a, b) => a.order - b.order);
      const synced = syncLinkedOptions(
        current.map((option) => ({ value: option.internalValue, label: option.displayLabel })),
        listItems,
      );
      const byValue = new Map(current.map((option) => [option.internalValue, option]));
      const toSave: FormFieldOptionEntity[] = [];
      synced.options.forEach((option, order) => {
        const existing = byValue.get(option.value);
        if (!existing) {
          toSave.push(
            optionRepo.create({
              fieldId: field.id,
              internalValue: option.value,
              displayLabel: option.label,
              order,
            }),
          );
        } else if (existing.displayLabel !== option.label || existing.order !== order) {
          toSave.push({ ...existing, displayLabel: option.label, order });
        }
      });
      if (toSave.length) await optionRepo.save(toSave, { chunk: 200 });
      const settings = withHiddenOptions(field.settingsJson, synced.hidden);
      if (!sameJson(settings, field.settingsJson)) {
        await manager.getRepository(FormFieldEntity).save({ id: field.id, settingsJson: settings });
      }
    }
  }

  private async itemsByList(
    manager: EntityManager,
    listIds: string[],
  ): Promise<Map<string, LinkedListItem[]>> {
    const unique = [...new Set(listIds)];
    const out = new Map<string, LinkedListItem[]>();
    if (unique.length === 0) return out;
    const lists = await manager
      .getRepository(ItemListEntity)
      .find({ where: { id: In(unique) }, select: { id: true } });
    for (const list of lists) out.set(list.id, []);
    const rows = await manager.getRepository(ItemListItemEntity).find({
      where: { listId: In(unique) },
      order: { order: 'ASC' },
    });
    for (const row of rows)
      out.get(row.listId)?.push({ id: row.id, name: row.name, isActive: row.isActive });
    return out;
  }

  /** Em quantos formulários (distintos) e campos de fase cada lista está em uso. */
  private async usageOf(
    manager: EntityManager,
    ids: string[],
  ): Promise<Map<string, ItemListUsage>> {
    const out = new Map<string, ItemListUsage>(ids.map((id) => [id, { forms: 0, phaseFields: 0 }]));
    if (ids.length === 0) return out;
    const forms: Array<{ list_id: string; count: string }> = await manager.query(
      `SELECT f.settings_json ->> 'itemListId' AS list_id, COUNT(DISTINCT v.form_id) AS count
         FROM form_fields f JOIN form_versions v ON v.id = f.form_version_id
        WHERE f.settings_json ->> 'itemListId' = ANY($1)
        GROUP BY 1`,
      [ids],
    );
    const phases: Array<{ list_id: string; count: string }> = await manager.query(
      `SELECT settings_json ->> 'itemListId' AS list_id, COUNT(*) AS count
         FROM kanban_phase_fields
        WHERE settings_json ->> 'itemListId' = ANY($1)
        GROUP BY 1`,
      [ids],
    );
    for (const row of forms) {
      const entry = out.get(row.list_id);
      if (entry) entry.forms = Number(row.count);
    }
    for (const row of phases) {
      const entry = out.get(row.list_id);
      if (entry) entry.phaseFields = Number(row.count);
    }
    return out;
  }

  private header(dto: SaveItemListDto): Partial<ItemListEntity> {
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() ? dto.description.trim() : null,
    };
  }

  private async replaceItems(
    repo: Repository<ItemListItemEntity>,
    listId: string,
    dto: SaveItemListDto,
    existing: ItemListItemEntity[],
    columns: ItemListColumn[],
  ): Promise<void> {
    const names = dto.items.map((item) => item.name.trim().toLocaleLowerCase('pt-BR'));
    const repeatedName = dto.items.find((_, index) => names.indexOf(names[index]) !== index);
    if (repeatedName)
      throw new BadRequestException(`Dois itens com o nome "${repeatedName.name.trim()}".`);
    const codes = dto.items
      .map((item) => item.code?.trim())
      .filter((code): code is string => !!code);
    const repeatedCode = codes.find((code, index) => codes.indexOf(code) !== index);
    if (repeatedCode) throw new BadRequestException(`Dois itens com o código "${repeatedCode}".`);

    const existingById = new Map(existing.map((item) => [item.id, item]));
    const existingIds = new Set(existingById.keys());
    const keepIds = new Set(
      dto.items.map((item) => item.id).filter((id): id is string => !!id && existingIds.has(id)),
    );
    const removed = existing.filter((item) => !keepIds.has(item.id)).map((item) => item.id);
    if (removed.length) await repo.delete(removed);

    const rows = dto.items.map((item, order) => {
      const kept = item.id && keepIds.has(item.id) ? item.id : undefined;
      // Sem `values`, o item fica com os que já tinha (menos os de colunas removidas).
      const values = item.values ?? (kept ? existingById.get(kept)?.valuesJson : undefined);
      return repo.create({
        id: kept,
        listId,
        code: item.code?.trim() ? item.code.trim() : null,
        name: item.name.trim(),
        isActive: item.isActive ?? true,
        order,
        valuesJson: sanitizeValues(columns, values, item.name.trim()),
      });
    });
    if (rows.length) await repo.save(rows, { chunk: 200 });
  }
}
