import type {
  FieldConditions,
  FieldSettings,
  FormFieldType,
  FormVersionSettings,
  VisibilityRule,
} from '../../forms/types';
import {
  sanitizeFieldSettings,
  supportsOptions,
  type DraftField,
  type DraftFieldOption,
  type DraftSectionBranch,
  type FieldTypeChoice,
  type FormDraft,
} from '../types';
import {
  buildInitialDraft,
  createDraftField,
  createLocalId,
  createUniqueFieldCode,
  reorderList,
} from './draft.helpers';
import type { ValidationErrors } from './draft.validators';
import { organizeSectionFlow } from '../lib/section-flow-layout';

/**
 * "Pontuação da seção" nasce com o nome da seção ("Pontuação (%) — Água e Alimentação"): várias no
 * mesmo formulário não ficam com o mesmo nome em respostas, painéis e exportação.
 */
function withSectionScoreName(
  field: DraftField,
  choice: FieldTypeChoice | undefined,
  sectionTitle: string,
  sections: FormDraft['sections'],
): DraftField {
  const title = sectionTitle.trim();
  if (choice !== 'section_score' || !title) return field;
  const label = `Pontuação (%) — ${title}`;
  return { ...field, label, code: createUniqueFieldCode(label, sections, field.id) };
}

/**
 * Trocar o rótulo regera o código do campo. A "Tabela dinâmica do ERP" guarda o parâmetro →
 * campo pelo código: sem isto, renomear o campo do parâmetro deixava a tabela apontando para um
 * código que não existe mais, e o erro só aparecia ao publicar.
 */
function followRenamedFieldCode(
  before: FormDraft['sections'],
  fieldId: string,
  after: FormDraft['sections'],
): FormDraft['sections'] {
  const codeOf = (sections: FormDraft['sections']) =>
    sections.flatMap((s) => s.fields).find((f) => f.id === fieldId)?.code;
  const oldCode = codeOf(before);
  const newCode = codeOf(after);
  if (!oldCode || !newCode || oldCode === newCode) return after;

  return after.map((s) =>
    s.fields.some((f) =>
      f.settingsJson.parameterBindings?.some((binding) => binding.fieldCode === oldCode),
    )
      ? {
          ...s,
          fields: s.fields.map((f) =>
            f.settingsJson.parameterBindings?.some((binding) => binding.fieldCode === oldCode)
              ? {
                  ...f,
                  settingsJson: {
                    ...f.settingsJson,
                    parameterBindings: f.settingsJson.parameterBindings.map((binding) =>
                      binding.fieldCode === oldCode ? { ...binding, fieldCode: newCode } : binding,
                    ),
                  },
                }
              : f,
          ),
        }
      : s,
  );
}

export type BuilderMode = 'create' | 'edit';

export type BuilderState = {
  draft: FormDraft;
  mode: BuilderMode;
  selectedSectionId: string | null;
  selectedFieldId: string | null;
  isDirty: boolean;
  validationErrors: ValidationErrors | null;
};

