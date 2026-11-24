import { Injectable } from '@nestjs/common';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  coerceAnswerToNumber,
  computeCalculatedFieldValues,
  getFormulaDecimals,
  getFormulaOptionScores,
  getFormulaSource,
} from '../../common/formula/formula.engine';
import {
  FieldValidationException,
  type FieldErrorMap,
} from '../../common/exceptions/field-validation.exception';
import {
  validateCep,
  validateCnpj,
  validateCpf,
  validateCurrency,
  validateEmail,
  validatePhone,
} from '../../common/validators/field-format.validator';
import { FormFieldEntity, FormSectionEntity, FormVersionEntity } from '../../database/entities';
import {
  evaluateFieldConditions,
  evaluateVisibilityRules,
  hasMeaningfulValue,
  isDecorativeFieldType,
} from '../forms/form-definition.utils';
import { ERP_TABLE_MAX_ROWS } from '../integrations/erp/lookup/erp-table.settings';
import { readErpTableSubmission } from '../integrations/erp/lookup/erp-table.snapshot';
import {
  ITEM_ORDER_MAX_ROWS,
  readItemOrderSubmission,
} from '../item-lists/item-order.settings';
import { type SubmitResponseItemDto, SubmitResponseDto } from './dto/submit-response.dto';

function computeReachableSectionIds(
  sections: FormSectionEntity[],
  answerValues: Map<string, unknown>,
  fieldById: Map<string, FormFieldEntity>,
): Set<string> {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const reachable = new Set<string>();

  let current: FormSectionEntity | undefined = sortedSections[0];
  const guard = new Set<string>();

  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    reachable.add(current.id);

    let nextSectionId: string | null = null;
    let matched = false;

    const branches = [...(current.branches ?? [])].sort((a, b) => a.order - b.order);
    for (const branch of branches) {
      if (!branch.fieldId) continue;
      const field = fieldById.get(branch.fieldId);
      if (!field) continue;
      const answer = answerValues.get(field.code);

      let isMatch = false;
      if (branch.optionId) {
        const optionValue = field.options?.find(
          (option) => option.id === branch.optionId,
        )?.internalValue;
        if (optionValue === undefined) continue;
        isMatch =
          field.fieldType === FormFieldType.MULTI_SELECT
            ? Array.isArray(answer) && answer.includes(optionValue)
            : String(answer ?? '') === optionValue;
      } else if (branch.checkboxValue !== null) {
        isMatch = Boolean(answer) === branch.checkboxValue;
      }

      if (isMatch) {
        matched = true;
        nextSectionId = branch.targetIsSubmit ? null : branch.targetSectionId;
        break;
      }
    }

    if (!matched) {
      nextSectionId = current.nextIsSubmit ? null : current.nextSectionId;
    }

    current = nextSectionId ? sectionById.get(nextSectionId) : undefined;
  }

  return reachable;
}

type NormalizedAnswer = {
  field: FormFieldEntity;
  comparableValue: unknown;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown | null;
};

function parseNumberSetting(settings: Record<string, unknown>, key: string): number | undefined {
  const rawValue = settings[key];

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseStringSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const rawValue = settings[key];
  return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue.trim() : undefined;
}

function isUploadPayload(value: unknown): value is {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
} {
  return (
    !!value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
  );
}

function normalizeTextValue(item: SubmitResponseItemDto): string | null {
  if (typeof item.valueText !== 'string') {
    return null;
  }
  const normalized = item.valueText.trim();
  return normalized.length > 0 ? normalized : null;
}

