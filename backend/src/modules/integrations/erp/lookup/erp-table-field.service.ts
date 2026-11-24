import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { FormFieldType } from '../../../../common/enums/form-field-type.enum';
import { FormStatus } from '../../../../common/enums/form-status.enum';
import {
  type FieldErrorMap,
  FieldValidationException,
} from '../../../../common/exceptions/field-validation.exception';
import { FormFieldEntity, FormVersionEntity } from '../../../../database/entities';
import { ErpConnectorEntity } from '../../../../database/entities/erp-connector.entity';
import {
  ErpLookupBadRequestError,
  ErpLookupUnavailableError,
  erpTableChangedException,
  erpTableDisabledException,
  erpUnavailableException,
} from './erp-lookup.errors';
import { type ErpTableDefinition, ErpLookupService } from './erp-lookup.service';
import {
  type ErpTableSettings,
  listErpTableSettingsProblems,
  parseErpTableSettings,
} from './erp-table.settings';
import {
  buildErpTableAnswerRows,
  buildErpTableSummary,
  computeErpTableHash,
  type ErpTableAnswer,
  type ErpTableRow,
  projectRows,
  readErpTableSubmission,
  summarizeErrors,
} from './erp-table.snapshot';

/** Campos que podem alimentar um parâmetro da tabela (§2.3 do documento). */
export const ERP_TABLE_DEPENDENCY_TYPES = new Set<string>([
  FormFieldType.ERP_LOOKUP,
  FormFieldType.SHORT_TEXT,
  FormFieldType.NUMBER,
  FormFieldType.SINGLE_SELECT,
]);

/** Linhas devolvidas no teste do construtor: o suficiente para conferir a configuração. */
export const TABLE_TEST_ROWS = 20;
const MAX_PARAMETER_LENGTH = 100;
const NUMBER_PARAMETER = /^-?\d{1,18}(\.\d{1,10})?$/;
const WEB_ONLY_MESSAGE = 'Este campo só pode ser preenchido pelo portal web.';