export type BuilderAction =
  | { type: 'SET_DRAFT'; payload: FormDraft; mode?: BuilderMode }
  | { type: 'RESET_DRAFT' }
  | { type: 'SET_DRAFT_FIELD'; key: keyof FormDraft; value: FormDraft[keyof FormDraft] }
  /** `sectionId`/`fieldId` opcionais: quem dispara já sabe o id do que foi criado. */
  | { type: 'ADD_SECTION'; sectionId?: string }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | {
      type: 'UPDATE_SECTION';
      sectionId: string;
      key: 'title' | 'description';
      value: string;
    }
  | {
      type: 'SET_SECTION_FLOW';
      sectionId: string;
      nextSectionId: string | null;
      nextIsSubmit: boolean;
      branches: DraftSectionBranch[];
    }
  | { type: 'SET_SECTION_FLOW_POSITION'; sectionId: string; x: number; y: number }
  /** Botão "Organizar" do mapa: todas as seções reposicionadas de uma vez. */
  | { type: 'ORGANIZE_SECTION_FLOW' }
  | { type: 'REORDER_SECTIONS'; fromIndex: number; toIndex: number }
  | { type: 'ADD_FIELD'; sectionId: string; fieldType?: FieldTypeChoice; fieldId?: string }
  | {
      type: 'UPDATE_FIELD';
      sectionId: string;
      fieldId: string;
      key: keyof DraftField;
      value:
        | string
        | boolean
        | FormFieldType
        | FieldSettings
        | FieldConditions
        | FormVersionSettings
        | VisibilityRule[]
        | DraftFieldOption[]
        | null;
    }
  | { type: 'REMOVE_FIELD'; sectionId: string; fieldId: string }
  /** Cópia do campo logo abaixo dele, com código único. `newFieldId`: id da cópia (opcional). */
  | { type: 'DUPLICATE_FIELD'; sectionId: string; fieldId: string; newFieldId?: string }
  | { type: 'MOVE_FIELD'; sectionId: string; fromIndex: number; toIndex: number }
  | { type: 'SELECT_SECTION'; sectionId: string | null }
  | { type: 'SELECT_FIELD'; fieldId: string | null }
  | { type: 'SET_VALIDATION_ERRORS'; errors: ValidationErrors | null }
  | { type: 'MARK_DIRTY'; isDirty: boolean };

