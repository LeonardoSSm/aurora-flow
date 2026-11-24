import type { FieldSettings, FormFieldType } from '../forms/types';

export type StandardQuestionOption = {
  value: string;
  label: string;
};

export type StandardQuestion = {
  id: string;
  formId: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  order: number;
  settingsJson: FieldSettings | null;
  optionsJson: StandardQuestionOption[] | null;
};

// ── Draft shape (client-only id before save) ───────────────────────────────

export type DraftStandardQuestion = {
  id: string;
  serverId: string | null;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  settingsJson: FieldSettings;
  options: StandardQuestionOption[];
};
