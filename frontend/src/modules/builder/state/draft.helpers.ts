import type { FormDetail } from '../../forms/types';
import {
  applyFieldTypeChoice,
  fieldTypePickerOptions,
  getDefaultFieldSettings,
  sanitizeFieldSettings,
  supportsOptions,
  type DraftField,
  type DraftFieldOption,
  type FieldTypeChoice,
  type FormDraft,
} from '../types';

export function createLocalId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

/** Teto do código gerado a partir de um rótulo/opção — bem abaixo do limite de 120
 * caracteres da coluna no backend (`CreateFormFieldDto.code`, `...OptionDto.internalValue`),
 * sobrando espaço pro sufixo "_2"/"_3" de desambiguação. Sem esse teto, um rótulo longo
 * (rótulo é uma pergunta inteira, não uma palavra — ver AutoGrowLabelInput) virava um
 * código maior que o limite e o formulário simplesmente não salvava, com um erro técnico
 * que não fazia sentido pra quem só editou o texto da pergunta. Também deixa o código mais
 * curto de usar em fórmulas (`{codigo}`) do que a pergunta inteira seria.
 */
const MAX_GENERATED_CODE_LENGTH = 80;

export function toCode(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_GENERATED_CODE_LENGTH)
    .replace(/_+$/g, '');
  return normalized || 'campo';
}

export function createUniqueFieldCode(
  baseLabel: string,
  sections: FormDraft['sections'],
  exceptFieldId?: string,
): string {
  const baseCode = toCode(baseLabel);
  const used = new Set(
    sections.flatMap((s) =>
      s.fields.filter((f) => (exceptFieldId ? f.id !== exceptFieldId : true)).map((f) => f.code),
    ),
  );
  if (!used.has(baseCode)) return baseCode;
  let i = 2;
  while (used.has(`${baseCode}_${i}`)) i++;
  return `${baseCode}_${i}`;
}

export function createUniqueOptionValue(label: string, existing: DraftFieldOption[]): string {
  const baseValue = toCode(label) || 'opcao';
  const used = new Set(existing.map((o) => o.internalValue));
  if (!used.has(baseValue)) return baseValue;
  let i = 2;
  while (used.has(`${baseValue}_${i}`)) i++;
  return `${baseValue}_${i}`;
}

export function createDraftFieldOption(
  label: string,
  existing: DraftFieldOption[] = [],
): DraftFieldOption {
  return {
    id: createLocalId('option'),
    internalValue: createUniqueOptionValue(label, existing),
    displayLabel: label,
  };
}

export function createDraftField(
  sections: FormDraft['sections'],
  choice: FieldTypeChoice,
  required = false,
): DraftField {
  const id = createLocalId('field');
  const label = fieldTypePickerOptions.find((o) => o.value === choice)?.label ?? 'Novo Campo';
  const resolved = applyFieldTypeChoice(choice, null);
  const fieldType = resolved.fieldType;
  // Tipo de verdade: os padrões dele. "Lista suspensa": a seleção já com displayAs.
  const settingsJson = choice === fieldType ? getDefaultFieldSettings(fieldType) : resolved.settingsJson;
  return {
    id,
    code: createUniqueFieldCode(label, sections, id),
    label,
    fieldType,
    required,
    isSensitive: false,
    options: [],
    settingsJson,
    conditionsJson: {},
    visibilityRules: null,
  };
}

export function buildInitialDraft(): FormDraft {
  const sections: FormDraft['sections'] = [];
  const firstField = createDraftField(sections, 'short_text', true);
  return {
    name: '',
    description: '',
    category: '',
    area: '',
    assignedUserIds: [],
    googleSheetsEnabled: false,
    googleSheetsAutoCreateOnSave: false,
    settingsJson: { mode: 'single' },
    sections: [
      {
        id: createLocalId('section'),
        serverId: null,
        title: 'Informações Básicas',
        description: '',
        nextSectionId: null,
        nextIsSubmit: true,
        flowPositionX: null,
        flowPositionY: null,
        branches: [],
        fields: [{ ...firstField, code: 'nome_completo', label: 'Nome Completo' }],
      },
    ],
  };
}

export function mapFormToDraft(form: FormDetail): FormDraft {
  const latest = [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (!latest) return buildInitialDraft();

  const localSectionIdByServerId = new Map(
    latest.sections.map((s) => [s.id, createLocalId('section')]),
  );
  const fieldCodeById = new Map<string, string>();
  const optionValueById = new Map<string, string>();
  for (const s of latest.sections) {
    for (const f of s.fields) {
      fieldCodeById.set(f.id, f.code);
      for (const o of f.options) {
        optionValueById.set(o.id, o.internalValue);
      }
    }
  }
  const resolveLocalSectionId = (serverSectionId: string | null): string | null =>
    serverSectionId ? (localSectionIdByServerId.get(serverSectionId) ?? null) : null;

  const mappedSections = latest.sections.map((s) => ({
    id: localSectionIdByServerId.get(s.id) as string,
    serverId: s.id,
    title: s.title,
    description: s.description ?? '',
    nextSectionId: resolveLocalSectionId(s.nextSectionId),
    nextIsSubmit: s.nextIsSubmit,
    flowPositionX: s.flowPositionX ?? null,
    flowPositionY: s.flowPositionY ?? null,
    branches: s.branches.map((b) => ({
      id: createLocalId('branch'),
      fieldCode: b.fieldId ? (fieldCodeById.get(b.fieldId) ?? null) : null,
      optionValue: b.optionId ? (optionValueById.get(b.optionId) ?? null) : null,
      checkboxValue: b.checkboxValue,
      targetSectionId: resolveLocalSectionId(b.targetSectionId),
      targetIsSubmit: b.targetIsSubmit,
    })),
    fields: s.fields.map((f) => ({
      id: createLocalId('field'),
      code: f.code,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      isSensitive: f.isSensitive ?? false,
      options: supportsOptions(f.fieldType)
        ? f.options.map((o) => ({
            id: o.id,
            internalValue: o.internalValue,
            displayLabel: o.displayLabel,
          }))
        : [],
      settingsJson: sanitizeFieldSettings(f.fieldType, f.settingsJson),
      conditionsJson: f.conditionsJson ?? {},
      visibilityRules: f.visibilityRules ?? null,
    })),
  }));
  return {
    name: form.name,
    description: form.description ?? '',
    category: form.category ?? '',
    area: form.area ?? '',
    assignedUserIds: (form.assignees ?? []).map((user) => user.id),
    googleSheetsEnabled: form.googleSheetsEnabled,
    googleSheetsAutoCreateOnSave: form.googleSheetsAutoCreate,
    settingsJson: latest.settingsJson ?? { mode: 'single' },
    sections: mappedSections.length > 0 ? mappedSections : buildInitialDraft().sections,
  };
}

export function reorderList<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
