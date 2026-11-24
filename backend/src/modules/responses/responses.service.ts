import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { formatHours } from '../../common/formula/formula.engine';
import { SubmissionStatus } from '../../common/enums/submission-status.enum';
import { ResponseSubmittedEvent } from '../../common/events/response-events';
import {
  FormEntity,
  FormFieldEntity,
  FormVersionEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import { ErpLookupFieldService } from '../integrations/erp/lookup/erp-lookup-field.service';
import { ErpTableFieldService } from '../integrations/erp/lookup/erp-table-field.service';
import { ItemOrderFieldService } from '../item-lists/item-order-field.service';
import { UserEmailFieldService } from '../user-email/user-email-field.service';
import { PermissionsService } from '../roles/permissions.service';
import { ProcessAccessService } from '../access/process-access.service';
import { FieldValidationException } from '../../common/exceptions/field-validation.exception';
import { FormSubmissionValidator } from './form-submission.validator';
import {
  type LoggedResponder,
  resolveResponderIdentity,
  validateResponderIdentity,
} from './responder-identification';
import { PublicCaptchaService } from './public-captcha.service';
import { SubmitResponseDto, SubmitResponseItemDto } from './dto/submit-response.dto';

/** Espelha o formatCalculatedValue do frontend (forms/formula.ts) para os arquivos exportados. */
function formatCalculatedValueForExport(
  value: number | null,
  settings: Record<string, unknown>,
): string {
  if (value === null || !Number.isFinite(value)) return '';
  const rawDecimals = settings.formulaDecimals;
  const decimals =
    typeof rawDecimals === 'number' && Number.isFinite(rawDecimals)
      ? Math.min(Math.max(Math.trunc(rawDecimals), 0), 10)
      : 2;
  const body =
    settings.formulaFormat === 'hours'
      ? formatHours(value)
      : value.toLocaleString('pt-BR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
  const prefix = typeof settings.formulaPrefix === 'string' ? settings.formulaPrefix : '';
  const suffix = typeof settings.formulaSuffix === 'string' ? settings.formulaSuffix : '';
  return `${prefix}${body}${suffix}`;
}

/**
 * Valor de uma resposta pronto para um arquivo exportado (CSV/XLSX/PDF): resolve
 * select/multi-select para o rótulo escolhido (em vez do internalValue interno),
 * formata campo calculado com o prefixo/sufixo/decimais configurados, e agrega a
 * tabela de produtos numa string legível. Sem o campo (ex.: código órfão), cai no
 * fallback bruto que o export sempre usou.
 */
export function resolveExportCellValue(
  item: Pick<SubmissionItemEntity, 'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson'>,
  field: FormFieldEntity | undefined,
): string | number | boolean | null {
  const rawFallback = (): string | number | boolean | null =>
    item.valueText ??
    item.valueNumber ??
    item.valueBoolean ??
    (item.valueJson !== null && item.valueJson !== undefined ? JSON.stringify(item.valueJson) : null);

  if (!field) return rawFallback();

  if (field.fieldType === FormFieldType.SINGLE_SELECT && item.valueText) {
    const match = field.options?.find((option) => option.internalValue === item.valueText);
    return match?.displayLabel ?? item.valueText;
  }

  if (field.fieldType === FormFieldType.MULTI_SELECT && Array.isArray(item.valueJson)) {
    return (item.valueJson as unknown[])
      .map((raw) => {
        if (typeof raw !== 'string') return String(raw);
        const match = field.options?.find((option) => option.internalValue === raw);
        return match?.displayLabel ?? raw;
      })
      .join(', ');
  }

  if (field.fieldType === FormFieldType.CALCULATED) {
    return formatCalculatedValueForExport(item.valueNumber, field.settingsJson ?? {});
  }

  if (field.fieldType === FormFieldType.PRODUCT_TABLE && Array.isArray(item.valueJson)) {
    return (item.valueJson as Array<{ produto?: unknown; values?: Record<string, unknown> }>)
      .map((row) => {
        const cells = Object.entries(row.values ?? {})
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(', ');
        return `${String(row.produto ?? '')} (${cells})`;
      })
      .join(' | ');
  }

  return rawFallback();
}

// Exported for unit testing
export function maskSensitiveValues(
  items: SubmissionItemEntity[],
  fields: FormFieldEntity[],
  hasSensitiveAccess: boolean,
): SubmissionItemEntity[] {
  if (hasSensitiveAccess) return items;

  const sensitiveCodes = new Set(fields.filter((f) => f.isSensitive).map((f) => f.code));
  if (sensitiveCodes.size === 0) return items;

  return items.map((item) => {
    if (!sensitiveCodes.has(item.fieldCode)) return item;
    return Object.assign(Object.create(Object.getPrototypeOf(item) as object) as SubmissionItemEntity, item, {
      valueText: '***',
      valueNumber: null,
      valueBoolean: null,
      valueJson: null,
    });
  });
}

const DISPLAY_ONLY_TYPES = new Set<FormFieldType>([
  FormFieldType.TITLE,
  FormFieldType.DESCRIPTION,
  FormFieldType.DIVIDER,
  FormFieldType.FILE_DOWNLOAD,
]);

const TEXT_TYPES = new Set<FormFieldType>([
  FormFieldType.SHORT_TEXT,
  FormFieldType.LONG_TEXT,
  FormFieldType.TIME,
  FormFieldType.PHONE,
  FormFieldType.CPF,
  FormFieldType.CNPJ,
]);

const NUMBER_TYPES = new Set<FormFieldType>([
  FormFieldType.NUMBER,
  FormFieldType.SCALE,
  FormFieldType.RATING,
]);

@Injectable()
export class ResponsesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly publicCaptchaService: PublicCaptchaService,
    private readonly formSubmissionValidator: FormSubmissionValidator,
    private readonly googleWorkspaceService: GoogleWorkspaceService,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly versionsRepository: Repository<FormVersionEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepository: Repository<SubmissionEntity>,
    @InjectRepository(SubmissionItemEntity)
    private readonly submissionItemsRepository: Repository<SubmissionItemEntity>,
    private readonly permissionsService: PermissionsService,
    private readonly erpLookupFieldService: ErpLookupFieldService,
    private readonly erpTableFieldService: ErpTableFieldService,
    private readonly itemOrderFieldService: ItemOrderFieldService,
    private readonly userEmailFieldService: UserEmailFieldService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  async submit(
    payload: SubmitResponseDto,
    submitterIp: string | null,
    submitterUserAgent: string | null,
    loggedUser: LoggedResponder = null,
  ): Promise<SubmissionEntity> {
    const idempotencyKey = this.normalizeIdempotencyKey(payload.idempotencyKey);
    if (idempotencyKey) {
      const existing = await this.findSubmissionByIdempotencyKey(payload.formId, idempotencyKey);
      if (existing) return existing;
    }

    const form = await this.formsRepository.findOne({
      where: { id: payload.formId, status: FormStatus.PUBLISHED },
    });
    if (!form) {
      throw new NotFoundException('Formulário público não encontrado ou não publicado.');
    }

    const version = await this.versionsRepository.findOne({
      where: { id: payload.formVersionId, formId: payload.formId, isPublished: true },
      relations: { sections: { fields: { options: true }, branches: true } },
      order: {
        sections: {
          order: 'ASC',
          fields: { order: 'ASC', options: { order: 'ASC' } },
          branches: { order: 'ASC' },
        },
      },
    });
    if (!version) {
      throw new NotFoundException('Versão publicada do formulário não encontrada.');
    }

    // 1. Captcha check (no-op when TURNSTILE_SECRET_KEY is not configured)
    await this.publicCaptchaService.verifyToken(payload.captchaToken, submitterIp ?? undefined);

    // 2. Structural security gate (throws BadRequestException on field-ID / type issues)
    this.validateSubmissionPayload(version, payload.items);

    // 2b. "Identificação obrigatória": nome e e-mail precisam vir (ou do usuário logado).
    const identity = resolveResponderIdentity(version.settingsJson, payload, loggedUser);
    const identityErrors = validateResponderIdentity(version.settingsJson, identity);
    if (Object.keys(identityErrors).length > 0) {
      throw new FieldValidationException(identityErrors);
    }

    // 3. Full validation with normalization and conditional-field evaluation
    const normalizedItems = this.formSubmissionValidator.validate(version, payload);

    // 3a. "E-mail de usuário" com "só e-mails sugeridos": o e-mail tem de ser de um usuário ativo
    //     (e, se o campo tem pessoas escolhidas, de uma delas). Antes do ERP, que é mais caro.
    const versionFields = version.sections.flatMap((section) => section.fields);
    const fieldById = new Map(versionFields.map((field) => [field.id, field]));
    const userEmailErrors = await this.userEmailFieldService.findNotSuggested(
      normalizedItems.flatMap((item) => {
        const field = fieldById.get(item.fieldId);
        return field
          ? [{ key: field.code, fieldType: field.fieldType, settingsJson: field.settingsJson, value: item.valueText }]
          : [];
      }),
    );
    if (Object.keys(userEmailErrors).length > 0) {
      throw new FieldValidationException(userEmailErrors);
    }

    // 3b. Campos "Lista do ERP": confere cada código no ERP e grava o nome que ele devolve.
    //     Fora da transação, para não segurar conexão do Postgres esperando o ERP. ERP fora →
    //     503 ERP_INDISPONIVEL e nada é gravado (a web e o app mostram o popup).
    const lookupItems = await this.erpLookupFieldService.resolveSubmissionItems(
      versionFields,
      normalizedItems,
    );

    // 3c. "Tabela dinâmica do ERP": consulta o ERP de novo (sem cache) com os códigos já
    //     conferidos acima, compara o hash e monta o retrato com os dados do servidor. Também
    //     fora da transação. Itens mudados → 409 ERP_TABLE_CHANGED; ERP fora → 503.
    const tableItems = await this.erpTableFieldService.resolveSubmissionItems(
      versionFields,
      lookupItems,
    );

    // 3d. "Pedido de itens": confere os itens na lista atual e monta o retrato (colunas da
    //     lista, respostas e total) com os dados do servidor.
    const validatedItems = await this.itemOrderFieldService.resolveSubmissionItems(
      versionFields,
      tableItems,
    );

    // 4. Atomic write — rolls back submission + items if sync job creation fails
    let persistedId: string;
    try {
      persistedId = await this.dataSource.transaction(async (manager) => {
        const submission = manager.getRepository(SubmissionEntity).create({
          formId: payload.formId,
          formVersionId: payload.formVersionId,
          responderName: identity.responderName,
          responderEmail: identity.responderEmail,
          idempotencyKey,
          status: SubmissionStatus.SUBMITTED,
          submittedAt: new Date(),
          submitterIp,
          submitterUserAgent,
        });
        const persisted = await manager.getRepository(SubmissionEntity).save(submission);

        if (validatedItems.length > 0) {
          const items = validatedItems.map((item) =>
            manager.getRepository(SubmissionItemEntity).create({
              submissionId: persisted.id,
              fieldId: item.fieldId,
              fieldCode: item.fieldCode,
              valueText: item.valueText,
              valueNumber: item.valueNumber,
              valueBoolean: item.valueBoolean,
              valueJson: item.valueJson as Record<string, unknown> | null,
            }),
          );
          await manager.getRepository(SubmissionItemEntity).save(items);
        }

        await this.googleWorkspaceService.ensureSubmissionSyncJob(persisted.id);

        return persisted.id;
      });
    } catch (error) {
      if (idempotencyKey && this.isSubmissionIdempotencyUniqueViolation(error)) {
        const existing = await this.findSubmissionByIdempotencyKey(payload.formId, idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }

    this.eventEmitter.emit(
      'responses.submitted',
      new ResponseSubmittedEvent(persistedId, payload.formId, payload.formVersionId),
    );

    return this.loadSubmissionWithItems(persistedId);
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string | null {
    const normalized = idempotencyKey?.trim();
    if (!normalized) return null;
    if (normalized.length > 120) {
      throw new BadRequestException('Chave de idempotência muito longa.');
    }
    return normalized;
  }

  private findSubmissionByIdempotencyKey(
    formId: string,
    idempotencyKey: string,
  ): Promise<SubmissionEntity | null> {
    return this.submissionsRepository.findOne({
      where: { formId, idempotencyKey },
      relations: { items: true },
    });
  }

  private isSubmissionIdempotencyUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
    return (
      driverError?.code === '23505' &&
      driverError.constraint === 'UQ_submissions_form_id_idempotency_key'
    );
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  private validateSubmissionPayload(
    version: FormVersionEntity,
    items: SubmitResponseItemDto[],
  ): void {
    const allFields = version.sections.flatMap((s) => s.fields);
    const fieldMap = new Map<string, FormFieldEntity>(allFields.map((f) => [f.id, f]));

    const seenIds = new Set<string>();
    for (const item of items) {
      if (seenIds.has(item.fieldId)) {
        throw new BadRequestException(`fieldId duplicado nos items: ${item.fieldId}`);
      }
      seenIds.add(item.fieldId);
    }

    for (const item of items) {
      const field = fieldMap.get(item.fieldId);
      if (!field) {
        throw new BadRequestException(
          `fieldId '${item.fieldId}' não pertence a esta versão do formulário.`,
        );
      }
      if (field.code !== item.fieldCode) {
        throw new BadRequestException(
          `fieldCode '${item.fieldCode}' não corresponde ao campo '${field.code}' (fieldId: ${item.fieldId}).`,
        );
      }
      this.validateItemType(field, item);
    }
  }

  private validateItemType(field: FormFieldEntity, item: SubmitResponseItemDto): void {
    const { code, fieldType, options } = field;
    const { valueText, valueNumber, valueBoolean, valueJson } = item;

    if (DISPLAY_ONLY_TYPES.has(fieldType)) return;

    if (TEXT_TYPES.has(fieldType)) {
      if (typeof valueText !== 'string' || valueText.length === 0) {
        throw new BadRequestException(
          `Campo '${code}': valueText (string não-vazia) é obrigatório para tipo ${fieldType}.`,
        );
      }
      if (valueNumber !== undefined || valueBoolean !== undefined || valueJson !== undefined) {
        throw new BadRequestException(
          `Campo '${code}': apenas valueText é aceito para tipo ${fieldType}.`,
        );
      }
      return;
    }

    if (fieldType === FormFieldType.EMAIL) {
      if (typeof valueText !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueText)) {
        throw new BadRequestException(`Campo '${code}': valueText deve ser um e-mail válido.`);
      }
      return;
    }

    if (fieldType === FormFieldType.DATE) {
      if (typeof valueText !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valueText)) {
        throw new BadRequestException(
          `Campo '${code}': valueText deve estar no formato YYYY-MM-DD.`,
        );
      }
      return;
    }

    if (NUMBER_TYPES.has(fieldType)) {
      if (typeof valueNumber !== 'number') {
        throw new BadRequestException(
          `Campo '${code}': valueNumber (number) é obrigatório para tipo ${fieldType}.`,
        );
      }
      return;
    }

    if (fieldType === FormFieldType.CHECKBOX) {
      if (typeof valueBoolean !== 'boolean') {
        throw new BadRequestException(
          `Campo '${code}': valueBoolean (boolean) é obrigatório para tipo ${fieldType}.`,
        );
      }
      return;
    }

    if (fieldType === FormFieldType.SINGLE_SELECT) {
      const valid = new Set(options.map((o) => o.internalValue));
      if (typeof valueText !== 'string' || !valid.has(valueText)) {
        throw new BadRequestException(
          `Campo '${code}': valueText deve ser uma das opções válidas.`,
        );
      }
      return;
    }

    if (fieldType === FormFieldType.MULTI_SELECT) {
      const valid = new Set(options.map((o) => o.internalValue));
      const arr = valueJson as unknown;
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new BadRequestException(
          `Campo '${code}': valueJson deve ser um array não-vazio de opções.`,
        );
      }
      for (const v of arr) {
        if (typeof v !== 'string' || !valid.has(v)) {
          throw new BadRequestException(`Campo '${code}': "${String(v)}" não é uma opção válida.`);
        }
      }
      return;
    }
    if (fieldType === FormFieldType.PRODUCT_TABLE) {
      if (!Array.isArray(valueJson) || valueJson.length === 0) {
        throw new BadRequestException(
          `Campo '${code}': valueJson deve ser uma lista não-vazia de produtos.`,
        );
      }
      return;
    }
    if (fieldType === FormFieldType.ERP_LOOKUP) {
      // Só o código: o nome gravado vem do ERP no envio, nunca do navegador.
      const value = (valueJson as { value?: unknown } | null | undefined)?.value;
      if (
        !valueJson ||
        typeof valueJson !== 'object' ||
        Array.isArray(valueJson) ||
        typeof value !== 'string' ||
        value.trim().length === 0 ||
        value.length > 100
      ) {
        throw new BadRequestException(
          `Campo '${code}': valueJson deve ser { value: "<código>" } com até 100 caracteres.`,
        );
      }
      if ([valueText, valueNumber, valueBoolean].some((v) => v !== undefined && v !== null)) {
        throw new BadRequestException(
          `Campo '${code}': apenas valueJson é aceito para tipo ${fieldType}.`,
        );
      }
      return;
    }

    if (fieldType === FormFieldType.ERP_TABLE || fieldType === FormFieldType.ITEM_ORDER) {
      // Só o formato; linhas e células são conferidas contra o ERP no envio. Quem manda outra
      // coisa é o app mobile antigo (texto livre no lugar da tabela).
      if (
        !valueJson ||
        typeof valueJson !== 'object' ||
        Array.isArray(valueJson) ||
        [valueText, valueNumber, valueBoolean].some((v) => v !== undefined && v !== null)
      ) {
        throw new BadRequestException(
          `Campo '${code}': Este campo só pode ser preenchido pelo portal web.`,
        );
      }
      return;
    }

    // FILE_UPLOAD and other future types: no strict type validation
  }

  // ─── Query ──────────────────────────────────────────────────────────────────


  /** Recarrega a submissao recem-criada para devolver ao proprio submissor — sem checagem de acesso, pois ainda nao ha ator autenticado nesse fluxo publico. */
  private async loadSubmissionWithItems(id: string): Promise<SubmissionEntity> {
    const submission = await this.submissionsRepository.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!submission) throw new NotFoundException('Resposta não encontrada.');
    return submission;
  }

  async findOne(
    id: string,
    actorId: string,
    actorRole: string,
    actorAreaId: string | null = null,
  ): Promise<SubmissionEntity> {
    const submission = await this.loadSubmissionWithItems(id);

    // Não por `responses.view_detail`: ela não tem escopo e abriria a resposta de qualquer processo.
    await this.processAccess.assertSubmissionReadable(submission, {
      sub: actorId,
      role: actorRole,
      areaId: actorAreaId,
    });

    const hasSensitiveAccess = await this.processAccess.hasInProcess(
      { sub: actorId, role: actorRole, areaId: actorAreaId },
      submission.formId,
      'responses.view_sensitive',
    );
    const formFields = await this.loadFormFields(submission.formId);
    submission.items = maskSensitiveValues(submission.items, formFields, hasSensitiveAccess);

    return submission;
  }

  private async loadFormFields(formId: string): Promise<FormFieldEntity[]> {
    return this.dataSource
      .getRepository(FormFieldEntity)
      .createQueryBuilder('field')
      .innerJoin('field.formVersion', 'version')
      .leftJoinAndSelect('field.options', 'options')
      .where('version.form_id = :formId', { formId })
      .getMany();
  }
}
