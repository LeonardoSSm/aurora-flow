import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  type FieldErrorMap,
  FieldValidationException,
} from '../../common/exceptions/field-validation.exception';
import {
  FormFieldEntity,
  FormVersionEntity,
  ItemListEntity,
  ItemListItemEntity,
} from '../../database/entities';
import { summarizeErrors } from '../integrations/erp/lookup/erp-table.snapshot';
import {
  buildItemOrderAnswer,
  buildItemOrderSummary,
  ITEM_ORDER_MAX_ROWS,
  type ItemOrderAnswer,
  type ItemOrderList,
  listItemOrderSettingsProblems,
  parseItemOrderSettings,
  readItemOrderSubmission,
  toPublicItemOrderSettings,
} from './item-order.settings';

/** Mesmo formato que o FormSubmissionValidator produz (ver ErpTableFieldService). */
type SubmissionItem = {
  fieldId: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

/** Campo do formulário ou de fase — só o que a conferência usa. */
type FieldWithSettings = { fieldType: string; label: string; settingsJson?: unknown };

const WEB_ONLY_MESSAGE = 'Este campo só pode ser preenchido pelo portal web.';

/**
 * Campo "Pedido de itens" (ver `item-order.settings.ts`): itens para o formulário público, conferência
 * na publicação e montagem do retrato no envio, sempre com a lista como ela está no momento.
 */
@Injectable()
export class ItemOrderFieldService {
  constructor(
    @InjectRepository(ItemListEntity)
    private readonly lists: Repository<ItemListEntity>,
  ) {}

  /** `settingsJson` público de cada campo "Pedido de itens", pelo id do campo. */
  async publicSettingsByField(
    fields: FormFieldEntity[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const orderFields = fields.filter((field) => field.fieldType === FormFieldType.ITEM_ORDER);
    const out = new Map<string, Record<string, unknown>>();
    if (orderFields.length === 0) return out;
    const lists = await this.loadLists(this.lists.manager, orderFields);
    for (const field of orderFields) {
      const listId = parseItemOrderSettings(field.settingsJson)?.itemListId;
      out.set(
        field.id,
        toPublicItemOrderSettings(field.settingsJson, listId ? lists.get(listId) : undefined),
      );
    }
    return out;
  }

  /** Publicação: lista escolhida e existente, colunas e total coerentes. */
  async assertFieldsReady(manager: EntityManager, version: FormVersionEntity): Promise<void> {
    const fields = version.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.fieldType === FormFieldType.ITEM_ORDER);
    if (fields.length === 0) return;
    const lists = await this.loadLists(manager, fields);
    for (const field of fields) {
      const problems = this.settingsProblems(field, lists);
      if (problems.length > 0) {
        throw new BadRequestException(
          `O campo "${field.label}" (Pedido de itens) não pode ser publicado: ${problems.join('; ')}.`,
        );
      }
    }
  }

  /** Salvamento das fases: mesma conferência da publicação, para cada "Pedido de itens" de fase. */
  async assertPhaseFieldsReady(
    manager: EntityManager,
    phaseLabel: string,
    fields: FieldWithSettings[],
  ): Promise<void> {
    const orderFields = fields.filter((field) => field.fieldType === FormFieldType.ITEM_ORDER);
    if (orderFields.length === 0) return;
    const lists = await this.loadLists(manager, orderFields);
    for (const field of orderFields) {
      const problems = this.settingsProblems(field, lists);
      if (problems.length > 0) {
        throw new BadRequestException(
          `Fase "${phaseLabel}", campo "${field.label}" (Pedido de itens): ${problems.join('; ')}.`,
        );
      }
    }
  }

  /**
   * Campo de fase: troca o que o navegador mandou pelo retrato com a lista atual, como no envio do
   * formulário. Pedido vazio vira valor em branco. Erro → 400 com o nome do campo.
   */
  async resolvePhaseValue(
    field: FieldWithSettings,
    valueJson: unknown,
  ): Promise<{ valueText: string | null; valueJson: ItemOrderAnswer | null }> {
    if (valueJson === null || valueJson === undefined) return { valueText: null, valueJson: null };
    const submitted = readItemOrderSubmission(valueJson);
    if (!submitted || submitted.rows.length > ITEM_ORDER_MAX_ROWS) {
      throw new BadRequestException(`O campo "${field.label}" veio num formato inválido.`);
    }
    if (submitted.rows.length === 0) return { valueText: null, valueJson: null };
    const settings = parseItemOrderSettings(field.settingsJson);
    const list = settings
      ? (await this.loadLists(this.lists.manager, [field])).get(settings.itemListId)
      : undefined;
    if (!settings || !list) {
      throw new BadRequestException(`A lista de itens do campo "${field.label}" não existe mais.`);
    }
    const built = buildItemOrderAnswer(settings, list, submitted);
    if (built.errors.length > 0) {
      throw new BadRequestException(`${field.label}: ${summarizeErrors(built.errors)}`);
    }
    return { valueText: buildItemOrderSummary(built.answer), valueJson: built.answer };
  }

  private settingsProblems(field: FieldWithSettings, lists: Map<string, ItemOrderList>): string[] {
    const listId = parseItemOrderSettings(field.settingsJson)?.itemListId;
    return listItemOrderSettingsProblems(
      field.settingsJson,
      listId ? (lists.get(listId) ?? null) : undefined,
    );
  }

  /**
   * Envio: troca o que o navegador mandou (ids e respostas) pelo retrato montado com a lista atual.
   * Pedido vazio some (o "obrigatório" já foi conferido no validador). Erros → 400 por campo.
   */
  async resolveSubmissionItems<T extends SubmissionItem>(
    fields: FormFieldEntity[],
    items: T[],
  ): Promise<T[]> {
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const orderItems = items.filter(
      (item) => fieldById.get(item.fieldId)?.fieldType === FormFieldType.ITEM_ORDER,
    );
    if (orderItems.length === 0) return items;

    const lists = await this.loadLists(
      this.lists.manager,
      orderItems.map((item) => fieldById.get(item.fieldId) as FormFieldEntity),
    );
    const errors: FieldErrorMap = {};
    const replaced = new Map<T, T>();
    for (const item of orderItems) {
      const field = fieldById.get(item.fieldId) as FormFieldEntity;
      const settings = parseItemOrderSettings(field.settingsJson);
      const list = settings ? lists.get(settings.itemListId) : undefined;
      const submitted = readItemOrderSubmission(item.valueJson);
      if (!submitted || submitted.rows.length > ITEM_ORDER_MAX_ROWS) {
        errors[field.code] = WEB_ONLY_MESSAGE;
        continue;
      }
      if (!settings || !list) {
        errors[field.code] = 'A lista de itens deste campo não existe mais.';
        continue;
      }
      const built = buildItemOrderAnswer(settings, list, submitted);
      if (built.errors.length > 0) {
        errors[field.code] = summarizeErrors(built.errors);
        continue;
      }
      replaced.set(item, {
        ...item,
        valueText: buildItemOrderSummary(built.answer),
        valueJson: built.answer,
      });
    }
    if (Object.keys(errors).length > 0) throw new FieldValidationException(errors);
    return items.map((item) => replaced.get(item) ?? item);
  }

  private async loadLists(
    manager: EntityManager,
    fields: FieldWithSettings[],
  ): Promise<Map<string, ItemOrderList>> {
    const ids = [
      ...new Set(
        fields
          .map((field) => parseItemOrderSettings(field.settingsJson)?.itemListId)
          .filter((id): id is string => !!id),
      ),
    ];
    const out = new Map<string, ItemOrderList>();
    if (ids.length === 0) return out;
    const lists = await manager.getRepository(ItemListEntity).find({ where: { id: In(ids) } });
    for (const list of lists) {
      out.set(list.id, { id: list.id, name: list.name, columns: list.columnsJson ?? [], items: [] });
    }
    const rows = await manager.getRepository(ItemListItemEntity).find({
      where: { listId: In(ids) },
      order: { order: 'ASC' },
    });
    for (const row of rows) {
      out.get(row.listId)?.items.push({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        valuesJson: row.valuesJson ?? {},
      });
    }
    return out;
  }
}
