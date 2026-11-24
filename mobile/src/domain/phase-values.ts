import type { KanbanPhase, KanbanPhaseField, PhaseFieldValue, SavePhaseFieldValueInput } from '../api/types';
import type { FieldModel } from '../fields/FieldControl';
import { isPhaseAttachmentValue } from '../fields/FileFields';
import { isItemOrderAnswer, toItemOrderSubmitValue, type ItemOrderAnswer } from './item-order';
import { phaseCalculatedSettings, PHASE_LAYOUT_TYPES } from './phase-rules';
import { responseItemToUi, type ResponseUi } from './responses';

/** Opções que quem preenche vê (item que saiu da lista ligada fica só para respostas antigas). */
export function selectableOptions(field: KanbanPhaseField): Array<{ value: string; label: string }> {
  const hidden = field.settingsJson?.hiddenOptionValues;
  const options = field.optionsJson ?? [];
  if (!Array.isArray(hidden) || hidden.length === 0) return options;
  return options.filter((option) => !hidden.includes(option.value));
}

export function phaseFieldModel(field: KanbanPhaseField): FieldModel {
  return {
    id: field.id,
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    settings: field.settingsJson ?? {},
    options: selectableOptions(field),
  };
}

/** Valor salvo → valor do campo (espelho de toInputValue do web). */
export function toInputValue(value: PhaseFieldValue, field?: KanbanPhaseField): unknown {
  if (field?.fieldType === 'item_order') {
    const rows = (value.valueJson as { rows?: ItemOrderAnswer['rows'] } | null)?.rows;
    if (!Array.isArray(rows)) return null;
    return { kind: 'item_order', rows: rows.map((row) => ({ key: row.key, answers: { ...row.answers } })) };
  }
  if (value.valueJson !== null && value.valueJson !== undefined) return value.valueJson;
  if (value.valueBoolean !== null) return value.valueBoolean;
  // "Valor (R$)" grava o texto e o número: o campo edita o texto ("R$ 1.500,00").
  if (value.valueText !== null) return value.valueText;
  return value.valueNumber;
}

/** Valor do campo → o que vai no salvar (espelho de toSaveInput do web). */
export function toSaveInput(field: KanbanPhaseField, value: unknown): SavePhaseFieldValueInput {
  const base = { phaseFieldId: field.id, fieldCode: field.code };
  if (field.fieldType === 'item_order') {
    return {
      ...base,
      valueJson: isItemOrderAnswer(value)
        ? toItemOrderSubmitValue({ required: field.required, settingsJson: field.settingsJson }, value)
        : { rows: [] },
    };
  }
  if (field.fieldType === 'file_upload') return { ...base, valueJson: isPhaseAttachmentValue(value) ? value : null };
  if (Array.isArray(value)) return { ...base, valueJson: value };
  if (typeof value === 'boolean') return { ...base, valueBoolean: value };
  if (typeof value === 'number') return { ...base, valueNumber: value };
  if (typeof value === 'string') return { ...base, valueText: value };
  return base;
}

function hasContent(item: PhaseFieldValue): boolean {
  return item.valueText != null || item.valueNumber != null || item.valueBoolean != null || item.valueJson != null;
}

export type PhaseValueRow = { id: string; label: string; ui: ResponseUi };

/**
 * O que já foi preenchido numa fase, para ler: na ordem da fase, com o rótulo da opção, R$ no
 * cálculo e o pedido em tabela. Arquivo aparece como anexo (com a validação da IA), não aqui.
 */
export function phaseValueRows(phase: KanbanPhase, values: PhaseFieldValue[]): PhaseValueRow[] {
  const byField = new Map<string, PhaseFieldValue>();
  for (const item of values) if (item.phaseFieldId) byField.set(item.phaseFieldId, item);
  const rows: PhaseValueRow[] = [];
  for (const field of [...phase.fields].sort((a, b) => a.order - b.order)) {
    if (field.fieldType === 'file_upload' || PHASE_LAYOUT_TYPES.has(field.fieldType)) continue;
    const item = byField.get(field.id);
    if (!item || !hasContent(item)) continue;
    const meta = {
      label: field.label,
      fieldType: field.fieldType,
      options: (field.optionsJson ?? []).map((o, i) => ({ id: `${field.id}_${i}`, internalValue: o.value, displayLabel: o.label, order: i })),
      settingsJson: field.fieldType === 'calculated' ? phaseCalculatedSettings(field.settingsJson) : field.settingsJson,
      sectionId: phase.id,
      sectionTitle: phase.label,
      position: field.order,
    };
    rows.push({ id: field.id, label: field.label, ui: responseItemToUi({ ...item, fieldId: field.id }, meta) });
  }
  return rows;
}
