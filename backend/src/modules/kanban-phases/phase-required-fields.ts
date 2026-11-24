import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { hasMeaningfulValue } from '../forms/form-definition.utils';

/**
 * Campos obrigatórios da fase: quais estão em branco. A regra vale ao salvar os campos do card e,
 * com a opção `requireFieldsToExit` da fase, ao avançar o card para outra fase. A saída da fase
 * também pode exigir um responsável (`requireAssigneeToExit`): as duas faltas saem numa mensagem só.
 */

/** Campos de fase que só exibem conteúdo: não guardam valor, então nunca são obrigatórios. */
export const PHASE_LAYOUT_FIELD_TYPES: ReadonlySet<string> = new Set([
  FormFieldType.TITLE,
  FormFieldType.DESCRIPTION,
  FormFieldType.DIVIDER,
  FormFieldType.FILE_DOWNLOAD,
]);

type RequiredFieldLike = {
  fieldType: string;
  required: boolean;
};

/** O valor como chega do cliente (item do salvamento) ou como está gravado. */
export type PhaseStoredValueLike = {
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
};

/**
 * Valor que não conta como preenchido. Mesma regra do envio do formulário (hasMeaningfulValue):
 * checkbox precisa estar marcado; texto só com espaços não conta. "Pedido de itens" sem nenhum
 * item (`{ rows: [] }`) é pedido em branco.
 */
export function isPhaseValueEmpty(fieldType: string, value: PhaseStoredValueLike | null | undefined): boolean {
  if (!value) return true;
  if (fieldType === FormFieldType.ITEM_ORDER) {
    const rows = (value.valueJson as { rows?: unknown } | null | undefined)?.rows;
    return !Array.isArray(rows) || rows.length === 0;
  }
  const raw = value.valueText ?? value.valueNumber ?? value.valueBoolean ?? value.valueJson ?? null;
  return !hasMeaningfulValue(raw);
}

/**
 * Obrigatórios em branco, na ordem recebida. Conteúdo de layout (título, descrição, divisor) não
 * tem valor e nunca é cobrado; cálculo não é digitado por ninguém (em branco só quer dizer que
 * faltam os campos dele). Quem chama já tirou os campos fora do caminho do formulário da fase.
 */
export function missingRequiredPhaseFields<F extends RequiredFieldLike>(
  fields: F[],
  valueOf: (field: F) => PhaseStoredValueLike | null | undefined,
): F[] {
  return fields.filter(
    (field) =>
      field.required &&
      !PHASE_LAYOUT_FIELD_TYPES.has(field.fieldType) &&
      field.fieldType !== FormFieldType.CALCULATED &&
      isPhaseValueEmpty(field.fieldType, valueOf(field)),
  );
}

/** O que falta para o card sair da fase. */
export type PhaseExitBlockers = {
  /** Ninguém atribuído e a fase exige responsável. */
  needsAssignee: boolean;
  /** Obrigatórios em branco (só com a trava de campos ligada). */
  missingFields: Array<{ label: string }>;
};

/**
 * Mensagem para o card que não pode avançar: nomeia a fase e tudo o que falta (responsável e cada
 * campo). Nula quando nada falta.
 */
export function phaseExitMessage(phaseLabel: string, blockers: PhaseExitBlockers): string | null {
  const parts: string[] = [];
  if (blockers.needsAssignee) parts.push('atribua um responsável ao card');
  if (blockers.missingFields.length > 0) {
    const labels = blockers.missingFields.map((field) => `"${field.label}"`).join(', ');
    const noun = blockers.missingFields.length === 1 ? 'o campo obrigatório' : 'os campos obrigatórios';
    parts.push(`preencha ${noun}: ${labels}`);
  }
  if (parts.length === 0) return null;
  return `Para sair da fase "${phaseLabel}", ${parts.join(' e ')}.`;
}
