import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormFieldType } from '../../../../common/enums/form-field-type.enum';
import { FormStatus } from '../../../../common/enums/form-status.enum';
import {
  type FieldErrorMap,
  FieldValidationException,
} from '../../../../common/exceptions/field-validation.exception';
import { FormFieldEntity, FormVersionEntity } from '../../../../database/entities';
import {
  ErpLookupBadRequestError,
  ErpLookupUnavailableError,
  erpUnavailableException,
} from './erp-lookup.errors';
import type { ErpLookupDetails } from './erp-lookup.details';
import { type ErpLookupItem, ErpLookupService } from './erp-lookup.service';
import { type ErpLookupSettings, parseErpLookupSettings } from './erp-lookup.settings';

/**
 * Ficha de um campo "Lista do ERP" respondido numa solicitação, para quem trabalha nela (aprovação,
 * card da fase). `label` é o nome gravado no envio — aparece mesmo com o ERP fora do ar.
 */
export type AnsweredErpLookupDetail = {
  fieldCode: string;
  fieldLabel: string;
  value: string;
  label: string;
  /** `ok` com ficha; `sem_detalhes` = a lista não tem ficha ou o item sumiu; `indisponivel` = ERP fora. */
  status: 'ok' | 'sem_detalhes' | 'indisponivel';
  details: ErpLookupDetails | null;
};

/** Resposta como vem de `submission.items` com o campo da versão respondida. */
type AnsweredItem = {
  fieldCode: string;
  valueJson: unknown;
  field?: Pick<FormFieldEntity, 'id' | 'code' | 'label' | 'fieldType' | 'settingsJson'> | null;
};

/** Máximo de opções numa pesquisa enquanto digita. */
export const SEARCH_LIMIT = 20;