@Injectable()
export class FormSubmissionValidator {
  validate(
    version: FormVersionEntity,
    payload: SubmitResponseDto,
  ): Array<{
    fieldId: string;
    fieldCode: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueJson: unknown | null;
  }> {
    const errors: FieldErrorMap = {};
    const fields = version.sections
      .flatMap((section) => section.fields)
      .sort((left, right) => left.order - right.order);

    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const fieldByCode = new Map(fields.map((field) => [field.code, field]));
    const answersByCode = new Map<string, NormalizedAnswer>();

    for (const item of payload.items) {
      const field = fieldById.get(item.fieldId) ?? fieldByCode.get(item.fieldCode);

      if (!field) {
        errors[item.fieldCode] = 'Campo enviado não pertence a esta versão do formulário.';
        continue;
      }

      if (field.id !== item.fieldId || field.code !== item.fieldCode) {
        errors[field.code] = 'Identificação do campo inválida para esta submissão.';
        continue;
      }

      // Campo calculado não aceita valor do cliente: é recalculado logo abaixo.
      if (field.fieldType === FormFieldType.CALCULATED) {
        continue;
      }

      if (answersByCode.has(field.code)) {
        errors[field.code] = 'Campo enviado mais de uma vez.';
        continue;
      }

      const normalized = this.normalizeAnswer(field, item, errors);
      if (normalized) {
        answersByCode.set(field.code, normalized);
      }
    }

    this.applyCalculatedFields(fields, answersByCode);

    const answerValues = new Map<string, unknown>();
    for (const [fieldCode, answer] of answersByCode.entries()) {
      answerValues.set(fieldCode, answer.comparableValue);
    }

    const reachableSectionIds = computeReachableSectionIds(
      version.sections,
      answerValues,
      fieldById,
    );

    const persistedItems: Array<{
      fieldId: string;
      fieldCode: string;
      valueText: string | null;
      valueNumber: number | null;
      valueBoolean: boolean | null;
      valueJson: unknown | null;
    }> = [];

    for (const field of fields) {
      if (isDecorativeFieldType(field.fieldType)) {
        continue;
      }

      const isVisible =
        reachableSectionIds.has(field.sectionId) &&
        evaluateFieldConditions(field.conditionsJson ?? {}, answerValues) &&
        evaluateVisibilityRules(field.visibilityRules, answerValues);
      const answer = answersByCode.get(field.code);
      const hasValue = answer ? hasMeaningfulValue(answer.comparableValue) : false;

      if (!isVisible) {
        continue;
      }

      // file_upload nunca é exigido na submissão em si: o arquivo é sempre
      // enviado à parte, em uma chamada separada após o envio (ver comentários
      // em form-runtime.ts `fieldToSubmitItem`/`validatePublicAnswers`) — então
      // não há como este campo chegar aqui com valor, obrigatório ou não.
      // Cálculo escondido de quem responde: não há como a pessoa ver nem corrigir — não trava o envio.
      const hiddenFromRespondent =
        field.fieldType === FormFieldType.CALCULATED && field.settingsJson?.hideFromRespondent === true;
      if (
        field.required &&
        !hasValue &&
        field.fieldType !== FormFieldType.FILE_UPLOAD &&
        !hiddenFromRespondent
      ) {
        errors[field.code] =
          field.fieldType === FormFieldType.CALCULATED
            ? 'Preencha os campos usados neste cálculo.'
            : 'Campo obrigatório.';
        continue;
      }

      if (!answer || !hasValue) {
        continue;
      }

      this.validateRules(field, answer, errors);
      persistedItems.push({
        fieldId: field.id,
        fieldCode: field.code,
        valueText: answer.valueText,
        valueNumber: answer.valueNumber,
        valueBoolean: answer.valueBoolean,
        valueJson: answer.valueJson,
      });
    }

    if (Object.keys(errors).length > 0) {
      throw new FieldValidationException(errors);
    }

    return persistedItems;
  }

  /**
   * Recalcula os campos de fórmula a partir do que o respondente enviou. O valor
   * exibido no navegador nunca é aceito — o número gravado sai daqui, então uma
   * submissão adulterada não consegue forjar um total.
   */
  private applyCalculatedFields(
    fields: FormFieldEntity[],
    answersByCode: Map<string, NormalizedAnswer>,
  ): void {
    const calculatedFields = fields.filter(
      (field) => field.fieldType === FormFieldType.CALCULATED,
    );
    if (calculatedFields.length === 0) {
      return;
    }

    const rawValuesByCode: Record<string, unknown> = {};
    for (const [fieldCode, answer] of answersByCode.entries()) {
      rawValuesByCode[fieldCode] = answer.comparableValue;
    }

    const computed = computeCalculatedFieldValues(
      calculatedFields.map((field) => ({
        code: field.code,
        formula: getFormulaSource(field.settingsJson),
        decimals: getFormulaDecimals(field.settingsJson),
        optionScores: getFormulaOptionScores(field.settingsJson),
      })),
      rawValuesByCode,
    );

    for (const field of calculatedFields) {
      const value = computed[field.code] ?? null;
      if (value === null) {
        answersByCode.delete(field.code);
        continue;
      }
      answersByCode.set(field.code, {
        field,
        comparableValue: value,
        valueText: null,
        valueNumber: value,
        valueBoolean: null,
        valueJson: null,
      });
    }
  }

