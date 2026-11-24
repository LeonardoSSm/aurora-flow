import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';

export type FieldConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains';

export type FieldConditionRule = {
  fieldCode: string;
  operator: FieldConditionOperator;
  value?: unknown;
};

export type FieldConditionsJson = {
  show_if?: FieldConditionRule[];
};

export type VisibilityConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

export type VisibilityCondition = {
  fieldCode: string;
  operator: VisibilityConditionOperator;
  value?: string | number;
};

export type VisibilityRule = {
  operator: 'and' | 'or';
  conditions: VisibilityCondition[];
  action: 'show' | 'hide';
};

export const DECORATIVE_FIELD_TYPES = new Set<FormFieldType>([
  FormFieldType.TITLE,
  FormFieldType.DESCRIPTION,
  FormFieldType.DIVIDER,
  FormFieldType.FILE_DOWNLOAD,
]);

export const FORM_STATUS_TRANSITIONS: Record<FormStatus, FormStatus[]> = {
  [FormStatus.DRAFT]: [FormStatus.PUBLISHED, FormStatus.ARCHIVED],
  [FormStatus.PUBLISHED]: [FormStatus.PAUSED, FormStatus.EXPIRED, FormStatus.ARCHIVED],
  [FormStatus.PAUSED]: [FormStatus.PUBLISHED, FormStatus.EXPIRED, FormStatus.ARCHIVED],
  [FormStatus.EXPIRED]: [FormStatus.DRAFT, FormStatus.ARCHIVED],
  [FormStatus.ARCHIVED]: [FormStatus.DRAFT],
};

export function isDecorativeFieldType(fieldType: FormFieldType | string): boolean {
  return DECORATIVE_FIELD_TYPES.has(fieldType as FormFieldType);
}

export function canTransitionFormStatus(current: FormStatus, next: FormStatus): boolean {
  return FORM_STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}

export function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return false;
}

export function normalizeComparableValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item));
  }

  return value;
}

export function evaluateFieldConditions(
  conditionsJson: Record<string, unknown> | null | undefined,
  answers: Map<string, unknown>,
): boolean {
  const conditions = conditionsJson as FieldConditionsJson | null | undefined;
  const showIf = Array.isArray(conditions?.show_if) ? conditions.show_if : [];

  if (showIf.length === 0) {
    return true;
  }

  return showIf.every((rule) => {
    const currentValue = normalizeComparableValue(answers.get(rule.fieldCode));
    const expectedValue = normalizeComparableValue(rule.value);

    switch (rule.operator) {
      case 'equals':
        return currentValue === expectedValue;
      case 'not_equals':
        return currentValue !== expectedValue;
      case 'is_empty':
        return !hasMeaningfulValue(currentValue);
      case 'is_not_empty':
        return hasMeaningfulValue(currentValue);
      case 'contains':
        if (typeof currentValue === 'string' && typeof expectedValue === 'string') {
          return currentValue.includes(expectedValue);
        }
        if (Array.isArray(currentValue)) {
          return currentValue.includes(expectedValue);
        }
        return false;
      default:
        return true;
    }
  });
}

function evaluateSingleVisibilityCondition(
  condition: VisibilityCondition,
  answers: Map<string, unknown>,
): boolean {
  const currentValue = normalizeComparableValue(answers.get(condition.fieldCode));
  const expectedValue = normalizeComparableValue(condition.value);

  switch (condition.operator) {
    case 'equals':
      return currentValue === expectedValue;
    case 'not_equals':
      return currentValue !== expectedValue;
    case 'is_empty':
      return !hasMeaningfulValue(currentValue);
    case 'is_not_empty':
      return hasMeaningfulValue(currentValue);
    case 'contains':
      if (typeof currentValue === 'string' && typeof expectedValue === 'string') {
        return currentValue.includes(expectedValue);
      }
      if (Array.isArray(currentValue)) {
        return currentValue.includes(expectedValue);
      }
      return false;
    case 'greater_than':
      return typeof currentValue === 'number' && typeof expectedValue === 'number'
        ? currentValue > expectedValue
        : false;
    case 'less_than':
      return typeof currentValue === 'number' && typeof expectedValue === 'number'
        ? currentValue < expectedValue
        : false;
    default:
      return true;
  }
}

export function evaluateVisibilityRules(
  rules: VisibilityRule[] | null | undefined,
  answers: Map<string, unknown>,
): boolean {
  if (!rules || rules.length === 0) {
    return true;
  }

  for (const rule of rules) {
    const results = rule.conditions.map((c) => evaluateSingleVisibilityCondition(c, answers));
    const conditionsMet = rule.operator === 'or' ? results.some(Boolean) : results.every(Boolean);

    if (rule.action === 'show' && !conditionsMet) {
      return false;
    }
    if (rule.action === 'hide' && conditionsMet) {
      return false;
    }
  }

  return true;
}

type OrphanCheckSection = {
  id: string;
  nextSectionId: string | null;
  nextIsSubmit: boolean;
  branches: Array<{
    fieldId: string | null;
    optionId: string | null;
    checkboxValue: boolean | null;
    targetSectionId: string | null;
    targetIsSubmit: boolean;
  }>;
  fields: Array<{ id: string; options: Array<{ id: string }> }>;
};

/**
 * True if any section's fallback or branch points at a field/option/section that
 * no longer exists — mirrors the frontend's section-flow-layout.ts orphan check,
 * used to block publishing a form with a dangling flow rule.
 */
export function hasOrphanedSectionRules(sections: OrphanCheckSection[]): boolean {
  const sectionIds = new Set(sections.map((s) => s.id));
  const optionIdsByFieldId = new Map<string, Set<string>>();
  for (const section of sections) {
    for (const field of section.fields) {
      optionIdsByFieldId.set(field.id, new Set(field.options.map((o) => o.id)));
    }
  }

  for (const section of sections) {
    // Anything other than an explicit `false` is treated as "submit" — matches the
    // column's DB default and keeps legacy rows/mocks without the field from being
    // misreported as orphaned.
    if (
      section.nextIsSubmit === false &&
      (!section.nextSectionId || !sectionIds.has(section.nextSectionId))
    ) {
      return true;
    }

    for (const branch of section.branches ?? []) {
      if (!branch.fieldId || !optionIdsByFieldId.has(branch.fieldId)) return true;
      if (branch.optionId === null && branch.checkboxValue === null) return true;
      if (branch.optionId && !optionIdsByFieldId.get(branch.fieldId)?.has(branch.optionId)) {
        return true;
      }
      if (
        branch.targetIsSubmit === false &&
        (!branch.targetSectionId || !sectionIds.has(branch.targetSectionId))
      ) {
        return true;
      }
    }
  }

  return false;
}