/** O que a validação do envio produz para cada campo (ver FormSubmissionValidator). */
type SubmissionItem = {
  fieldId: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

/** O que fica gravado na resposta de um campo "Lista do ERP" (`value_json`). */
export type ErpLookupAnswer = {
  value: string;
  label: string;
  fonte: string;
  resolvidoEm: string;
};

@Injectable()
export class ErpLookupFieldService {
  private readonly logger = new Logger(ErpLookupFieldService.name);

  constructor(
    @InjectRepository(FormVersionEntity)
    private readonly versionsRepo: Repository<FormVersionEntity>,
    @InjectRepository(FormFieldEntity)
    private readonly fieldsRepo: Repository<FormFieldEntity>,
    private readonly lookup: ErpLookupService,
  ) {}

  /**
   * Pesquisa de quem está preenchendo o formulário. Conector e lista vêm da configuração do
   * campo na versão publicada — nunca do navegador.
   */
  async searchField(
    formId: string,
    fieldCode: string,
    q: string,
    isAuthenticated: boolean,
  ): Promise<{ items: ErpLookupItem[] }> {
    const field = await this.findPublishedField(formId, fieldCode);
    const settings = this.requireSettings(field);

    if (settings.exigirLogin && !isAuthenticated) {
      throw new UnauthorizedException('Entre na sua conta para pesquisar nesta lista.');
    }

    const text = q.trim();
    if (settings.modo === 'pesquisa' && text.length < settings.minCaracteres) {
      throw new BadRequestException(`Digite pelo menos ${settings.minCaracteres} caracteres.`);
    }

    try {
      const items = await this.lookup.search(
        settings.erpConnectorId,
        settings.fonte,
        text,
        settings.modo === 'pesquisa' ? SEARCH_LIMIT : undefined,
      );
      return { items };
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  /**
   * Ficha do item escolhido, para quem preenche conferir antes de enviar. Mesma regra da
   * pesquisa: com `exigirLogin`, só para quem está logado. `null` = sem ficha para mostrar.
   */
  async detailsField(
    formId: string,
    fieldCode: string,
    value: string,
    isAuthenticated: boolean,
  ): Promise<{ detalhes: ErpLookupDetails | null }> {
    const field = await this.findPublishedField(formId, fieldCode);
    const settings = this.requireSettings(field);

    if (settings.exigirLogin && !isAuthenticated) {
      throw new UnauthorizedException('Entre na sua conta para ver os detalhes desta lista.');
    }

    try {
      const detalhes = await this.lookup.details(
        settings.erpConnectorId,
        settings.fonte,
        value.trim(),
      );
      return { detalhes };
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  /**
   * Confere no ERP cada código escolhido em campos "Lista do ERP" e troca pelo que o ERP diz:
   * `valueText` = nome (o que todas as telas, exportações e `{{campo}}` mostram) e `valueJson` =
   * código + nome + lista + quando foi conferido. O nome enviado pelo navegador nunca é usado.
   *
   * Chamar FORA da transação do envio: não segurar conexão do Postgres esperando o ERP.
   */
  async resolveSubmissionItems<T extends SubmissionItem>(
    fields: FormFieldEntity[],
    items: T[],
  ): Promise<T[]> {
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const errors: FieldErrorMap = {};
    const resolved: T[] = [];

    for (const item of items) {
      const field = fieldById.get(item.fieldId);
      const value = readSelectedValue(item.valueJson);
      if (field?.fieldType !== FormFieldType.ERP_LOOKUP || !value) {
        resolved.push(item);
        continue;
      }

      const settings = this.requireSettings(field);
      let found: ErpLookupItem | null;
      try {
        found = await this.lookup.resolve(settings.erpConnectorId, settings.fonte, value);
      } catch (err) {
        throw this.toHttpError(err);
      }

      if (!found) {
        errors[field.code] = 'Opção não encontrada no ERP. Pesquise e escolha de novo.';
        continue;
      }

      const answer: ErpLookupAnswer = {
        value: found.value,
        label: found.label,
        fonte: settings.fonte,
        resolvidoEm: new Date().toISOString(),
      };
      resolved.push({ ...item, valueText: found.label, valueJson: answer });
    }

    if (Object.keys(errors).length > 0) {
      throw new FieldValidationException(errors);
    }
    return resolved;
  }

  /**
   * Fichas de TODOS os campos "Lista do ERP" respondidos — qualquer formulário, qualquer lista. Usa
   * o campo da versão que foi respondida (conector e lista de quando o vendedor enviou), não a
   * versão publicada de hoje. Quem chama já conferiu o acesso à solicitação; o `exigirLogin` do
   * formulário público não se aplica (rota autenticada). Uma ficha que falha não derruba as outras.
   */
  async detailsForAnswers(items: readonly AnsweredItem[]): Promise<AnsweredErpLookupDetail[]> {
    const answered = items.flatMap((item) => {
      const field = item.field;
      const answer = readStoredAnswer(item.valueJson);
      if (field?.fieldType !== FormFieldType.ERP_LOOKUP || !answer) return [];
      const settings = parseErpLookupSettings(field.settingsJson);
      return settings ? [{ item, field, answer, settings }] : [];
    });

    return Promise.all(
      answered.map(async ({ item, field, answer, settings }): Promise<AnsweredErpLookupDetail> => {
        const base = {
          fieldCode: item.fieldCode,
          fieldLabel: field.label,
          value: answer.value,
          label: answer.label,
        };
        try {
          const details = await this.lookup.details(settings.erpConnectorId, settings.fonte, answer.value);
          return { ...base, status: details ? 'ok' : 'sem_detalhes', details };
        } catch (err) {
          this.logger.warn(
            { fieldCode: item.fieldCode, error: err instanceof Error ? err.message : String(err) },
            'Ficha do ERP indisponível para a solicitação',
          );
          return { ...base, status: 'indisponivel', details: null };
        }
      }),
    );
  }

  /**
   * Fichas de uma solicitação que nasceu sem envio, com respostas dadas por um fluxo (ex.: o
   * pedido de um lote recebido por webhook): código do campo → código no ERP. O campo vem da
   * versão publicada do formulário de hoje — não houve versão respondida. Sem o nome escolhido
   * por alguém, o rótulo é o próprio código; a ficha traz o resto.
   */
  async detailsForFlowGivenValues(
    formId: string,
    values: Readonly<Record<string, string>>,
  ): Promise<AnsweredErpLookupDetail[]> {
    const codes = Object.keys(values);
    if (codes.length === 0) return [];
    const version = await this.versionsRepo.findOne({
      where: { formId, isPublished: true },
      select: { id: true },
    });
    if (!version) return [];
    const fields = await this.fieldsRepo.find({
      where: { formVersionId: version.id, fieldType: FormFieldType.ERP_LOOKUP },
    });
    return this.detailsForAnswers(
      fields
        .filter((field) => values[field.code])
        .map((field) => ({
          fieldCode: field.code,
          valueJson: { value: values[field.code], label: values[field.code] },
          field,
        })),
    );
  }

  private async findPublishedField(formId: string, fieldCode: string): Promise<FormFieldEntity> {
    const version = await this.versionsRepo.findOne({
      where: { formId, isPublished: true, form: { status: FormStatus.PUBLISHED } },
      select: { id: true },
    });
    const field = version
      ? await this.fieldsRepo.findOne({
          where: {
            formVersionId: version.id,
            code: fieldCode,
            fieldType: FormFieldType.ERP_LOOKUP,
          },
        })
      : null;
    if (!field) {
      throw new NotFoundException('Campo de lista do ERP não encontrado neste formulário.');
    }
    return field;
  }

  /** Configuração quebrada num formulário publicado = indisponível para quem preenche. */
  private requireSettings(field: FormFieldEntity): ErpLookupSettings {
    const settings = parseErpLookupSettings(field.settingsJson);
    if (!settings) {
      this.logger.error(
        { fieldId: field.id, fieldCode: field.code },
        'Campo "Lista do ERP" publicado sem conector ou lista configurados',
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

/** O que ficou gravado no envio (ver ErpLookupAnswer); outro formato = não é resposta de lista do ERP. */
function readStoredAnswer(valueJson: unknown): { value: string; label: string } | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const { value, label } = valueJson as Record<string, unknown>;
  return typeof value === 'string' && value && typeof label === 'string' ? { value, label } : null;
}

/** O navegador manda `valueJson: { value: "<código>" }` (normalizado no FormSubmissionValidator). */
function readSelectedValue(valueJson: unknown): string | null {
  if (!valueJson || typeof valueJson !== 'object') return null;
  const { value } = valueJson as { value?: unknown };
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
