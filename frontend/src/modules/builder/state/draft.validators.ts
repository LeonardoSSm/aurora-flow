import { findFormulaCycle, getFormulaDecimals, validateFormulaSource } from '../../forms/formula';
import { isCalculatedField, supportsOptions } from '../types';
import type { FormDraft } from '../types';
import { visibleOptions } from '../../item-lists/linked-options';
import { scoreFieldsProblem, syncScoreFields } from '../lib/score-fields';

export type ValidationErrors = {
  name?: string;
  description?: string;
  sections?: string;
  fields?: string;
  options?: string;
  formula?: string;
};

export function validateDraft(draft: FormDraft): ValidationErrors | null {
  const errors: ValidationErrors = {};

  if (!draft.name.trim()) {
    errors.name = 'Preencha o nome do formulário para salvar.';
  }

  if (!draft.description.trim()) {
    errors.description = 'Adicione uma descrição para facilitar o entendimento do formulário.';
  }

  if (draft.sections.some((s) => !s.title.trim() || s.fields.length === 0)) {
    errors.sections = 'Cada seção precisa de título e ao menos um campo.';
  }

  if (draft.sections.some((s) => s.fields.some((f) => !f.code.trim() || !f.label.trim()))) {
    errors.fields = 'Todos os campos precisam de rótulo válido.';
  }

  // Campos de pontuação valem com a fórmula que o construtor gera para eles.
  const sections = syncScoreFields(draft.sections);
  const allFields = sections.flatMap((s) => s.fields);

  const badOptionsField = allFields.find(
    (f) =>
      supportsOptions(f.fieldType) &&
      !visibleOptions(f.options, f.settingsJson, (option) => option.internalValue).some((option) =>
        option.displayLabel.trim(),
      ),
  );

  if (badOptionsField) {
    errors.options = `O campo "${badOptionsField.label}" precisa de pelo menos uma opção.`;
  }

  const orderWithoutList = allFields.find(
    (f) => f.fieldType === 'item_order' && !f.settingsJson.itemListId,
  );
  if (orderWithoutList && !errors.options) {
    errors.options = `Escolha a lista de itens do campo "${orderWithoutList.label}".`;
  }

  const scoreProblem = scoreFieldsProblem(sections);
  if (scoreProblem) errors.formula = scoreProblem;

  const knownCodes = allFields.map((f) => f.code);
  const calculatedFields = allFields.filter((f) => isCalculatedField(f.fieldType));

  for (const field of errors.formula ? [] : calculatedFields) {
    const message = validateFormulaSource(field.settingsJson.formula ?? '', {
      fieldCode: field.code,
      knownCodes,
    });
    if (message) {
      errors.formula = `Campo "${field.label}": ${message}`;
      break;
    }
  }

  if (!errors.formula) {
    const cycle = findFormulaCycle(
      calculatedFields.map((f) => ({
        code: f.code,
        formula: f.settingsJson.formula ?? '',
        decimals: getFormulaDecimals(f.settingsJson),
      })),
    );
    if (cycle) {
      errors.formula = `Os cálculos ${cycle.map((code) => `"${code}"`).join(' → ')} dependem um do outro em círculo.`;
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

export function firstValidationMessage(errors: ValidationErrors): string {
  return (
    errors.name ??
    errors.description ??
    errors.sections ??
    errors.fields ??
    errors.options ??
    errors.formula ??
    'Corrija os erros antes de salvar.'
  );
}
