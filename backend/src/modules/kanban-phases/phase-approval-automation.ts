import { FormFieldType } from '../../common/enums/form-field-type.enum';
import type { FormFieldEntity, KanbanPhaseEntity } from '../../database/entities';

/**
 * Aprovação de fase sem fluxo (colunas `approval_request`, `approval_on_approved` e
 * `approval_on_rejected`): a fase pede a aprovação sozinha e, decidida, move o card ou encerra a
 * solicitação. Aqui só as regras puras; quem age é o PhaseApprovalAutomationListener.
 */

type OrderedPhase = Pick<KanbanPhaseEntity, 'id' | 'order'>;

/** Fase vizinha pela ordem: a próxima (`1`) ou a anterior (`-1`). Nula se não houver. */
export function neighborPhase<T extends OrderedPhase>(
  phases: T[],
  currentId: string,
  direction: 1 | -1,
): T | null {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((phase) => phase.id === currentId);
  if (index < 0) return null;
  return sorted[index + direction] ?? null;
}

/** A 1ª fase (menor ordem): o formulário dela é o de abertura. */
export function isFirstPhase(phases: OrderedPhase[], phaseId: string): boolean {
  const first = [...phases].sort((a, b) => a.order - b.order)[0];
  return first?.id === phaseId;
}

/**
 * Quantos anexos o formulário de abertura ainda precisa receber para estar completo. Os arquivos
 * chegam depois do envio (um POST por arquivo), então o envio sozinho não basta. Conta só os
 * campos de arquivo obrigatórios que com certeza foram mostrados: sem regra de exibição e numa
 * seção em que a pessoa respondeu alguma coisa (ou que só tem arquivos). Campo de arquivo numa
 * ramificação que não foi visitada não segura o pedido.
 */
export function requiredOpeningFileCount(
  fields: Pick<FormFieldEntity, 'id' | 'sectionId' | 'fieldType' | 'required' | 'visibilityRules'>[],
  answeredFieldIds: ReadonlySet<string>,
): number {
  const answeredSections = new Set(
    fields.filter((field) => answeredFieldIds.has(field.id)).map((field) => field.sectionId),
  );
  const sectionsWithOtherFields = new Set(
    fields.filter((field) => field.fieldType !== FormFieldType.FILE_UPLOAD).map((field) => field.sectionId),
  );
  return fields.filter(
    (field) =>
      field.fieldType === FormFieldType.FILE_UPLOAD &&
      field.required &&
      !field.visibilityRules?.length &&
      (answeredSections.has(field.sectionId) || !sectionsWithOtherFields.has(field.sectionId)),
  ).length;
}
