type FormFieldMeta = { code: string; label: string; fieldType: string };

export type FieldVariable = { name: string; label: string };

/** Mesmos sufixos do backend (flows/lib/flow-field-values.ts e flow-field-labels.ts). */
const ERP_LOOKUP_CODE_SUFFIX = '_codigo';
const CHOICE_VALUE_SUFFIX = '_valor';

const CHOICE_FIELD_TYPES = new Set(['single_select', 'multi_select']);

/**
 * Variáveis `{{...}}` que um fluxo enxerga a partir dos campos do formulário. Dois tipos dão
 * duas variáveis:
 * - "Lista do ERP": `{{campo}}` com o nome escolhido e `{{campo_codigo}}` com o código no ERP;
 * - seleção: `{{campo}}` com o rótulo da opção e `{{campo_valor}}` com o valor interno — o que
 *   se manda a outro sistema.
 */
export function fieldVariables(fields: readonly FormFieldMeta[]): FieldVariable[] {
  const codes = new Set(fields.map((field) => field.code));
  return fields.flatMap((field) => {
    const own = { name: field.code, label: field.label };
    const extra =
      field.fieldType === 'erp_lookup'
        ? { name: `${field.code}${ERP_LOOKUP_CODE_SUFFIX}`, label: `${field.label} (código no ERP)` }
        : CHOICE_FIELD_TYPES.has(field.fieldType)
          ? { name: `${field.code}${CHOICE_VALUE_SUFFIX}`, label: `${field.label} (valor interno)` }
          : null;
    // Um campo de verdade com esse nome ganha; o backend faz igual.
    if (!extra || codes.has(extra.name)) return [own];
    return [own, extra];
  });
}