/** Mesmo formato que o FormSubmissionValidator produz (ver ErpLookupFieldService). */
type SubmissionItem = {
  fieldId: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

export interface ErpTableLoadResponse {
  schemaVersion: 1;
  sourceHash: string;
  fetchedAt: string;
  rows: ErpTableRow[];
}

/**
 * Campo "Tabela dinâmica do ERP": carregamento no formulário público, teste no construtor,
 * conferência na publicação e revalidação no envio. Ver
 * Docs/campo_tabela_dinamica_erp_implantacao.md.
 */
@Injectable()
export class ErpTableFieldService {
  private readonly logger = new Logger(ErpTableFieldService.name);

  constructor(
    @InjectRepository(FormVersionEntity)
    private readonly versionsRepo: Repository<FormVersionEntity>,
    @InjectRepository(FormFieldEntity)
    private readonly fieldsRepo: Repository<FormFieldEntity>,
    private readonly lookup: ErpLookupService,
    private readonly config: ConfigService,
  ) {}

  /** `ERP_TABLE_ENABLED=true` liga o campo no ambiente (§15). */
  isEnabled(): boolean {
    return this.config.get<string>('ERP_TABLE_ENABLED') === 'true';
  }

  // ─── Construtor ──────────────────────────────────────────────────────────────

  async listTables(connectorId: string, fonte: string): Promise<ErpTableDefinition[]> {
    this.assertEnabled();
    try {
      return await this.lookup.listTables(connectorId, fonte);
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  /** "Testar consulta" do construtor: parâmetros digitados por quem monta o formulário. */
  async testTable(
    connectorId: string,
    fonte: string,
    dataset: string,
    parameters: Record<string, string>,
  ): Promise<{ found: boolean; totalRows: number; rows: ErpTableRow[] }> {
    this.assertEnabled();
    try {
      const rows = await this.lookup.queryTable(connectorId, fonte, dataset, parameters, {
        useCache: false,
      });
      return {
        found: rows !== null,
        totalRows: rows?.length ?? 0,
        rows: rows?.slice(0, TABLE_TEST_ROWS) ?? [],
      };
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  // ─── Formulário público ─────────────────────────────────────────────────────

  /**
   * Linhas da tabela para quem está preenchendo. Conector, lista e tabela vêm da versão
   * publicada; do navegador só vêm os valores dos campos de que a tabela depende.
   */
  async loadField(
    formId: string,
    fieldCode: string,
    dependencies: Record<string, unknown>,
    isAuthenticated: boolean,
  ): Promise<ErpTableLoadResponse> {
    this.assertEnabled();
    const { field, settings, fields } = await this.findPublishedField(formId, fieldCode);
    if (settings.exigirLogin && !isAuthenticated) {
      throw new UnauthorizedException('Entre na sua conta para carregar esta tabela.');
    }

    const values = new Map<string, string>();
    for (const binding of settings.parameterBindings) {
      const raw = dependencies[binding.fieldCode];
      const value = readDependencyValue(raw);
      if (value !== null) values.set(binding.fieldCode, value);
    }
    const parameters = this.buildParameters(settings, fields, values);
    if ('missing' in parameters) {
      throw new BadRequestException(`Preencha "${parameters.missing}" para carregar a tabela.`);
    }
    if ('invalid' in parameters) {
      throw new BadRequestException(`O valor de "${parameters.invalid}" não é válido.`);
    }

    let rows: ErpTableRow[] | null;
    try {
      rows = await this.lookup.queryTable(
        settings.erpConnectorId,
        settings.fonte,
        settings.dataset,
        parameters.values,
        { useCache: true },
      );
    } catch (err) {
      throw this.toHttpError(err);
    }
    if (rows === null) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ITEM_NAO_ENCONTRADO',
        message: 'Registro não encontrado no ERP.',
      });
    }
    this.logger.log(
      { fieldId: field.id, fonte: settings.fonte, dataset: settings.dataset, rows: rows.length },
      'Tabela do ERP carregada',
    );

    const projected = projectRows(rows.slice(0, settings.maxRows), settings.sourceColumns);
    return {
      schemaVersion: 1,
      sourceHash: computeErpTableHash(projected, settings.sourceColumns),
      fetchedAt: new Date().toISOString(),
      rows: projected,
    };
  }

  // ─── Envio ───────────────────────────────────────────────────────────────────

  /**
   * Revalida cada "Tabela dinâmica do ERP" do envio: consulta o ERP de novo (sem cache), compara
   * o hash com o que o formulário carregou e monta o retrato com os dados do servidor — o que o
   * navegador manda das colunas do ERP nunca é usado. Os parâmetros saem dos próprios campos da
   * submissão, já conferidos (chamar DEPOIS de `ErpLookupFieldService.resolveSubmissionItems`).
   *
   * Chamar FORA da transação do envio. Itens mudados no ERP → 409 ERP_TABLE_CHANGED; ERP fora →
   * 503 ERP_INDISPONIVEL; nada é gravado em nenhum dos casos.
   */
  async resolveSubmissionItems<T extends SubmissionItem>(
    fields: FormFieldEntity[],
    items: T[],
  ): Promise<T[]> {
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const tableItems = items.filter(
      (item) => fieldById.get(item.fieldId)?.fieldType === FormFieldType.ERP_TABLE,
    );
    if (tableItems.length === 0) return items;
    this.assertEnabled();

    const values = new Map<string, string>();
    for (const item of items) {
      const value = readSubmittedValue(item);
      if (value !== null) values.set(item.fieldCode, value);
    }

    const errors: FieldErrorMap = {};
    const changed: string[] = [];
    const dropped = new Set<T>();
    const replaced = new Map<T, T>();

    // Todas as tabelas em paralelo: o envio espera no máximo um timeout do ERP (§7.5).
    await Promise.all(
      tableItems.map(async (item) => {
        const field = fieldById.get(item.fieldId) as FormFieldEntity;
        const outcome = await this.resolveTableItem(field, item, fields, values);
        if (outcome.kind === 'error') errors[field.code] = outcome.message;
        else if (outcome.kind === 'changed') changed.push(field.code);
        else if (outcome.kind === 'drop') dropped.add(item);
        else
          replaced.set(item, { ...item, valueText: outcome.valueText, valueJson: outcome.answer });
      }),
    );

    if (Object.keys(errors).length > 0) {
      throw new FieldValidationException(errors);
    }
    if (changed.length > 0) {
      throw erpTableChangedException(changed.sort());
    }
    return items.filter((item) => !dropped.has(item)).map((item) => replaced.get(item) ?? item);
  }

  private async resolveTableItem(
    field: FormFieldEntity,
    item: SubmissionItem,
    fields: FormFieldEntity[],
    values: Map<string, string>,
  ): Promise<
    | { kind: 'error'; message: string }
    | { kind: 'changed' }
    | { kind: 'drop' }
    | { kind: 'ok'; answer: ErpTableAnswer; valueText: string }
  > {
    const settings = this.requireSettings(field);
    const submitted = readErpTableSubmission(item.valueJson);
    if (!submitted) {
      return { kind: 'error', message: WEB_ONLY_MESSAGE };
    }

    const parameters = this.buildParameters(settings, fields, values);
    if ('missing' in parameters) {
      // Campo de que a tabela depende vazio ou oculto: tabela vazia (§8.1).
      return field.required
        ? { kind: 'error', message: `Preencha "${parameters.missing}" antes da tabela.` }
        : { kind: 'drop' };
    }
    if ('invalid' in parameters) {
      return { kind: 'error', message: `O valor de "${parameters.invalid}" não é válido.` };
    }

    let rows: ErpTableRow[] | null;
    try {
      rows = await this.lookup.queryTable(
        settings.erpConnectorId,
        settings.fonte,
        settings.dataset,
        parameters.values,
        { useCache: false },
      );
    } catch (err) {
      throw this.toHttpError(err);
    }
    if (rows === null) {
      return { kind: 'error', message: 'Registro não encontrado no ERP.' };
    }

    const projected = projectRows(rows.slice(0, settings.maxRows), settings.sourceColumns);
    const sourceHash = computeErpTableHash(projected, settings.sourceColumns);
    if (sourceHash !== submitted.sourceHash) {
      return { kind: 'changed' };
    }
    if (projected.length === 0 && field.required) {
      return { kind: 'error', message: 'O registro não tem itens no ERP.' };
    }

    const built = buildErpTableAnswerRows(settings, projected, submitted);
    if (built.errors.length > 0) {
      return { kind: 'error', message: summarizeErrors(built.errors) };
    }

    const answer: ErpTableAnswer = {
      schemaVersion: 1,
      source: {
        dataset: settings.dataset,
        dependencies: Object.fromEntries(
          settings.parameterBindings
            .filter((binding) => values.has(binding.fieldCode))
            .map((binding) => [binding.fieldCode, values.get(binding.fieldCode) as string]),
        ),
        fetchedAt: new Date().toISOString(),
        sourceHash,
      },
      columns: {
        source: settings.sourceColumns.map(({ key, label, type }) => ({ key, label, type })),
        input: settings.inputColumns.map(({ id, label, type, decimals }) => ({
          id,
          label,
          type,
          decimals,
        })),
      },
      rows: built.rows,
    };
    return { kind: 'ok', answer, valueText: buildErpTableSummary(answer) };
  }

  // ─── Publicação ─────────────────────────────────────────────────────────────

  /**
   * Regras que não dependem do ERP (§9): flag ligada, configuração completa, conector ativo e
   * campos de que a tabela depende existentes, de tipo aceito e antes da tabela. Roda dentro da
   * transação da publicação.
   */
  async assertStructureReady(manager: EntityManager, version: FormVersionEntity): Promise<void> {
    const sections = [...version.sections].sort((a, b) => a.order - b.order);
    const fields = sections.flatMap((section) =>
      [...section.fields].sort((a, b) => a.order - b.order),
    );
    const tables = fields.filter((field) => field.fieldType === FormFieldType.ERP_TABLE);
    if (tables.length === 0) return;
    if (!this.isEnabled()) {
      throw new BadRequestException(
        'A "Tabela dinâmica do ERP" está desativada neste ambiente. Remova o campo para publicar.',
      );
    }

    const position = new Map(fields.map((field, index) => [field.code, index]));
    for (const table of tables) {
      const problems = listErpTableSettingsProblems(table.settingsJson);
      const settings = parseErpTableSettings(table.settingsJson);
      if (settings) {
        const connector = await manager.findOne(ErpConnectorEntity, {
          where: { id: settings.erpConnectorId },
          select: { id: true, isActive: true },
        });
        if (!connector?.isActive) problems.push('o conector de ERP não existe ou está inativo');

        for (const binding of settings.parameterBindings) {
          const dependency = fields.find((field) => field.code === binding.fieldCode);
          if (!dependency) {
            problems.push(`o campo "${binding.fieldCode}" usado como parâmetro não existe`);
          } else if (!ERP_TABLE_DEPENDENCY_TYPES.has(dependency.fieldType)) {
            problems.push(`o campo "${dependency.label}" não pode ser usado como parâmetro`);
          } else if ((position.get(dependency.code) ?? 0) >= (position.get(table.code) ?? 0)) {
            problems.push(`o campo "${dependency.label}" precisa vir antes da tabela`);
          }
        }
      }
      if (problems.length > 0) {
        throw new BadRequestException(
          `O campo "${table.label}" (Tabela dinâmica do ERP) não pode ser publicado: ${problems.join('; ')}.`,
        );
      }
    }
  }

  /**
   * Regras que dependem da API erp-lookup (§9): a tabela existe, tem chave de linha, todo
   * parâmetro obrigatório está associado e toda coluna escolhida existe. Rodar ANTES da
   * transação da publicação — não segurar conexão do Postgres esperando o ERP.
   */
  async assertSourcesReady(version: FormVersionEntity): Promise<void> {
    const tables = version.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.fieldType === FormFieldType.ERP_TABLE);

    for (const table of tables) {
      const settings = parseErpTableSettings(table.settingsJson);
      if (!settings) continue; // assertStructureReady explica o que falta.

      let definitions: ErpTableDefinition[];
      try {
        definitions = await this.lookup.listTables(settings.erpConnectorId, settings.fonte);
      } catch (err) {
        if (err instanceof ErpLookupUnavailableError) {
          throw new BadRequestException(
            `Não foi possível conferir a tabela do campo "${table.label}" no ERP agora. Tente publicar novamente em alguns minutos.`,
          );
        }
        throw err;
      }

      const problems: string[] = [];
      const definition = definitions.find((candidate) => candidate.id === settings.dataset);
      if (!definition) {
        problems.push(`a lista "${settings.fonte}" não tem a tabela "${settings.dataset}"`);
      } else {
        if (!definition.rowKey) problems.push('a tabela do ERP não informa a chave das linhas');
        const bound = new Set(settings.parameterBindings.map((binding) => binding.parameter));
        const unbound = definition.parameters.filter(
          (parameter) => parameter.required && !bound.has(parameter.name),
        );
        for (const parameter of unbound) {
          problems.push(`o parâmetro "${parameter.name}" precisa de um campo associado`);
        }
        if (unbound.length > 0) {
          // Caso comum: a tabela é o 1º campo e não há de onde tirar o valor do parâmetro.
          problems.push(
            'em "Parâmetros" da tabela, escolha um campo que venha antes dela (Lista do ERP, texto curto, número ou seleção única) ou crie um pelo botão "Criar campo"',
          );
        }
        const declared = new Set(definition.parameters.map((parameter) => parameter.name));
        for (const parameter of bound) {
          if (!declared.has(parameter)) problems.push(`o parâmetro "${parameter}" não existe`);
        }
        const columns = new Set(definition.columns.map((column) => column.key));
        for (const column of settings.sourceColumns) {
          if (!columns.has(column.key)) {
            problems.push(`a coluna "${column.label}" não existe mais na tabela do ERP`);
          }
        }
      }
      if (problems.length > 0) {
        throw new BadRequestException(
          `O campo "${table.label}" (Tabela dinâmica do ERP) não pode ser publicado: ${problems.join('; ')}.`,
        );
      }
    }
  }

  // ─── Apoio ───────────────────────────────────────────────────────────────────

  private assertEnabled(): void {
    if (!this.isEnabled()) throw erpTableDisabledException();
  }

  private async findPublishedField(
    formId: string,
    fieldCode: string,
  ): Promise<{ field: FormFieldEntity; settings: ErpTableSettings; fields: FormFieldEntity[] }> {
    const version = await this.versionsRepo.findOne({
      where: { formId, isPublished: true, form: { status: FormStatus.PUBLISHED } },
      select: { id: true },
    });
    const fields = version
      ? await this.fieldsRepo.find({ where: { formVersionId: version.id } })
      : [];
    const field = fields.find(
      (candidate) =>
        candidate.code === fieldCode && candidate.fieldType === FormFieldType.ERP_TABLE,
    );
    if (!field) {
      throw new NotFoundException('Campo de tabela do ERP não encontrado neste formulário.');
    }
    return { field, settings: this.requireSettings(field), fields };
  }

  /**
   * Valores dos campos → parâmetros da consulta. `missing` = rótulo do primeiro campo vazio de
   * um parâmetro (a tabela fica vazia); `invalid` = valor que não serve para o tipo do parâmetro.
   */
  private buildParameters(
    settings: ErpTableSettings,
    fields: FormFieldEntity[],
    values: Map<string, string>,
  ): { values: Record<string, string> } | { missing: string } | { invalid: string } {
    const labelOf = (code: string): string =>
      fields.find((field) => field.code === code)?.label ?? code;
    const parameters: Record<string, string> = {};
    for (const binding of settings.parameterBindings) {
      const value = values.get(binding.fieldCode);
      if (value === undefined) return { missing: labelOf(binding.fieldCode) };
      if (value.length > MAX_PARAMETER_LENGTH) return { invalid: labelOf(binding.fieldCode) };
      const dependency = fields.find((field) => field.code === binding.fieldCode);
      if (dependency?.fieldType === FormFieldType.NUMBER && !NUMBER_PARAMETER.test(value)) {
        return { invalid: labelOf(binding.fieldCode) };
      }
      parameters[binding.parameter] = value;
    }
    return { values: parameters };
  }

  /** Configuração quebrada num formulário publicado = indisponível para quem preenche. */
  private requireSettings(field: FormFieldEntity): ErpTableSettings {
    const settings = parseErpTableSettings(field.settingsJson);
    if (!settings) {
      this.logger.error(
        { fieldId: field.id, fieldCode: field.code },
        'Campo "Tabela dinâmica do ERP" publicado sem conector, lista ou tabela configurados',
      );
      throw erpUnavailableException();
    }
    return settings;
  }

  private toHttpError(err: unknown): Error {
    if (err instanceof ErpLookupUnavailableError) return erpUnavailableException();
    if (err instanceof ErpLookupBadRequestError) return new BadRequestException(err.message);
    return err instanceof Error ? err : new Error(String(err));
  }
}

/** Valor de dependência mandado pelo navegador no carregamento: `{ value }` ou o valor direto. */
function readDependencyValue(raw: unknown): string | null {
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { value?: unknown }).value
      : raw;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

/**
 * Valor de um campo já validado na submissão: o código da Lista do ERP (conferido no ERP), o
 * texto, o número ou a opção escolhida.
 */
function readSubmittedValue(item: SubmissionItem): string | null {
  if (item.valueJson && typeof item.valueJson === 'object' && !Array.isArray(item.valueJson)) {
    const value = (item.valueJson as { value?: unknown }).value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (typeof item.valueText === 'string' && item.valueText.trim()) return item.valueText.trim();
  if (typeof item.valueNumber === 'number' && Number.isFinite(item.valueNumber)) {
    return String(item.valueNumber);
  }
  return null;
}