export function makeInitialState(): BuilderState {
  return {
    draft: buildInitialDraft(),
    mode: 'create',
    selectedSectionId: null,
    selectedFieldId: null,
    isDirty: false,
    validationErrors: null,
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_DRAFT':
      return {
        ...state,
        draft: action.payload,
        mode: action.mode ?? 'edit',
        isDirty: false,
        validationErrors: null,
      };

    case 'RESET_DRAFT':
      return {
        ...state,
        draft: buildInitialDraft(),
        mode: 'create',
        selectedSectionId: null,
        selectedFieldId: null,
        isDirty: false,
        validationErrors: null,
      };

    case 'SET_DRAFT_FIELD':
      return {
        ...state,
        draft: { ...state.draft, [action.key]: action.value },
        isDirty: true,
      };

    case 'ADD_SECTION': {
      const newField = createDraftField(state.draft.sections, 'short_text');
      const newSection = {
        id: action.sectionId ?? `section_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`,
        serverId: null,
        title: `Nova Seção ${state.draft.sections.length + 1}`,
        description: '',
        nextSectionId: null,
        nextIsSubmit: true,
        flowPositionX: null,
        flowPositionY: null,
        branches: [],
        fields: [newField],
      };
      return {
        ...state,
        draft: { ...state.draft, sections: [...state.draft.sections, newSection] },
        isDirty: true,
      };
    }

    case 'REMOVE_SECTION': {
      if (state.draft.sections.length <= 1) return state;
      const removedId = action.sectionId;
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections
            .filter((s) => s.id !== removedId)
            .map((s) => ({
              ...s,
              nextSectionId: s.nextSectionId === removedId ? null : s.nextSectionId,
              branches: s.branches.map((b) =>
                b.targetSectionId === removedId ? { ...b, targetSectionId: null } : b,
              ),
            })),
        },
        isDirty: true,
      };
    }

    case 'UPDATE_SECTION':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) =>
            s.id === action.sectionId ? { ...s, [action.key]: action.value } : s,
          ),
        },
        isDirty: true,
      };

    case 'SET_SECTION_FLOW':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) =>
            s.id === action.sectionId
              ? {
                  ...s,
                  nextSectionId: action.nextSectionId,
                  nextIsSubmit: action.nextIsSubmit,
                  branches: action.branches,
                }
              : s,
          ),
        },
        isDirty: true,
      };

    case 'SET_SECTION_FLOW_POSITION':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) =>
            s.id === action.sectionId
              ? { ...s, flowPositionX: action.x, flowPositionY: action.y }
              : s,
          ),
        },
        isDirty: true,
      };

    case 'ORGANIZE_SECTION_FLOW': {
      const positions = organizeSectionFlow(state.draft.sections);
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) => {
            const position = positions.get(s.id);
            return position ? { ...s, flowPositionX: position.x, flowPositionY: position.y } : s;
          }),
        },
        isDirty: true,
      };
    }

    case 'REORDER_SECTIONS':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: reorderList(state.draft.sections, action.fromIndex, action.toIndex),
        },
        isDirty: true,
      };

    case 'ADD_FIELD':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) =>
            s.id !== action.sectionId
              ? s
              : {
                  ...s,
                  fields: [
                    ...s.fields,
                    withSectionScoreName(
                      {
                        ...createDraftField(state.draft.sections, action.fieldType ?? 'short_text'),
                        ...(action.fieldId ? { id: action.fieldId } : {}),
                      },
                      action.fieldType,
                      s.title,
                      state.draft.sections,
                    ),
                  ],
                },
          ),
        },
        isDirty: true,
      };

    case 'UPDATE_FIELD':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: followRenamedFieldCode(state.draft.sections, action.fieldId, state.draft.sections.map((s) =>
            s.id !== action.sectionId
              ? s
              : {
                  ...s,
                  fields: s.fields.map((f) => {
                    if (f.id !== action.fieldId) return f;
                    if (action.key === 'label' && typeof action.value === 'string') {
                      return {
                        ...f,
                        label: action.value,
                        code: createUniqueFieldCode(
                          action.value,
                          state.draft.sections,
                          action.fieldId,
                        ),
                      };
                    }
                    if (action.key === 'fieldType' && typeof action.value === 'string') {
                      const nextType = action.value as FormFieldType;
                      return {
                        ...f,
                        fieldType: nextType,
                        required: ['title', 'description', 'divider', 'file_download'].includes(nextType)
                          ? false
                          : f.required,
                        options: supportsOptions(nextType) ? f.options : [],
                        settingsJson: sanitizeFieldSettings(nextType, f.settingsJson),
                      };
                    }
                    return { ...f, [action.key]: action.value };
                  }),
                },
          )),
        },
        isDirty: true,
      };

    case 'REMOVE_FIELD':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) => {
            if (s.id !== action.sectionId || s.fields.length <= 1) return s;
            return { ...s, fields: s.fields.filter((f) => f.id !== action.fieldId) };
          }),
        },
        isDirty: true,
      };

    case 'DUPLICATE_FIELD': {
      const section = state.draft.sections.find((s) => s.id === action.sectionId);
      const index = section?.fields.findIndex((f) => f.id === action.fieldId) ?? -1;
      if (!section || index < 0) return state;
      const original = section.fields[index];
      const copy: DraftField = {
        ...structuredClone(original),
        id: action.newFieldId ?? createLocalId('field'),
        code: createUniqueFieldCode(original.label, state.draft.sections),
        // Opções novas (id local): a cópia não herda o vínculo com opções já salvas.
        options: original.options.map((option) => ({ ...option, id: createLocalId('option') })),
      };
      const fields = [...section.fields];
      fields.splice(index + 1, 0, copy);
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) => (s.id === action.sectionId ? { ...s, fields } : s)),
        },
        isDirty: true,
      };
    }

    case 'MOVE_FIELD':
      return {
        ...state,
        draft: {
          ...state.draft,
          sections: state.draft.sections.map((s) =>
            s.id !== action.sectionId
              ? s
              : { ...s, fields: reorderList(s.fields, action.fromIndex, action.toIndex) },
          ),
        },
        isDirty: true,
      };

    case 'SELECT_SECTION':
      return { ...state, selectedSectionId: action.sectionId };

    case 'SELECT_FIELD':
      return { ...state, selectedFieldId: action.fieldId };

    case 'SET_VALIDATION_ERRORS':
      return { ...state, validationErrors: action.errors };

    case 'MARK_DIRTY':
      return { ...state, isDirty: action.isDirty };

    default:
      return state;
  }
}