  private normalizeAnswer(
    field: FormFieldEntity,
    item: SubmitResponseItemDto,
    errors: FieldErrorMap,
  ): NormalizedAnswer | null {
    switch (field.fieldType) {
      case FormFieldType.MULTI_SELECT: {
        if (!Array.isArray(item.valueJson)) {
          errors[field.code] = 'Campo deve ser enviado como lista de opções.';
          return null;
        }

        const values = item.valueJson
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean);

        return {
          field,
          comparableValue: values,
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueJson: values,
        };
      }
      case FormFieldType.CHECKBOX:
        if (typeof item.valueBoolean !== 'boolean') {
          errors[field.code] = 'Campo deve ser enviado como verdadeiro ou falso.';
          return null;
        }
        return {
          field,
          comparableValue: item.valueBoolean,
          valueText: null,
          valueNumber: null,
          valueBoolean: item.valueBoolean,
          valueJson: null,
        };
      case FormFieldType.NUMBER:
      case FormFieldType.SCALE:
      case FormFieldType.RATING:
        if (typeof item.valueNumber !== 'number' || !Number.isFinite(item.valueNumber)) {
          errors[field.code] = 'Campo deve ser enviado como número.';
          return null;
        }
        return {
          field,
          comparableValue: item.valueNumber,
          valueText: null,
          valueNumber: item.valueNumber,
          valueBoolean: null,
          valueJson: null,
        };
      case FormFieldType.PRODUCT_TABLE: {
        if (!Array.isArray(item.valueJson)) {
          errors[field.code] = 'Campo deve ser enviado como lista de produtos.';
          return null;
        }

        // Só colunas configuradas pelo criador (settingsJson.productTableColumns) são
        // aceitas — qualquer outra chave enviada é descartada silenciosamente.
        const settings = (field.settingsJson ?? {}) as Record<string, unknown>;
        const configuredColumns = Array.isArray(settings.productTableColumns)
          ? settings.productTableColumns
          : [];
        const columnLabels = new Set(
          configuredColumns
            .map((column) =>
              column && typeof column === 'object' ? (column as Record<string, unknown>).label : null,
            )
            .filter((label): label is string => typeof label === 'string' && label.trim().length > 0),
        );

        const rows = item.valueJson
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const rawRow = row as Record<string, unknown>;
            const produto = typeof rawRow.produto === 'string' ? rawRow.produto.trim() : '';
            if (!produto) return null;

            const rawValues =
              rawRow.values && typeof rawRow.values === 'object'
                ? (rawRow.values as Record<string, unknown>)
                : {};
            const values: Record<string, string | number> = {};
            for (const [key, raw] of Object.entries(rawValues)) {
              if (columnLabels.size > 0 && !columnLabels.has(key)) continue;
              if (typeof raw === 'number' && Number.isFinite(raw)) {
                values[key] = raw;
              } else if (typeof raw === 'string' && raw.trim().length > 0) {
                values[key] = raw.trim();
              }
            }
            if (Object.keys(values).length === 0) return null;

            return { produto, values };
          })
          .filter((row): row is { produto: string; values: Record<string, string | number> } => row !== null);

        if (rows.length === 0) {
          return null;
        }

