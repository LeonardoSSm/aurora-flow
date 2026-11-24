import type { FormDetail } from '../../forms/types';
import type { KanbanPhase, KanbanPhaseCardVisibility, KanbanPhaseCardVisibilityRule } from '../types';

/**
 * Como o valor da regra é escolhido: opções da lista, Sim/Não da caixa, ou texto digitado.
 * Espelha o backend (kanban-phases/phase-card-visibility.ts): a caixa compara "true"/"false"; o
 * resto compara texto sem diferença de maiúsculas.
 */
export type CardFilterFieldKind = 'options' | 'checkbox' | 'text';

export type CardFilterField = {
  code: string;
  label: string;
  kind: CardFilterFieldKind;
  options: Array<{ value: string; label: string }>;
  /** Nome da fase quando o campo é preenchido no card, não no formulário de abertura. */
  phaseLabel?: string;
};

const OPTION_TYPES = new Set(['single_select', 'multi_select']);
const TEXT_TYPES = new Set(['short_text', 'number', 'email', 'cpf', 'cnpj', 'cep', 'phone', 'erp_lookup']);

export const CHECKBOX_OPTIONS = [
  { value: 'true', label: 'Marcado (Sim)' },
  { value: 'false', label: 'Desmarcado (Não)' },
];

function kindOf(fieldType: string): CardFilterFieldKind | null {
  if (OPTION_TYPES.has(fieldType)) return 'options';
  if (fieldType === 'checkbox') return 'checkbox';
  if (TEXT_TYPES.has(fieldType)) return 'text';
  return null;
}

/**
 * Campos que podem decidir quem vê o card: os do formulário (versão mais nova) e depois os das
 * fases; num código repetido o do formulário ganha, como no backend.
 */
export function cardFilterFields(form: FormDetail | undefined, phases: readonly KanbanPhase[]): CardFilterField[] {
  const fields: CardFilterField[] = [];
  const taken = new Set<string>();
  for (const section of form?.versions?.[0]?.sections ?? []) {
    for (const field of section.fields ?? []) {
      const kind = kindOf(field.fieldType);
      if (!kind || taken.has(field.code)) continue;
      taken.add(field.code);
      fields.push({
        code: field.code,
        label: field.label || field.code,
        kind,
        options:
          kind === 'checkbox'
            ? CHECKBOX_OPTIONS
            : (field.options ?? []).map((option) => ({ value: option.internalValue, label: option.displayLabel })),
      });
    }
  }
  for (const phase of phases) {
    for (const field of phase.fields ?? []) {
      const kind = kindOf(field.fieldType);
      if (!kind || taken.has(field.code)) continue;
      taken.add(field.code);
      fields.push({
        code: field.code,
        label: field.label || field.code,
        kind,
        options: kind === 'checkbox' ? CHECKBOX_OPTIONS : (field.optionsJson ?? []),
        phaseLabel: phase.label,
      });
    }
  }
  return fields;
}

export type DraftCardFilterRule = KanbanPhaseCardVisibilityRule & { id: string };

let nextId = 0;
export function newCardFilterRule(fieldCode = ''): DraftCardFilterRule {
  nextId += 1;
  return { id: `rule-${nextId}`, fieldCode, values: [], roleCodes: [], userIds: [] };
}

export function draftFromCardVisibility(
  config: KanbanPhaseCardVisibility | null | undefined,
): { rules: DraftCardFilterRule[]; othersSeeAll: boolean } {
  return {
    rules: (config?.rules ?? []).map((rule) => ({ ...newCardFilterRule(), ...rule })),
    othersSeeAll: config?.othersSeeAll ?? true,
  };
}

/** O que falta na regra para poder gravar (null = pronta). */
export function cardFilterRuleIssue(rule: KanbanPhaseCardVisibilityRule): string | null {
  if (!rule.fieldCode) return 'Escolha o campo.';
  if (rule.values.length === 0) return 'Escolha pelo menos uma resposta.';
  if (rule.roleCodes.length + rule.userIds.length === 0) return 'Escolha pelo menos um perfil ou usuário.';
  return null;
}

export function cardVisibilityPayload(draft: {
  rules: DraftCardFilterRule[];
  othersSeeAll: boolean;
}): KanbanPhaseCardVisibility {
  return {
    rules: draft.rules.map(({ fieldCode, values, roleCodes, userIds }) => ({ fieldCode, values, roleCodes, userIds })),
    othersSeeAll: draft.othersSeeAll,
  };
}

/** Nome da resposta para mostrar (rótulo da opção quando há; senão o próprio valor). */
export function cardFilterValueLabel(field: CardFilterField | undefined, value: string): string {
  return field?.options.find((option) => option.value === value)?.label ?? value;
}