        return {
          field,
          comparableValue: rows,
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueJson: rows,
        };
      }
      case FormFieldType.FILE_UPLOAD:
        if (isUploadPayload(item.valueJson)) {
          return {
            field,
            comparableValue: item.valueJson.url,
            valueText: null,
            valueNumber: null,
            valueBoolean: null,
            valueJson: item.valueJson,
          };
        }

        if (typeof item.valueText === 'string' && item.valueText.trim().length > 0) {
          const normalized = item.valueText.trim();
          return {
            field,
            comparableValue: normalized,
            valueText: normalized,
            valueNumber: null,
            valueBoolean: null,
            valueJson: null,
          };
        }

        errors[field.code] = 'Arquivo inválido para este campo.';
        return null;
      case FormFieldType.ERP_LOOKUP: {
        // Só o código escolhido. O nome (valueText) é preenchido depois, no envio, com o que o
        // ERP devolver — ver ErpLookupFieldService.resolveSubmissionItems.
        const rawValue = (item.valueJson as { value?: unknown } | null | undefined)?.value;
        if (
          item.valueJson !== undefined &&
          item.valueJson !== null &&
          typeof rawValue !== 'string'
        ) {
          errors[field.code] = 'Escolha uma opção da lista.';
          return null;
        }
        const value = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;
        return {
          field,
          comparableValue: value,
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueJson: value !== null ? { value } : null,
        };
      }
      case FormFieldType.ERP_TABLE: {
        // Só o formato aqui: hash, chaves e respostas. Linhas, colunas do ERP, obrigatoriedade
        // das células e o retrato gravado saem do servidor, no envio — ver
        // ErpTableFieldService.resolveSubmissionItems. O app mobile antigo manda valueText.
        const submitted = readErpTableSubmission(item.valueJson);
        if (!submitted || submitted.rows.length > ERP_TABLE_MAX_ROWS) {
          errors[field.code] = 'Este campo só pode ser preenchido pelo portal web.';
          return null;
        }
        return {
          field,
          comparableValue: submitted.sourceHash,
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueJson: submitted,
        };
      }
      case FormFieldType.ITEM_ORDER: {
        // Só o formato aqui: itens existentes e ativos, células e o retrato gravado saem da lista
        // no envio — ver ItemOrderFieldService.resolveSubmissionItems. Pedido vazio = sem resposta.
        const submitted = readItemOrderSubmission(item.valueJson);
        if (!submitted || submitted.rows.length > ITEM_ORDER_MAX_ROWS) {
          errors[field.code] = 'Este campo só pode ser preenchido pelo portal web.';
          return null;
        }
        if (submitted.rows.length === 0) return null;
        return {
          field,
          comparableValue: submitted.rows.map((row) => row.key),
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueJson: submitted,
        };
      }
      case FormFieldType.CURRENCY: {
        // Moeda guarda as duas colunas: `value_text` preserva o que a pessoa viu
        // ("R$ 1.500,00") e é o que exportação, planilha e fluxos leem; o
        // `value_number` existe para poder somar e comparar em SQL. Sem ele,
        // campo monetário não entra em nenhum indicador.
        const valueText = normalizeTextValue(item);
        return {
          field,
          comparableValue: valueText,
          valueText,
          valueNumber: valueText !== null ? coerceAnswerToNumber(valueText) : null,
          valueBoolean: null,
          valueJson: null,
        };
      }
      default: {
        const valueText = normalizeTextValue(item);
        return {
          field,
          comparableValue: valueText,
          valueText,
          valueNumber: null,
          valueBoolean: null,
          valueJson: null,
        };
      }
    }
  }

  private validateRules(
    field: FormFieldEntity,
    answer: NormalizedAnswer,
    errors: FieldErrorMap,
  ): void {
    const settings = (field.settingsJson ?? {}) as Record<string, unknown>;
    const valueText = answer.valueText ?? '';
    const valueNumber = answer.valueNumber;
    const optionValues = new Set(field.options?.map((option) => option.internalValue) ?? []);

    switch (field.fieldType) {
      case FormFieldType.EMAIL:
        if (!validateEmail(valueText)) {
          errors[field.code] = 'E-mail inválido.';
        }
        return;
      case FormFieldType.CPF:
        if (!validateCpf(valueText)) {
          errors[field.code] = 'CPF inválido.';
        }
        return;
      case FormFieldType.CNPJ:
        if (!validateCnpj(valueText)) {
          errors[field.code] = 'CNPJ inválido.';
        }
        return;
      case FormFieldType.CEP:
        if (!validateCep(valueText)) {
          errors[field.code] = 'CEP inválido.';
        }
        return;
      case FormFieldType.PHONE:
        if (!validatePhone(valueText)) {
          errors[field.code] = 'Telefone inválido.';
        }
        return;
      case FormFieldType.CURRENCY:
        if (!validateCurrency(valueText)) {
          errors[field.code] = 'Valor monetário inválido.';
        }
        return;
      case FormFieldType.TIME:
        // HH:MM
        if (!/^\d{2}:\d{2}$/.test(valueText)) {
          errors[field.code] = 'Hora inválida. Use o formato HH:MM.';
        }
        return;
      case FormFieldType.DATETIME:
        // YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(valueText)) {
          errors[field.code] = 'Data e hora inválidas. Use o formato YYYY-MM-DDTHH:MM.';
        }
        return;
      case FormFieldType.SHORT_TEXT: {
        const minLength = parseNumberSetting(settings, 'minLength');
        const maxLength = parseNumberSetting(settings, 'maxLength');
        if (minLength !== undefined && valueText.length < minLength) {
          errors[field.code] = `Texto deve ter no mínimo ${minLength} caractere(s).`;
        }
        if (maxLength !== undefined && valueText.length > maxLength) {
          errors[field.code] = `Texto deve ter no máximo ${maxLength} caractere(s).`;
        }
        return;
      }
      case FormFieldType.LONG_TEXT: {
        const maxLength = parseNumberSetting(settings, 'maxLength');
        if (maxLength !== undefined && valueText.length > maxLength) {
          errors[field.code] = `Texto deve ter no máximo ${maxLength} caractere(s).`;
        }
        return;
      }
      case FormFieldType.NUMBER: {
        if (valueNumber === null) {
          return;
        }
        const min = parseNumberSetting(settings, 'min');
        const max = parseNumberSetting(settings, 'max');
        const decimals = parseNumberSetting(settings, 'decimals');

        if (min !== undefined && valueNumber < min) {
          errors[field.code] = `Número deve ser maior ou igual a ${min}.`;
        }
        if (max !== undefined && valueNumber > max) {
          errors[field.code] = `Número deve ser menor ou igual a ${max}.`;
        }
        if (decimals !== undefined) {
          const decimalPlaces = String(valueNumber).split('.')[1]?.length ?? 0;
          if (decimalPlaces > decimals) {
            errors[field.code] = `Número deve ter no máximo ${decimals} casa(s) decimal(is).`;
          }
        }
        return;
      }
      case FormFieldType.SCALE:
      case FormFieldType.RATING: {
        if (valueNumber === null) {
          return;
        }
        const max = parseNumberSetting(settings, 'max') ?? 5;
        if (valueNumber < 1 || valueNumber > max) {
          errors[field.code] = `Valor deve estar entre 1 e ${max}.`;
        }
        return;
      }
      case FormFieldType.SINGLE_SELECT:
        if (!optionValues.has(valueText)) {
          errors[field.code] = 'Opção inválida para este campo.';
        }
        return;
      case FormFieldType.MULTI_SELECT:
        if (
          !Array.isArray(answer.valueJson) ||
          answer.valueJson.some((item) => typeof item !== 'string' || !optionValues.has(item))
        ) {
          errors[field.code] = 'Uma ou mais opções são inválidas.';
        }
        return;
      case FormFieldType.PRODUCT_TABLE: {
        const validProducts = new Set(field.options?.map((option) => option.displayLabel) ?? []);
        const rows = Array.isArray(answer.valueJson)
          ? (answer.valueJson as Array<{ produto?: unknown }>)
          : [];
        if (
          validProducts.size > 0 &&
          rows.some((row) => typeof row.produto !== 'string' || !validProducts.has(row.produto))
        ) {
          errors[field.code] = 'Um ou mais produtos não pertencem à lista configurada.';
        }
        return;
      }
      case FormFieldType.DATE: {
        const minDate = parseStringSetting(settings, 'minDate');
        const maxDate = parseStringSetting(settings, 'maxDate');
        if (minDate && valueText < minDate) {
          errors[field.code] = `Data deve ser a partir de ${minDate}.`;
        }
        if (maxDate && valueText > maxDate) {
          errors[field.code] = `Data deve ser até ${maxDate}.`;
        }
        return;
      }
      case FormFieldType.FILE_UPLOAD: {
        if (!isUploadPayload(answer.valueJson)) {
          return;
        }

        const allowedMimeTypes = Array.isArray(settings.allowedMimeTypes)
          ? settings.allowedMimeTypes.filter((item): item is string => typeof item === 'string')
          : [];
        // Sem limite de tamanho por campo (o antigo maxSizeInBytes é ignorado): só o teto técnico
        // do servidor, conferido no upload.
        if (
          allowedMimeTypes.length > 0 &&
          answer.valueJson.mimeType &&
          !allowedMimeTypes.includes(answer.valueJson.mimeType)
        ) {
          errors[field.code] = 'Tipo de arquivo não permitido.';
        }
        return;
      }
      default:
        return;
    }
  }
}
